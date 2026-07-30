'use strict';

const env = require('../../config/env');
const logger = require('../../config/logger');

/**
 * Outbound email.
 *
 * Unconfigured, this logs and reports `delivered: false` instead of throwing.
 * That is deliberate: an appointment must not fail to book because the SMTP host
 * is down. The in-app notification is the durable record; email is a courtesy
 * copy, and the two must not share a failure mode.
 */
class EmailProvider {
  constructor(config = env) {
    this.config = config;
    this._transport = null;
  }

  get isEnabled() {
    return Boolean(this.config.EMAIL_HOST && this.config.EMAIL_USER);
  }

  /** @private nodemailer's transport is lazily built and reuses its connection pool. */
  transport() {
    if (this._transport) return this._transport;
    // eslint-disable-next-line global-require
    const nodemailer = require('nodemailer');
    this._transport = nodemailer.createTransport({
      host: this.config.EMAIL_HOST,
      port: this.config.EMAIL_PORT,
      secure: this.config.EMAIL_PORT === 465,
      auth: { user: this.config.EMAIL_USER, pass: this.config.EMAIL_PASS },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
    return this._transport;
  }

  async send({ to, subject, text, html }) {
    if (!this.isEnabled) {
      logger.debug('Email skipped (provider not configured)', { to, subject });
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      const info = await this.transport().sendMail({
        from: this.config.EMAIL_FROM,
        to,
        subject,
        text,
        html,
      });
      return { delivered: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Email delivery failed', { to, subject, error: error.message });
      return { delivered: false, reason: error.message };
    }
  }

  async close() {
    if (this._transport) {
      this._transport.close();
      this._transport = null;
    }
  }
}

module.exports = new EmailProvider();
module.exports.EmailProvider = EmailProvider;
