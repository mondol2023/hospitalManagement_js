'use strict';

const logger = require('../config/logger');
const ApiError = require('./ApiError');
const { assertRole } = require('./accessPolicy');
const { BILL_STATUS, ROLES } = require('./constants');

const CACHE_PREFIX = 'billing';
const SAVE_ATTEMPTS = 3;

// Clinicians treat patients; they do not invoice them.
const BILLING_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.RECEPTIONIST]);
// Sending money back has no counterparty check, so it stays with finance.
const REFUND_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT]);

const assertBillingStaff = (actor) =>
  assertRole(actor, BILLING_ROLES, 'Only billing staff can perform this action');

const assertRefundAuthority = (actor) =>
  assertRole(actor, REFUND_ROLES, 'Only finance staff can issue a refund');

function assertCollectable(bill) {
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

// Client money must be whole cents; `12.5` has no safe reading.
function minorUnits(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0) {
    throw ApiError.badRequest(`\`${field}\` must be a whole number of cents`);
  }
  return amount;
}

function formatMoney(cents, currency = 'USD') {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// A version clash means a concurrent write landed, so re-run the decision on fresh state.
async function mutateBill(bills, billId, mutator) {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
    const doc = await bills.findDocForPayment(billId);
    if (!doc) throw ApiError.notFound('Bill');

    await mutator(doc);
    try {
      await doc.save();
      return doc;
    } catch (error) {
      if (error.name !== 'VersionError') throw error;
      if (attempt === SAVE_ATTEMPTS) {
        logger.error('Gave up applying a bill write after repeated version clashes', {
          billId: String(billId),
        });
        throw ApiError.conflict('This bill is being updated by someone else — try again', {
          code: 'BILL_BUSY',
          cause: error,
        });
      }
      logger.warn('Bill write clashed, retrying', { billId: String(billId), attempt });
    }
  }
  /* istanbul ignore next — the loop always returns or throws. */
  throw ApiError.internal('Bill write did not complete');
}

module.exports = {
  CACHE_PREFIX,
  assertBillingStaff,
  assertRefundAuthority,
  assertCollectable,
  minorUnits,
  formatMoney,
  mutateBill,
};
