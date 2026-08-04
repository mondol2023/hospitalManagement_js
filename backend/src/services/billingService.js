'use strict';

const {
  billRepository,
  patientRepository,
  careLogRepository,
} = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { withTransaction } = require('../utils/transaction');
const { BILL_STATUS, ROLES, NOTIFICATION_TYPE } = require('../utils/constants');
const {
  getPaymentProvider,
  availableMethods,
  PAYMENT_RESULT,
} = require('./providers');
const cacheService = require('./cacheService');
const { buildKey } = require('./cacheService');
const notificationService = require('./notificationService');

const CACHE_PREFIX = 'billing';
/** How many times a payment will re-attempt persistence against fresh state. */
const SAVE_ATTEMPTS = 3;

/** Roles that may touch money. Clinicians treat patients; they do not invoice them. */
const BILLING_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.ACCOUNTANT,
  ROLES.RECEPTIONIST,
]);

/**
 * Invoicing, collection and reconciliation.
 *
 * `Bill` was another orphaned model — declared, indexed, and reachable from
 * nothing. This is the layer that makes it a feature, and it is written around
 * three rules that the original schema could not express:
 *
 * 1. **The service never computes a total.** Every figure on a bill is derived by
 *    the model's pre-validate hook from the line items that justify it, which is
 *    why payments load a hydrated document and `save()` rather than `$push`. A
 *    `$push` would append the payment and leave `paidCents`, `status` and the
 *    overpayment guard behind on stale values.
 * 2. **The gateway is never named here.** `getPaymentProvider(method)` returns
 *    something that satisfies the `PaymentProvider` contract, so cash, card,
 *    insurance and Stripe all take the identical path through this file. Dropping
 *    in a live Stripe key changes no code in this service.
 * 3. **Money moves before it is recorded, so recording must not be able to fail
 *    silently.** The charge is authorised first (a persisted payment for a
 *    declined card would be fiction), and if persistence then fails the charge is
 *    reversed and the failure logged at error level with both references.
 *
 * Reads are open to the patient for their own invoices; everything that moves
 * money is restricted to the billing roles.
 */
class BillingService {
  constructor({
    bills = billRepository,
    patients = patientRepository,
    careLogs = careLogRepository,
    notifications = notificationService,
    cache = cacheService,
    resolveProvider = getPaymentProvider,
  } = {}) {
    this.bills = bills;
    this.patients = patients;
    this.careLogs = careLogs;
    this.notifications = notifications;
    this.cache = cache;
    this.resolveProvider = resolveProvider;
  }

  // --- Reads ----------------------------------------------------------------

  /** The finance desk's worklist. */
  list(query = {}, actor) {
    this._assertBillingStaff(actor);
    const filter = { ...this.bills.searchFilter(query.search) };
    if (query.status) filter.status = query.status;
    if (query.patientId) filter.patient = query.patientId;
    if (query.overdue === true || query.overdue === 'true') {
      filter.dueDate = { $lt: new Date() };
      // An explicit status wins — "overdue and part-paid" is a real question.
      if (!query.status) {
        filter.status = { $in: [BILL_STATUS.UNPAID, BILL_STATUS.PARTIALLY_PAID] };
      }
    }
    return this.bills.paginate(filter, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber user' },
    });
  }

  /**
   * A patient's invoices. Self-service, so the patient is allowed through; every
   * other reader has to be an employee.
   *
   * Note the tier: this is `isStaff`, not the clinical read tier used by the
   * chart. A bill is a financial document, and an accountant who may never see a
   * diagnosis must still be able to chase the invoice for it.
   */
  async listForPatient(patientId, actor, query = {}) {
    const patient = await this._requirePatient(patientId);
    this._assertCanRead(patient, actor);
    return this.bills.listForPatient(patient._id, query);
  }

  async getById(billId, actor) {
    const bill = await this.bills.findById(billId, {
      populate: { path: 'patient', select: 'medicalRecordNumber user ward' },
    });
    if (!bill) throw ApiError.notFound('Bill');
    this._assertCanRead(bill.patient, actor);
    return bill;
  }

  /** Lookup by the number printed on the invoice — how the front desk finds it. */
  async getByInvoiceNumber(invoiceNumber, actor) {
    this._assertBillingStaff(actor);
    const bill = await this.bills.findByInvoiceNumber(invoiceNumber);
    if (!bill) throw ApiError.notFound('Bill');
    return bill;
  }

  /** Unpaid and part-paid, for the collections run. */
  outstanding(query = {}, actor) {
    this._assertBillingStaff(actor);
    return this.bills.outstanding(query);
  }

  /**
   * Billed vs collected over a period, split by status.
   *
   * Cached for five minutes: it is an aggregation over the whole collection
   * rendered on a dashboard that several managers keep open, and finance figures
   * that trail reality by minutes are not a problem — figures that cost a
   * collection scan per page view are.
   */
  async revenue({ from, to } = {}, actor) {
    this._assertBillingStaff(actor);
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid date range');
    }
    if (start >= end) throw ApiError.badRequest('`from` must be earlier than `to`');

    const rows = await this.cache.wrap(
      buildKey(`${CACHE_PREFIX}:revenue`, { from: start.toISOString(), to: end.toISOString() }),
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

  /**
   * Which methods this deployment can actually take money through.
   *
   * The payment form is built from this rather than from the enum, so a
   * deployment with no Stripe key never offers a button that can only 503.
   */
  paymentMethods() {
    return availableMethods();
  }

  // --- Invoicing ------------------------------------------------------------

  /**
   * Raises an invoice.
   *
   * Created as a draft when asked, because a bill assembled over the course of an
   * admission should not appear on the patient's outstanding list — or trigger a
   * notification — until somebody has decided it is complete.
   */
  async create(payload = {}, actor) {
    this._assertBillingStaff(actor);
    const patient = await this._requirePatient(payload.patientId);
    const items = this._normaliseItems(payload.items);

    const bill = await this.bills.create({
      patient: patient._id,
      items,
      taxCents: this._minorUnits(payload.taxCents, 'taxCents') || 0,
      discountCents: this._minorUnits(payload.discountCents, 'discountCents') || 0,
      currency: payload.currency,
      status: payload.isDraft ? BILL_STATUS.DRAFT : BILL_STATUS.UNPAID,
      dueDate: payload.dueDate,
      notes: payload.notes,
      issuedBy: actor.id,
    });

    await this._invalidate();
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
   * Sweeps every chargeable nursing service that has not been invoiced yet onto a
   * single bill.
   *
   * This is the link between the bedside and the ledger: a nurse logging a dressing
   * change with `chargeableCents` set is the only place that charge is ever
   * entered, and this drains those entries. `markBilled` stamps each care log with
   * the invoice id, which is what stops the next sweep double-billing it —
   * the filter is `bill: null`, so the stamp *is* the idempotency.
   *
   * The bill and the stamps commit together where the deployment supports
   * transactions. Where it does not, a failed stamp deletes the freshly created
   * bill by hand: an invoice whose care logs were never marked would be re-created
   * in full by the next sweep, and the patient would be billed twice.
   */
  async buildFromCare(patientId, actor, options = {}) {
    this._assertBillingStaff(actor);
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
          taxCents: this._minorUnits(options.taxCents, 'taxCents') || 0,
          discountCents: this._minorUnits(options.discountCents, 'discountCents') || 0,
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

    await this._invalidate();
    if (bill.status !== BILL_STATUS.DRAFT) this._announce(patient, bill);

    logger.info('Bill built from care logs', {
      billId: String(bill._id),
      services: logIds.length,
      totalCents: bill.totalCents,
    });
    return bill.toJSON();
  }

  /**
   * Appends line items to a bill that is still open.
   *
   * Refused once money has been taken against it. Adding a charge to a paid
   * invoice quietly reopens it as part-paid, which is indistinguishable to the
   * patient from having their payment lost.
   */
  async addItems(billId, items, actor) {
    this._assertBillingStaff(actor);
    const lines = this._normaliseItems(items);

    const bill = await this._loadOpenBill(billId);
    if (bill.paidCents > 0) {
      throw ApiError.conflict('This bill has already been paid against — issue a separate one', {
        code: 'BILL_HAS_PAYMENTS',
      });
    }

    bill.items.push(...lines);
    await bill.save();
    await this._invalidate();

    logger.info('Bill items added', { billId: String(billId), added: lines.length });
    return bill.toJSON();
  }

  /**
   * Edits the commercial terms. Line items are replaced wholesale rather than
   * patched, because a partial edit of a priced list is ambiguous.
   *
   * `paidCents`, `totalCents`, `status` and `invoiceNumber` are absent from the
   * whitelist by design — the first three are derived and the fourth is the
   * document's identity.
   */
  async update(billId, patch = {}, actor) {
    this._assertBillingStaff(actor);
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
        bill[field] = this._minorUnits(patch[field], field);
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
    await this._invalidate();
    return bill.toJSON();
  }

  /** Draft → unpaid. The point at which the patient is told they owe something. */
  async issue(billId, actor) {
    this._assertBillingStaff(actor);
    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    if (bill.status !== BILL_STATUS.DRAFT) {
      throw ApiError.conflict('Only a draft bill can be issued', { code: 'NOT_A_DRAFT' });
    }

    bill.status = BILL_STATUS.UNPAID;
    await bill.save();
    await this._invalidate();

    const patient = await this._requirePatient(bill.patient);
    this._announce(patient, bill);

    logger.info('Bill issued', { billId: String(billId), invoiceNumber: bill.invoiceNumber });
    return bill.toJSON();
  }

  /**
   * Cancels a bill.
   *
   * Never a delete: an invoice that was issued is a document the patient may hold
   * a copy of, and it has to stay findable under its number. Refused while money
   * is held against it — refund first, so the reversal is on the record before the
   * bill stops being a live obligation.
   */
  async voidBill(billId, reason, actor) {
    this._assertBillingStaff(actor);
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
    await this._invalidate();

    logger.warn('Bill voided', {
      billId: String(billId),
      invoiceNumber: bill.invoiceNumber,
      by: String(actor.id),
      reason,
    });
    return bill.toJSON();
  }

  // --- Collection -----------------------------------------------------------

  /**
   * Takes a payment.
   *
   * The order is deliberate and is the whole reason this method is long:
   *
   *   validate → check the balance → **charge** → persist → notify
   *
   * The balance is checked *before* the gateway is called so a patient is never
   * charged for money the bill would then refuse to accept. If persistence fails
   * after a successful charge the charge is reversed; if the reversal also fails
   * the error log carries both references, because at that point only a human can
   * reconcile it.
   *
   * @param {object} args
   * @param {number} args.amountCents integer minor units
   * @param {string} args.method one of `PAYMENT_METHOD`
   * @param {string} [args.transactionId] external reference, for reconciliation
   */
  async pay(billId, { amountCents, method, transactionId, metadata } = {}, actor) {
    this._assertBillingStaff(actor);
    const amount = this._minorUnits(amountCents, 'amountCents');
    if (!amount || amount < 1) throw ApiError.badRequest('A payment must be a positive amount');
    if (!method) throw ApiError.badRequest('A payment method is required');

    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    this._assertCollectable(bill);
    if (amount > bill.balanceCents) {
      throw ApiError.badRequest(
        `That is more than the ${bill.balanceCents} cents outstanding on this bill`,
        { code: 'OVERPAYMENT' }
      );
    }

    const provider = this.resolveProvider(method);
    const receipt = await provider.charge({
      amountCents: amount,
      currency: bill.currency,
      reference: bill.invoiceNumber,
      metadata: {
        ...(metadata || {}),
        billId: String(bill._id),
        patientId: String(bill.patient),
        recordedBy: String(actor.id),
      },
    });

    if (receipt.status === PAYMENT_RESULT.FAILED) {
      throw ApiError.badRequest('The payment was declined', { code: 'PAYMENT_DECLINED' });
    }
    if (receipt.status === PAYMENT_RESULT.PENDING) {
      // Recording an unsettled charge as collected money would overstate revenue
      // and mark the bill paid on the patient's portal before it is. The
      // reference is returned so the gateway's webhook can settle it later.
      logger.warn('Payment left pending by the provider', {
        billId: String(bill._id),
        providerRef: receipt.providerRef,
      });
      throw ApiError.badRequest('The payment needs further authorisation', {
        code: 'PAYMENT_PENDING',
        details: [{ providerRef: receipt.providerRef, provider: receipt.provider }],
      });
    }

    const entry = {
      amountCents: amount,
      method,
      transactionId: transactionId || receipt.providerRef,
      receivedAt: new Date(),
      recordedBy: actor.id,
    };

    let saved;
    try {
      saved = await this._applyPayment(billId, entry);
    } catch (error) {
      await this._compensate(provider, receipt, amount, billId);
      throw error;
    }

    await this._invalidate();
    this._notifyPayment(saved, entry).catch((error) =>
      logger.error('Payment receipt notification failed', { error: error.message })
    );

    logger.info('Payment recorded', {
      billId: String(billId),
      invoiceNumber: saved.invoiceNumber,
      amountCents: amount,
      method,
      status: saved.status,
      providerRef: receipt.providerRef,
    });
    return saved.toJSON();
  }

  /**
   * Returns money against a payment already taken.
   *
   * The original payment row is reduced (or removed once fully reversed) so
   * `paidCents` falls and the status re-derives on its own, and the reversal is
   * appended to `refunds` so the shrinking number has a documented cause.
   *
   * ## Why this is the mirror image of `pay()`, not a copy of it
   * A payment charges first and reverses the charge if the ledger write fails.
   * A refund cannot borrow that shape: the compensating action for "money was
   * sent back but not recorded" is re-charging a patient who has already been
   * told they were refunded, which no provider should be asked to do on its own
   * initiative. So the order inverts —
   *
   *   validate → **claim** → refund at the gateway → stamp the reference
   *
   * The claim is the important half. It reduces the payment row under the same
   * optimistic-concurrency lock `pay()` uses, which is what makes the balance
   * check binding: two refund requests racing on one payment used to both pass a
   * check against the same stale read and both reach the gateway, releasing the
   * money twice and recording it once. Now the loser's claim throws before it
   * can call the gateway at all.
   *
   * Every failure after that point leans the same way — the ledger may show a
   * refund the gateway has not finished, never money that left without a record.
   *
   * @param {object} args
   * @param {string} args.transactionId identifies the payment being reversed
   * @param {number} [args.amountCents] defaults to the full payment
   */
  async refund(billId, { transactionId, amountCents, reason } = {}, actor) {
    this._assertRefundAuthority(actor);
    if (!transactionId) {
      throw ApiError.badRequest('The transaction being refunded must be identified');
    }

    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');

    const payment = (bill.payments || []).find(
      (row) => String(row.transactionId) === String(transactionId)
    );
    if (!payment) throw ApiError.notFound('Payment');

    const amount =
      amountCents === undefined ? payment.amountCents : this._minorUnits(amountCents, 'amountCents');
    if (!amount || amount < 1) throw ApiError.badRequest('A refund must be a positive amount');
    if (amount > payment.amountCents) {
      throw ApiError.badRequest('A refund cannot exceed the payment it reverses', {
        code: 'REFUND_TOO_LARGE',
      });
    }

    const provider = this.resolveProvider(payment.method);
    const { doc: claimed, claimId } = await this._claimRefund(billId, {
      transactionId,
      amount,
      payment,
      reason,
      actor,
    });

    let receipt;
    try {
      receipt = await provider.refund({ providerRef: payment.transactionId, amountCents: amount });
      if (receipt.status === PAYMENT_RESULT.FAILED) {
        throw ApiError.badRequest('The refund was declined', { code: 'REFUND_DECLINED' });
      }
    } catch (error) {
      // Nothing left the building, so the claim has to go back — otherwise the
      // patient's balance stays credited for money they never received.
      await this._releaseClaim(billId, claimId, payment, amount);
      throw error;
    }

    const saved = (await this._stampRefund(billId, claimId, receipt)) || claimed;

    await this._invalidate();
    logger.warn('Payment refunded', {
      billId: String(billId),
      invoiceNumber: saved.invoiceNumber,
      amountCents: amount,
      providerRef: receipt.providerRef,
      by: String(actor.id),
    });
    return saved.toJSON();
  }

  // --- internals -----------------------------------------------------------

  /** @private */
  async _requirePatient(patientId) {
    if (!patientId) throw ApiError.badRequest('A patient is required');
    const patient = await this.patients.findById(patientId, {
      projection: 'user medicalRecordNumber ward primaryDoctor assignedNurses',
    });
    if (!patient) throw ApiError.notFound('Patient');
    return patient;
  }

  /** @private the patient reads their own invoices; anyone else must be an employee. */
  _assertCanRead(patient, actor) {
    if (accessPolicy.isSelf(actor, patient)) return;
    if (accessPolicy.isStaff(actor && actor.role)) return;
    throw ApiError.forbidden('You do not have access to this bill');
  }

  /** @private */
  _assertBillingStaff(actor) {
    if (!actor || !BILLING_ROLES.includes(actor.role)) {
      throw ApiError.forbidden('Only billing staff can perform this action');
    }
  }

  /**
   * @private refunds are narrower than payments.
   *
   * A receptionist takes money at the desk all day; sending it back out is a
   * decision with no counterparty check, so it stays with finance.
   */
  _assertRefundAuthority(actor) {
    if (!actor || ![ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT].includes(actor.role)) {
      throw ApiError.forbidden('Only finance staff can issue a refund');
    }
  }

  /** @private a bill that can still be edited. */
  async _loadOpenBill(billId) {
    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    if (bill.status === BILL_STATUS.VOID) {
      throw ApiError.conflict('A voided bill cannot be modified', { code: 'BILL_VOID' });
    }
    return bill;
  }

  /** @private */
  _assertCollectable(bill) {
    if (bill.status === BILL_STATUS.VOID) {
      throw ApiError.conflict('This bill has been voided', { code: 'BILL_VOID' });
    }
    if (bill.status === BILL_STATUS.DRAFT) {
      throw ApiError.conflict('Issue the bill before taking payment', { code: 'BILL_IS_DRAFT' });
    }
    if (bill.balanceCents === 0) {
      throw ApiError.conflict('This bill is already settled', { code: 'BILL_SETTLED' });
    }
  }

  /** @private appends the payment, re-checking the balance against fresh state. */
  _applyPayment(billId, entry) {
    return this._mutate(billId, (doc) => {
      this._assertCollectable(doc);
      if (entry.amountCents > doc.balanceCents) {
        // Another cashier got there first. Raised as a conflict so the caller can
        // tell it apart from a client sending a bad amount.
        throw ApiError.conflict('Another payment settled this bill first', {
          code: 'BALANCE_CHANGED',
        });
      }
      doc.payments.push(entry);
    });
  }

  /**
   * @private applies `mutator` to a freshly loaded bill and saves it, retrying on
   * a version clash.
   *
   * The clash is not an error condition — it means a concurrent payment landed
   * between the load and the save. The right answer is to redo the decision
   * against what is now true, which is exactly what re-running the mutator on a
   * reloaded document does.
   */
  async _mutate(billId, mutator) {
    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
      const doc = await this.bills.findDocForPayment(billId);
      if (!doc) throw ApiError.notFound('Bill');

      await mutator(doc);
      try {
        await doc.save();
        return doc;
      } catch (error) {
        if (error.name !== 'VersionError' || attempt === SAVE_ATTEMPTS) {
          if (error.name === 'VersionError') {
            logger.error('Gave up applying a bill write after repeated version clashes', {
              billId: String(billId),
            });
            throw ApiError.conflict('This bill is being updated by someone else — try again', {
              code: 'BILL_BUSY',
              cause: error,
            });
          }
          throw error;
        }
        logger.warn('Bill write clashed, retrying', { billId: String(billId), attempt });
      }
    }
    /* istanbul ignore next — the loop above always returns or throws. */
    throw ApiError.internal('Bill write did not complete');
  }

  /**
   * @private reverses a charge whose ledger entry could not be written.
   *
   * Best-effort by necessity: if the reversal itself fails there is nothing left
   * to try automatically, so both references go into the log at error level. This
   * is the one place in the system where a failure needs a human.
   */
  async _compensate(provider, receipt, amountCents, billId) {
    try {
      await provider.refund({ providerRef: receipt.providerRef, amountCents });
      logger.warn('Charge reversed after the payment could not be recorded', {
        billId: String(billId),
        providerRef: receipt.providerRef,
        amountCents,
      });
    } catch (error) {
      logger.error('ORPHANED CHARGE — money was taken but neither recorded nor refunded', {
        billId: String(billId),
        providerRef: receipt.providerRef,
        provider: receipt.provider,
        amountCents,
        error: error.message,
      });
    }
  }

  /**
   * @private stage one of a refund: takes the money out of the ledger before the
   * gateway is asked to release it.
   *
   * Re-finding the payment against the freshly loaded document is the point —
   * the checks the caller already ran were against an unlocked read, and this is
   * the copy that will actually be saved. A payment that has vanished or shrunk
   * in between is a concurrent refund that got here first.
   *
   * @returns {Promise<{doc: object, claimId: object}>} the saved bill and the id
   *   of the refund row to stamp once the gateway confirms.
   */
  async _claimRefund(billId, { transactionId, amount, payment, reason, actor }) {
    let claimId;
    // `_mutate` re-runs this on a version clash, so the mutator stays free of
    // side effects: each attempt builds a fresh row and only the saved one lives.
    const doc = await this._mutate(billId, (bill) => {
      const index = (bill.payments || []).findIndex(
        (row) => String(row.transactionId) === String(transactionId)
      );
      if (index === -1) throw ApiError.notFound('Payment');
      const row = bill.payments[index];
      if (amount > row.amountCents) {
        throw ApiError.conflict('This payment has already been refunded', {
          code: 'REFUND_TOO_LARGE',
        });
      }

      if (amount === row.amountCents) bill.payments.splice(index, 1);
      else row.amountCents -= amount;

      const claim = bill.refunds.create({
        amountCents: amount,
        method: payment.method,
        paymentRef: payment.transactionId,
        reason,
        refundedBy: actor.id,
      });
      bill.refunds.push(claim);
      claimId = claim._id;
    });

    return { doc, claimId };
  }

  /**
   * @private stage three: records which gateway reversal settled the claim.
   *
   * A failure here is not the caller's problem — the money is genuinely gone and
   * the ledger already says so. Only the reference for reconciliation is missing,
   * so it is logged rather than thrown, and the claimed document is returned as
   * it stood.
   */
  async _stampRefund(billId, claimId, receipt) {
    try {
      return await this._mutate(billId, (bill) => {
        const claim = bill.refunds.id(claimId);
        if (!claim) throw ApiError.notFound('Refund');
        claim.transactionId = receipt.providerRef;
      });
    } catch (error) {
      logger.error('Refund settled but its gateway reference could not be stored', {
        billId: String(billId),
        claimId: String(claimId),
        providerRef: receipt.providerRef,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * @private the gateway refused, so the claim is undone: the refund row goes
   * away and the payment it reduced is restored.
   *
   * Best-effort, like `_compensate`. If the release itself fails the ledger
   * understates what the patient has paid, which shows up as a bill that will not
   * settle — visible, unlike money quietly leaving.
   */
  async _releaseClaim(billId, claimId, payment, amountCents) {
    const row = typeof payment.toObject === 'function' ? payment.toObject() : { ...payment };
    try {
      await this._mutate(billId, (bill) => {
        bill.refunds.pull(claimId);
        const index = (bill.payments || []).findIndex(
          (p) => String(p.transactionId) === String(payment.transactionId)
        );
        if (index === -1) bill.payments.push(row);
        else bill.payments[index].amountCents += amountCents;
      });
      logger.warn('Refund claim released after the gateway refused it', {
        billId: String(billId),
        paymentRef: String(payment.transactionId),
        amountCents,
      });
    } catch (error) {
      logger.error('STRANDED REFUND CLAIM — a payment was reversed in the ledger only', {
        billId: String(billId),
        claimId: String(claimId),
        paymentRef: String(payment.transactionId),
        amountCents,
        error: error.message,
      });
    }
  }

  /**
   * @private client-supplied money is validated as integer minor units.
   *
   * `12.5` here would mean twelve and a half cents, which is not a thing, and
   * would round somewhere unpredictable downstream. Rejecting it is the only safe
   * reading of an ambiguous number.
   */
  _minorUnits(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0) {
      throw ApiError.badRequest(`\`${field}\` must be a whole number of cents`);
    }
    return amount;
  }

  /** @private */
  _normaliseItems(items) {
    if (!Array.isArray(items) || !items.length) {
      throw ApiError.badRequest('A bill needs at least one line item');
    }
    return items.map((item, index) => {
      if (!item || !item.description) {
        throw ApiError.badRequest(`Line ${index + 1} needs a description`);
      }
      const unitPriceCents = this._minorUnits(item.unitPriceCents, `items[${index}].unitPriceCents`);
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

  /** @private tells the patient an invoice is waiting. Never fails the caller. */
  _announce(patient, bill) {
    if (!patient.user) return;
    this.notifications
      .notify({
        recipient: patient.user,
        title: 'New invoice',
        message: `Invoice ${bill.invoiceNumber} for ${this._format(bill.totalCents, bill.currency)} is ready.`,
        type: NOTIFICATION_TYPE.BILLING,
        data: { billId: String(bill._id), invoiceNumber: bill.invoiceNumber },
      })
      .catch((error) => logger.error('Invoice notification failed', { error: error.message }));
  }

  /** @private */
  async _notifyPayment(bill, entry) {
    const patient = await this.patients.findById(bill.patient, { projection: 'user' });
    if (!patient || !patient.user) return;

    const settled = bill.status === BILL_STATUS.PAID;
    await this.notifications.notify({
      recipient: patient.user,
      title: settled ? 'Invoice paid' : 'Payment received',
      message: settled
        ? `Invoice ${bill.invoiceNumber} is now settled in full.`
        : `We received ${this._format(entry.amountCents, bill.currency)} towards invoice ${
            bill.invoiceNumber
          }. ${this._format(bill.balanceCents, bill.currency)} remains outstanding.`,
      type: NOTIFICATION_TYPE.BILLING,
      data: { billId: String(bill._id), invoiceNumber: bill.invoiceNumber },
    });
  }

  /** @private cents → a human-readable amount, for message bodies only. */
  _format(cents, currency = 'USD') {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }

  /** @private */
  _invalidate() {
    return this.cache.invalidate(CACHE_PREFIX);
  }
}

module.exports = new BillingService();
module.exports.BillingService = BillingService;
