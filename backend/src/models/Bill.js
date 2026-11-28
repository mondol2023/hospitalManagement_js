'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const {
  BILL_STATUS,
  BILL_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} = require('../utils/constants');

/**
 * Fixes against the original `Bill.js`: `services` was a single free-text string
 * (so nothing could be itemised or totalled), `total` was client-supplied and
 * unvalidated, `transcitionId` was a typo, and payments were not recorded
 * individually — a partially paid bill could not be represented.
 *
 * Monetary values are stored as integer minor units (cents) throughout. Floating
 * point dollars accumulate rounding error the moment you sum a line item.
 */

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    /** Derived — never trust a client-supplied line total. */
    amountCents: { type: Number, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    method: { type: String, enum: PAYMENT_METHOD_VALUES, required: true },
    transactionId: { type: String, trim: true },
    receivedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/**
 * A refund cannot be modelled as a negative payment — `amountCents` is `min: 1`
 * and `paidCents` is a plain sum — so the money coming back out reduces the
 * original payment row and is recorded here instead. Without this array the only
 * evidence a refund happened would be a shrinking number.
 *
 * Unlike the other embedded rows this one keeps its `_id`. `billingService`
 * writes the row *before* it asks the gateway to release the money and comes back
 * to stamp the gateway's reference on it afterwards, so it needs to name the
 * exact row it wrote — two partial refunds of the same payment for the same
 * amount are otherwise indistinguishable.
 */
const refundSchema = new mongoose.Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    method: { type: String, enum: PAYMENT_METHOD_VALUES, required: true },
    /** The `transactionId` of the payment being reversed. */
    paymentRef: { type: String, trim: true },
    /** The gateway's own reference for the reversal. Stamped on once it settles. */
    transactionId: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 500 },
    refundedAt: { type: Date, default: Date.now },
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const billSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true, uppercase: true },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    items: {
      type: [lineItemSchema],
      validate: [(v) => v.length > 0, 'A bill needs at least one line item'],
    },
    subtotalCents: { type: Number, min: 0, default: 0 },
    taxCents: { type: Number, min: 0, default: 0 },
    discountCents: { type: Number, min: 0, default: 0 },
    totalCents: { type: Number, min: 0, default: 0 },
    paidCents: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    status: {
      type: String,
      enum: BILL_STATUS_VALUES,
      default: BILL_STATUS.UNPAID,
    },
    payments: [paymentSchema],
    refunds: [refundSchema],
    dueDate: { type: Date },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    /**
     * Payments are applied by loading the document, pushing a row and saving, so
     * the recalculation hook below can re-derive the totals. Two cashiers taking
     * payment on the same invoice at the same moment would each check the balance
     * against a stale copy and both pass, overpaying the bill. Optimistic
     * concurrency makes the second `save()` throw `VersionError`, which the
     * billing service retries against fresh state.
     */
    optimisticConcurrency: true,
  }
);

billSchema.plugin(toJSONPlugin);
billSchema.plugin(tenantScoped, { scope: 'branch' });

// --- Indexes ---------------------------------------------------------------
billSchema.index(
  { organization: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } }
);
billSchema.index({ organization: 1, branch: 1, patient: 1, createdAt: -1 });
billSchema.index({ organization: 1, branch: 1, status: 1, dueDate: 1 });

// --- Hooks -----------------------------------------------------------------

/**
 * Totals are recomputed from line items on every save, so the stored figures can
 * never disagree with the items that justify them.
 */
billSchema.pre('validate', function recalculate(next) {
  if (!this.invoiceNumber) {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 36 ** 3)
      .toString(36)
      .toUpperCase()
      .padStart(3, '0');
    this.invoiceNumber = `INV-${stamp}-${random}`;
  }

  for (const item of this.items || []) {
    item.amountCents = item.quantity * item.unitPriceCents;
  }

  this.subtotalCents = (this.items || []).reduce((sum, i) => sum + i.amountCents, 0);

  if (this.discountCents > this.subtotalCents) {
    return next(new Error('Discount cannot exceed the subtotal'));
  }

  this.totalCents = this.subtotalCents - this.discountCents + this.taxCents;
  this.paidCents = (this.payments || []).reduce((sum, p) => sum + p.amountCents, 0);

  if (this.paidCents > this.totalCents) {
    return next(new Error('Payments exceed the bill total'));
  }

  // Status is derived, except for the terminal states an operator sets by hand.
  if (this.status !== BILL_STATUS.VOID && this.status !== BILL_STATUS.DRAFT) {
    if (this.paidCents === 0) this.status = BILL_STATUS.UNPAID;
    else if (this.paidCents < this.totalCents) this.status = BILL_STATUS.PARTIALLY_PAID;
    else this.status = BILL_STATUS.PAID;
  }

  return next();
});

billSchema.virtual('balanceCents').get(function balance() {
  return Math.max(this.totalCents - this.paidCents, 0);
});

/** Gross money returned. `paidCents` is already net of it. */
billSchema.virtual('refundedCents').get(function refunded() {
  return (this.refunds || []).reduce((sum, r) => sum + r.amountCents, 0);
});

module.exports = mongoose.model('Bill', billSchema);
