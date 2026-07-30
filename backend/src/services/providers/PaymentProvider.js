'use strict';

/**
 * The contract every payment backend implements.
 *
 * Billing code calls `charge()` and `refund()` and never learns which provider
 * ran — that is the whole point. Adding a gateway means adding a subclass and one
 * registry line; it must never mean touching `billingService`. (Open/closed, and
 * the reason the user asked for Stripe to be droppable without live keys.)
 *
 * Amounts are integer minor units (cents) everywhere. Floats are not money: at
 * 10k users the rounding drift on `0.1 + 0.2` style arithmetic turns into
 * invoices that do not reconcile.
 */
class PaymentProvider {
  /** @param {string} name stable identifier stored on the payment record */
  constructor(name) {
    if (new.target === PaymentProvider) {
      throw new Error('PaymentProvider is abstract');
    }
    this.name = name;
  }

  /**
   * True when this provider is configured well enough to take money.
   * A provider that is present but unconfigured reports `false` rather than
   * failing at charge time.
   */
  get isEnabled() {
    return true;
  }

  /**
   * @param {object} request
   * @param {number} request.amountCents positive integer
   * @param {string} request.currency ISO-4217, lower-case
   * @param {string} request.reference our invoice number (idempotency anchor)
   * @param {object} [request.metadata]
   * @returns {Promise<{providerRef:string, status:string, provider:string, raw?:object}>}
   */
  // eslint-disable-next-line no-unused-vars
  async charge(request) {
    throw new Error(`${this.constructor.name} must implement charge()`);
  }

  /**
   * @param {object} request
   * @param {string} request.providerRef reference returned by `charge`
   * @param {number} request.amountCents
   * @returns {Promise<{providerRef:string, status:string, provider:string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async refund(request) {
    throw new Error(`${this.constructor.name} must implement refund()`);
  }
}

/** Status vocabulary shared by all providers, independent of any SDK's names. */
const PAYMENT_RESULT = Object.freeze({
  SUCCEEDED: 'succeeded',
  PENDING: 'pending',
  REFUNDED: 'refunded',
  FAILED: 'failed',
});

module.exports = PaymentProvider;
module.exports.PAYMENT_RESULT = PAYMENT_RESULT;
