'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');

/**
 * Pharmacy inventory.
 *
 * Fixes: `quantity` accepted negatives (stock could go below zero), there was no
 * uniqueness on name+batch so the same batch could be entered twice, and no
 * index supported the low-stock and expiry reports the analytics module needs.
 */
const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, trim: true, index: true },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 0,
    },
    unit: {
      type: String,
      enum: ['tablet', 'capsule', 'ml', 'mg', 'vial', 'strip', 'bottle'],
      default: 'tablet',
    },
    reorderLevel: { type: Number, min: 0, default: 10 },
    price: { type: Number, min: 0, required: true },
    manufacturer: { type: String, trim: true },
    expiryDate: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 1000 },
    requiresPrescription: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

medicineSchema.plugin(toJSONPlugin);

// --- Indexes ---------------------------------------------------------------
medicineSchema.index({ name: 1, batchNumber: 1 }, { unique: true });
// Expiry sweep and the "expiring soon" report.
medicineSchema.index({ expiryDate: 1, isActive: 1 });
// Search-by-name on the dispensing screen.
medicineSchema.index({ name: 'text', genericName: 'text' });

medicineSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.expiryDate && this.expiryDate.getTime() < Date.now());
});

medicineSchema.virtual('isLowStock').get(function isLowStock() {
  return this.quantity <= this.reorderLevel;
});

module.exports = mongoose.model('Medicine', medicineSchema);
