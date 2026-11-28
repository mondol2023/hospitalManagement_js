'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const { STOCK_MOVEMENT_VALUES } = require('../utils/constants');

// Append-only: one row per change to a medicine's count, so "who added how much" survives the log rotation.
const stockMovementSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    kind: { type: String, enum: STOCK_MOVEMENT_VALUES, required: true },
    delta: { type: Number, required: true },
    onHand: { type: Number, required: true, min: 0 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.plugin(toJSONPlugin);
stockMovementSchema.plugin(tenantScoped, { scope: 'branch' });

stockMovementSchema.index({ organization: 1, branch: 1, medicine: 1, createdAt: -1 });
stockMovementSchema.index({ organization: 1, branch: 1, kind: 1, createdAt: -1 });
stockMovementSchema.index({ organization: 1, branch: 1, actor: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
