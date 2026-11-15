'use strict';

const {
  billRepository,
  patientRepository,
  careLogRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const rules = require('../utils/billingRules');
const { withTransaction } = require('../utils/transaction');
const { BILL_STATUS, NOTIFICATION_TYPE } = require('../utils/constants');
const { getPaymentProvider, availableMethods } = require('./providers');
const cacheService = require('./cacheService');
const notificationService = require('./notificationService');
const { PaymentService } = require('./paymentService');

const { CACHE_PREFIX } = rules;

/** Invoice lifecycle and finance reads. Totals are derived by the Bill model on save, never here. */
class BillingService {
  constructor({
    bills = billRepository,
    patients = patientRepository,
    careLogs = careLogRepository,
    notifications = notificationService,
    cache = cacheService,
    resolveProvider = getPaymentProvider,
    payments = new PaymentService({ bills, patients, notifications, cache, resolveProvider }),
  } = {}) {
    this.bills = bills;
    this.patients = patients;
    this.careLogs = careLogs;
    this.notifications = notifications;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
    this.payments = payments;
  }

  // --- Reads ----------------------------------------------------------------

  list(query = {}, actor) {
    rules.assertBillingStaff(actor);
    const filter = { ...this.bills.searchFilter(query.search) };
    if (query.status) filter.status = query.status;
    if (query.patientId) filter.patient = query.patientId;
    if (query.overdue === true || query.overdue === 'true') {
      filter.dueDate = { $lt: new Date() };
      // An explicit status wins: "overdue and part-paid" is a real question.
      if (!query.status) {
        filter.status = { $in: [BILL_STATUS.UNPAID, BILL_STATUS.PARTIALLY_PAID] };
      }
    }
    return this.bills.paginate(filter, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber user' },
    });
  }

  // Staff tier, not the clinical one: an accountant who can't see a diagnosis must still chase the invoice.
  async listForPatient(patientId, actor, query = {}) {
    const patient = await this._requirePatient(patientId);
    this._assertCanRead(patient, actor);
    return this.bills.listForPatient(patient._id, query);
  }

  async getById(billId, actor) {
    const bill = await this.bills.findByIdOrThrow(billId, 'Bill', {
      populate: { path: 'patient', select: 'medicalRecordNumber user ward' },
    });
    this._assertCanRead(bill.patient, actor);
    return bill;
  }

  async getByInvoiceNumber(invoiceNumber, actor) {
    rules.assertBillingStaff(actor);
    const bill = await this.bills.findByInvoiceNumber(invoiceNumber);
    if (!bill) throw ApiError.notFound('Bill');
    return bill;
  }

  outstanding(query = {}, actor) {
    rules.assertBillingStaff(actor);
    return this.bills.outstanding(query);
  }

  // Cached 5 min: a whole-collection aggregation on a dashboard several managers keep open.
  async revenue({ from, to } = {}, actor) {
    rules.assertBillingStaff(actor);
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid date range');
    }
    if (start >= end) throw ApiError.badRequest('`from` must be earlier than `to`');

    const rows = await this.cache.wrap(
      this.ns.key('revenue', { from: start.toISOString(), to: end.toISOString() }),
      () => this.bills.revenueBetween(start, end),
      300
    );

    const summary = {
      from: start,
      to: end,
      billedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      count: 0,
      byStatus: {},
    };
    for (const row of rows) {
      summary.byStatus[row._id] = {
        billedCents: row.billedCents,
        collectedCents: row.collectedCents,
        count: row.count,
      };
      summary.billedCents += row.billedCents;
      summary.collectedCents += row.collectedCents;
      summary.count += row.count;
    }
    summary.outstandingCents = summary.billedCents - summary.collectedCents;
    return summary;
  }

  // Built from what this deployment can actually charge, so there is never a button that only 503s.
  paymentMethods() {
    return availableMethods();
  }

  // --- Invoicing ------------------------------------------------------------

  // A draft stays off the patient's list and sends no notification until someone issues it.
  async create(payload = {}, actor) {
    rules.assertBillingStaff(actor);
    const patient = await this._requirePatient(payload.patientId);
    const items = this._normaliseItems(payload.items);

    const bill = await this.bills.create({
      patient: patient._id,
      items,
      taxCents: rules.minorUnits(payload.taxCents, 'taxCents') || 0,
      discountCents: rules.minorUnits(payload.discountCents, 'discountCents') || 0,
      currency: payload.currency,
      status: payload.isDraft ? BILL_STATUS.DRAFT : BILL_STATUS.UNPAID,
      dueDate: payload.dueDate,
      notes: payload.notes,
      issuedBy: actor.id,
    });

    await this.ns.invalidate();
    if (bill.status !== BILL_STATUS.DRAFT) this._announce(patient, bill);

    logger.info('Bill created', {
      billId: String(bill._id),
      invoiceNumber: bill.invoiceNumber,
      totalCents: bill.totalCents,
      patientId: String(patient._id),
    });
    return bill.toJSON();
  }

  /**
   * Sweeps unbilled nursing services onto one bill.`markBilled` stamps each care log with the
   * invoice id and the sweep filters on `bill: null`, so the stamp is the idempotency.
   */
  async buildFromCare(patientId, actor, options = {}) {
    rules.assertBillingStaff(actor);
    const patient = await this._requirePatient(patientId);

    const logs = await this.careLogs.unbilledServices(patient._id);
    if (!logs.length) {
      throw ApiError.badRequest('There are no unbilled services for this patient', {
        code: 'NOTHING_TO_BILL',
      });
    }

    const items = logs.map((log) => ({
      description: log.service.name,
      code: log.service.category,
      quantity: 1,
      unitPriceCents: log.service.chargeableCents,
    }));
    const logIds = logs.map((log) => log._id);

    const bill = await withTransaction(async (session) => {
      const created = await this.bills.create(
        {
          patient: patient._id,
          items,
          taxCents: rules.minorUnits(options.taxCents, 'taxCents') || 0,
          discountCents: rules.minorUnits(options.discountCents, 'discountCents') || 0,
          status: options.isDraft ? BILL_STATUS.DRAFT : BILL_STATUS.UNPAID,
          dueDate: options.dueDate,
          notes: options.notes,
          issuedBy: actor.id,
        },
        { session }
      );

      try {
        await this.careLogs.markBilled(logIds, created._id, { session });
      } catch (error) {
        if (!session) {
          await this.bills
            .deleteById(created._id)
            .catch((cleanupError) =>
              logger.error('Failed to remove bill after care-log sweep failure', {
                billId: String(created._id),
                error: cleanupError.message,
              })
            );
        }
        throw error;
      }

      return created;
    });

    await this.ns.invalidate();
    if (bill.status !== BILL_STATUS.DRAFT) this._announce(patient, bill);

    logger.info('Bill built from care logs', {
      billId: String(bill._id),
      services: logIds.length,
      totalCents: bill.totalCents,
    });
    return bill.toJSON();
  }

  // Refused once paid against: adding a charge would silently reopen a paid bill as part-paid.
  async addItems(billId, items, actor) {
    rules.assertBillingStaff(actor);
    const lines = this._normaliseItems(items);

    const bill = await this._loadOpenBill(billId);
    if (bill.paidCents > 0) {
      throw ApiError.conflict('This bill has already been paid against — issue a separate one', {
        code: 'BILL_HAS_PAYMENTS',
      });
    }

    bill.items.push(...lines);
    await bill.save();
    await this.ns.invalidate();

    logger.info('Bill items added', { billId: String(billId), added: lines.length });
    return bill.toJSON();
  }

  // Items are replaced wholesale (a partial edit of a priced list is ambiguous);
  // derived fields and invoiceNumber are deliberately not patchable.
  async update(billId, patch = {}, actor) {
    rules.assertBillingStaff(actor);
    const bill = await this._loadOpenBill(billId);
    if (bill.paidCents > 0 && (patch.items || patch.discountCents !== undefined)) {
      throw ApiError.conflict('The amount owed cannot change once a payment has been taken', {
        code: 'BILL_HAS_PAYMENTS',
      });
    }

    let touched = false;
    if (patch.items !== undefined) {
      bill.items = this._normaliseItems(patch.items);
      touched = true;
    }
    for (const field of ['taxCents', 'discountCents']) {
      if (patch[field] !== undefined) {
        bill[field] = rules.minorUnits(patch[field], field);
        touched = true;
      }
    }
    for (const field of ['dueDate', 'notes']) {
      if (patch[field] !== undefined) {
        bill[field] = patch[field];
        touched = true;
      }
    }
    if (!touched) throw ApiError.badRequest('No updatable fields supplied');

    await bill.save();
    await this.ns.invalidate();
    return bill.toJSON();
  }

  // Draft → unpaid: the moment the patient is told they owe something.
  async issue(billId, actor) {
    rules.assertBillingStaff(actor);
    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    if (bill.status !== BILL_STATUS.DRAFT) {
      throw ApiError.conflict('Only a draft bill can be issued', { code: 'NOT_A_DRAFT' });
    }

    bill.status = BILL_STATUS.UNPAID;
    await bill.save();
    await this.ns.invalidate();

    const patient = await this._requirePatient(bill.patient);
    this._announce(patient, bill);

    logger.info('Bill issued', { billId: String(billId), invoiceNumber: bill.invoiceNumber });
    return bill.toJSON();
  }

  // Never a delete: an issued invoice must stay findable by number. Refund first so the reversal is on record.
  async voidBill(billId, reason, actor) {
    rules.assertBillingStaff(actor);
    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    if (bill.status === BILL_STATUS.VOID) return bill.toJSON();
    if (bill.paidCents > 0) {
      throw ApiError.conflict('Refund the payments before voiding this bill', {
        code: 'BILL_HAS_PAYMENTS',
      });
    }

    bill.status = BILL_STATUS.VOID;
    if (reason) bill.notes = [bill.notes, `Voided: ${reason}`].filter(Boolean).join('\n').slice(0, 1000);
    await bill.save();
    await this.ns.invalidate();

    logger.warn('Bill voided', {
      billId: String(billId),
      invoiceNumber: bill.invoiceNumber,
      by: String(actor.id),
      reason,
    });
    return bill.toJSON();
  }

  // --- Collection (delegated) -----------------------------------------------

  pay(billId, payload, actor) {
    return this.payments.pay(billId, payload, actor);
  }

  refund(billId, payload, actor) {
    return this.payments.refund(billId, payload, actor);
  }

  // --- internals ------------------------------------------------------------

  async _requirePatient(patientId) {
    if (!patientId) throw ApiError.badRequest('A patient is required');
    const patient = await this.patients.findByIdOrThrow(patientId, 'Patient', {
      projection: 'user medicalRecordNumber ward primaryDoctor assignedNurses',
    });
    return patient;
  }

  // The patient reads their own invoices; anyone else must be an employee.
  _assertCanRead(patient, actor) {
    if (accessPolicy.isSelf(actor, patient)) return;
    if (accessPolicy.isStaff(actor && actor.role)) return;
    throw ApiError.forbidden('You do not have access to this bill');
  }

  async _loadOpenBill(billId) {
    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    if (bill.status === BILL_STATUS.VOID) {
      throw ApiError.conflict('A voided bill cannot be modified', { code: 'BILL_VOID' });
    }
    return bill;
  }

  _normaliseItems(items) {
    if (!Array.isArray(items) || !items.length) {
      throw ApiError.badRequest('A bill needs at least one line item');
    }
    return items.map((item, index) => {
      if (!item || !item.description) {
        throw ApiError.badRequest(`Line ${index + 1} needs a description`);
      }
      const unitPriceCents = rules.minorUnits(item.unitPriceCents, `items[${index}].unitPriceCents`);
      if (unitPriceCents === undefined) {
        throw ApiError.badRequest(`Line ${index + 1} needs a unit price`);
      }
      const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw ApiError.badRequest(`Line ${index + 1} needs a whole quantity of at least 1`);
      }
      return { description: item.description, code: item.code, quantity, unitPriceCents };
    });
  }

  // Never fails the caller.
  _announce(patient, bill) {
    if (!patient.user) return;
    this.notifications
      .notify({
        recipient: patient.user,
        title: 'New invoice',
        message: `Invoice ${bill.invoiceNumber} for ${rules.formatMoney(bill.totalCents, bill.currency)} is ready.`,
        type: NOTIFICATION_TYPE.BILLING,
        data: { billId: String(bill._id), invoiceNumber: bill.invoiceNumber },
      })
      .catch((error) => logger.error('Invoice notification failed', { error: error.message }));
  }
}

module.exports = new BillingService();
module.exports.BillingService = BillingService;
