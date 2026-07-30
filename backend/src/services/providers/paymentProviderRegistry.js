'use strict';

const ManualPaymentProvider = require('./manualPaymentProvider');
const StripePaymentProvider = require('./stripePaymentProvider');
const ApiError = require('../../utils/ApiError');
const { PAYMENT_METHOD } = require('../../utils/constants');

/**
 * Maps a payment *method* (what the clerk picked) to a payment *provider*
 * (who moves the money).
 *
 * `billingService` asks the registry and gets something that satisfies the
 * `PaymentProvider` contract — it never branches on the method itself. Without
 * this indirection every new gateway means another `if (method === ...)` inside
 * the billing logic, which is exactly the shape the original code had.
 */
const providers = new Map([
  [PAYMENT_METHOD.CASH, new ManualPaymentProvider(PAYMENT_METHOD.CASH)],
  [PAYMENT_METHOD.CARD, new ManualPaymentProvider(PAYMENT_METHOD.CARD)],
  [PAYMENT_METHOD.INSURANCE, new ManualPaymentProvider(PAYMENT_METHOD.INSURANCE)],
  [PAYMENT_METHOD.STRIPE, new StripePaymentProvider()],
]);

/**
 * @param {string} method one of `PAYMENT_METHOD`
 * @throws {ApiError} 400 for an unknown method, 503 for a known-but-unconfigured
 *   one — the distinction matters, because the first is the caller's mistake and
 *   the second is ours.
 */
function getPaymentProvider(method) {
  const provider = providers.get(method);
  if (!provider) {
    throw ApiError.badRequest(`Unsupported payment method: ${method}`, { code: 'PAYMENT_METHOD_UNSUPPORTED' });
  }
  if (!provider.isEnabled) {
    throw ApiError.serviceUnavailable(`Payment method "${method}" is not configured on this deployment`);
  }
  return provider;
}

/** Methods a client can actually use right now — drives the UI's dropdown. */
function availableMethods() {
  return [...providers.entries()].filter(([, p]) => p.isEnabled).map(([method]) => method);
}

/** Test seam: swap in a fake gateway without touching billing code. */
function registerProvider(method, provider) {
  providers.set(method, provider);
}

module.exports = { getPaymentProvider, availableMethods, registerProvider };
