'use strict';

const { billRepository, patientRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { BILL_STATUS, NOTIFICATION_TYPE } = require('../utils/constants');
const rules = require('../utils/billingRules');
const { getPaymentProvider, PAYMENT_RESULT } = require('./providers');
const cacheService = require('./cacheService');
const notificationService = require('./notificationService');

/** Takes and returns money. */
class PaymentService {
  constructor({
    bills = billRepository,
    patients = patientRepository,
    notifications = notificationService,
    cache = cacheService,
    resolveProvider = getPaymentProvider,
  } = {}) {
    this.bills = bills;
    this.patients = patients;
    this.notifications = notifications;
    this.cache = cache;
    this.ns = cache.namespace(rules.CACHE_PREFIX);
    this.resolveProvider = resolveProvider;
  }

  /**
   * validate → check balance → **charge** → persist → notify.The balance is checked before the
   * gateway so nobody is charged for money the bill would refuse.
   */
  async pay(billId, { amountCents, method, transactionId, metadata } = {}, actor) {
    rules.assertBillingStaff(actor);
    const amount = rules.minorUnits(amountCents, 'amountCents');
    if (!amount || amount < 1) throw ApiError.badRequest('A payment must be a positive amount');
    if (!method) throw ApiError.badRequest('A payment method is required');

    const bill = await this.bills.findDocForPayment(billId);
    if (!bill) throw ApiError.notFound('Bill');
    rules.assertCollectable(bill);
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
      // Unsettled money must not count as collected; the webhook settles it later.
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

    await this.ns.invalidate();
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

  /** validate → **claim** → refund at the gateway → stamp the reference. */
  async refund(billId, { transactionId, amountCents, reason } = {}, actor) {
    rules.assertRefundAuthority(actor);
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
      amountCents === undefined ? payment.amountCents : rules.minorUnits(amountCents, 'amountCents');
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
      // Nothing left the building, so give the claim back.
      await this._releaseClaim(billId, claimId, payment, amount);
      throw error;
    }

    const saved = (await this._stampRefund(billId, claimId, receipt)) || claimed;

    await this.ns.invalidate();
    logger.warn('Payment refunded', {
      billId: String(billId),
      invoiceNumber: saved.invoiceNumber,
      amountCents: amount,
      providerRef: receipt.providerRef,
      by: String(actor.id),
    });
    return saved.toJSON();
  }

  _mutate(billId, mutator) {
    return rules.mutateBill(this.bills, billId, mutator);
  }

  // Re-checks the balance against fresh state; another cashier may have won.
  _applyPayment(billId, entry) {
    return this._mutate(billId, (doc) => {
      rules.assertCollectable(doc);
      if (entry.amountCents > doc.balanceCents) {
        throw ApiError.conflict('Another payment settled this bill first', {
          code: 'BALANCE_CHANGED',
        });
      }
      doc.payments.push(entry);
    });
  }

  // Best-effort: if the reversal fails too, only a human can reconcile, hence both refs in the log.
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

  // Re-finds the payment on the freshly loaded doc: the caller's checks were on an unlocked read.
  async _claimRefund(billId, { transactionId, amount, payment, reason, actor }) {
    let claimId;
    // Re-run on a version clash, so the mutator must stay side-effect free.
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

  // The money is already gone, so a failed stamp is logged, not thrown.
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

  // Best-effort undo of a claim; a failure leaves a bill that won't settle, which is visible.
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

  async _notifyPayment(bill, entry) {
    const patient = await this.patients.findById(bill.patient, { projection: 'user' });
    if (!patient || !patient.user) return;

    const settled = bill.status === BILL_STATUS.PAID;
    await this.notifications.notify({
      recipient: patient.user,
      title: settled ? 'Invoice paid' : 'Payment received',
      message: settled
        ? `Invoice ${bill.invoiceNumber} is now settled in full.`
        : `We received ${rules.formatMoney(entry.amountCents, bill.currency)} towards invoice ${
            bill.invoiceNumber
          }. ${rules.formatMoney(bill.balanceCents, bill.currency)} remains outstanding.`,
      type: NOTIFICATION_TYPE.BILLING,
      data: { billId: String(bill._id), invoiceNumber: bill.invoiceNumber },
    });
  }
}

module.exports = new PaymentService();
module.exports.PaymentService = PaymentService;
