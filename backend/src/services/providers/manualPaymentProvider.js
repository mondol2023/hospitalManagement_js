'use strict';

const crypto = require('crypto');

const PaymentProvider = require('./PaymentProvider');
const { PAYMENT_RESULT } = PaymentProvider;

/**
 * Money taken at the desk: cash, a card terminal, or an insurer settlement.
 *
 * There is no gateway to call — the transaction already happened in the physical
 * world and the clerk is recording it. What this provider adds is a generated
 * receipt reference, so *every* payment row carries a `providerRef` and the
 * reconciliation report does not need to special-case offline methods.
 */
class ManualPaymentProvider extends PaymentProvider {
  constructor(method = 'manual') {
    super(method);
  }

  async charge({ amountCents, reference }) {
    return {
      provider: this.name,
      status: PAYMENT_RESULT.SUCCEEDED,
      providerRef: `${this.name.toUpperCase()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      raw: { amountCents, reference, recordedOffline: true },
    };
  }

  async refund({ providerRef, amountCents }) {
    return {
      provider: this.name,
      status: PAYMENT_RESULT.REFUNDED,
      providerRef: `REF-${providerRef}`,
      raw: { amountCents },
    };
  }
}

module.exports = ManualPaymentProvider;
