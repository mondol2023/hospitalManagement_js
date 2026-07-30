'use strict';

/**
 * Everything that talks to the outside world lives behind one of these.
 *
 * Keeping third-party SDKs at the edge is what makes the rest of the codebase
 * testable without network access — services depend on these interfaces, and the
 * tests hand them a stub.
 */
const PaymentProvider = require('./PaymentProvider');

module.exports = {
  PaymentProvider,
  PAYMENT_RESULT: PaymentProvider.PAYMENT_RESULT,
  ManualPaymentProvider: require('./manualPaymentProvider'),
  StripePaymentProvider: require('./stripePaymentProvider'),
  ...require('./paymentProviderRegistry'),
  emailProvider: require('./emailProvider'),
  smsProvider: require('./smsProvider'),
};
