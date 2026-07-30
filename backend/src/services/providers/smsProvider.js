'use strict';

const env = require('../../config/env');
const logger = require('../../config/logger');

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Outbound SMS via a generic HTTP gateway.
 *
 * Same contract as the email provider — best-effort, never throws — with one
 * addition: an `AbortSignal` timeout. A third-party SMS endpoint that hangs would
 * otherwise hold an Express handler (and its socket) open indefinitely, and at
 * 10k users a few hundred of those is the whole process.
 */
class SmsProvider {
  constructor(config = env) {
    this.config = config;
  }

  get isEnabled() {
    return Boolean(this.config.SMS_PROVIDER_URL && this.config.SMS_API_KEY);
  }

  async send({ to, body }) {
    if (!this.isEnabled) {
      logger.debug('SMS skipped (provider not configured)', { to });
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      const response = await fetch(this.config.SMS_PROVIDER_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.SMS_API_KEY}`,
        },
        body: JSON.stringify({ to, message: body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.warn('SMS gateway rejected message', { to, status: response.status });
        return { delivered: false, reason: `gateway_${response.status}` };
      }
      return { delivered: true };
    } catch (error) {
      logger.error('SMS delivery failed', { to, error: error.message });
      return { delivered: false, reason: error.message };
    }
  }
}

module.exports = new SmsProvider();
module.exports.SmsProvider = SmsProvider;
