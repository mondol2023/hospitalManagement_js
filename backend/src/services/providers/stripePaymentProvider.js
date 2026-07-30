'use strict';

const PaymentProvider = require('./PaymentProvider');
const env = require('../../config/env');
const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');

const { PAYMENT_RESULT } = PaymentProvider;

/**
 * Stripe, wired but dormant.
 *
 * The `stripe` package is deliberately *not* a dependency and the SDK is required
 * lazily, so this file loads fine on a machine that has never seen a Stripe key —
 * which is the state this project is in. `isEnabled` is false, the registry
 * refuses to route to it, and nothing else in the codebase notices.
 *
 * To go live: `npm i stripe`, set `STRIPE_SECRET_KEY`, done. No billing code
 * changes, because `billingService` only ever sees the `PaymentProvider` contract.
 */
class StripePaymentProvider extends PaymentProvider {
  constructor({ secretKey = env.STRIPE_SECRET_KEY } = {}) {
    super('stripe');
    this.secretKey = secretKey;
    this._client = null;
  }

  get isEnabled() {
    return Boolean(this.secretKey);
  }

  /**
   * @private resolves the SDK on first use.
   * A missing module is a 503, not a crash: the rest of the hospital keeps
   * billing in cash while somebody fixes the deployment.
   */
  client() {
    if (!this.isEnabled) {
      throw ApiError.serviceUnavailable('Stripe payments are not configured');
    }
    if (this._client) return this._client;

    let Stripe;
    try {
      // eslint-disable-next-line global-require, import/no-unresolved, node/no-missing-require
      Stripe = require('stripe');
    } catch (error) {
      logger.error('STRIPE_SECRET_KEY is set but the stripe package is not installed');
      throw ApiError.serviceUnavailable('Stripe SDK is not installed', { cause: error });
    }
    this._client = new Stripe(this.secretKey, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
    return this._client;
  }

  /**
   * `idempotencyKey` is keyed on our invoice number plus the amount, so a client
   * that retries a timed-out request cannot double-charge the patient — Stripe
   * replays the original result instead of creating a second intent.
   */
  async charge({ amountCents, currency = 'usd', reference, metadata = {} }) {
    const stripe = this.client();
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { ...metadata, invoice: reference },
        },
        { idempotencyKey: `charge:${reference}:${amountCents}` }
      );

      return {
        provider: this.name,
        providerRef: intent.id,
        status: intent.status === 'succeeded' ? PAYMENT_RESULT.SUCCEEDED : PAYMENT_RESULT.PENDING,
        raw: { status: intent.status },
      };
    } catch (error) {
      // Card declines are the customer's problem (402-ish → 400); anything else
      // is the gateway's and must not read as the caller's fault.
      logger.warn('Stripe charge failed', { reference, error: error.message });
      if (error.type === 'StripeCardError') {
        throw ApiError.badRequest(error.message, { code: 'CARD_DECLINED', cause: error });
      }
      throw ApiError.serviceUnavailable('Payment gateway error', { cause: error });
    }
  }

  async refund({ providerRef, amountCents }) {
    const stripe = this.client();
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: providerRef, amount: amountCents },
        { idempotencyKey: `refund:${providerRef}:${amountCents}` }
      );
      return { provider: this.name, providerRef: refund.id, status: PAYMENT_RESULT.REFUNDED };
    } catch (error) {
      logger.warn('Stripe refund failed', { providerRef, error: error.message });
      throw ApiError.serviceUnavailable('Refund could not be processed', { cause: error });
    }
  }
}

module.exports = StripePaymentProvider;
