'use strict';

const mongoose = require('mongoose');
const toJSONPlugin = require('./plugins/toJSON');
const tenantScoped = require('./plugins/tenantScoped');
const { buildVitalsSchema } = require('./schemas/vitals');

/**
 * Clinical encounter record. Previously an orphan model with no service, route
 * or controller — declared but unreachable.
 *
 * Prescriptions were a single string; they are now structured so the pharmacy
 * module can act on them.
 */

const prescriptionSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },
    frequency: { type: String, trim: true },
    durationDays: { type: Number, min: 1 },
    instructions: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const medicalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    visitDate: { type: Date, required: true, default: Date.now },
    chiefComplaint: { type: String, trim: true, maxlength: 1000 },
    diagnosis: { type: String, required: true, trim: true, maxlength: 2000 },
    treatmentPlan: { type: String, trim: true, maxlength: 5000 },
    prescriptions: [prescriptionSchema],
    // Same shape and bounds as the nurse's bedside observation — defined once.
    vitals: { type: buildVitalsSchema(), default: undefined },
    notes: { type: String, trim: true, maxlength: 5000 },
    attachments: [{ url: String, label: String, mimeType: String }],
    followUpDate: { type: Date },
  },
  { timestamps: true }
);

medicalRecordSchema.plugin(toJSONPlugin);
medicalRecordSchema.plugin(tenantScoped, { scope: 'branch' });

// --- Indexes ---------------------------------------------------------------
// A patient's chart, most recent visit first — the single hottest clinical read.
medicalRecordSchema.index({ organization: 1, branch: 1, patient: 1, visitDate: -1 });
medicalRecordSchema.index({ organization: 1, branch: 1, doctor: 1, visitDate: -1 });
medicalRecordSchema.index({ organization: 1, branch: 1, followUpDate: 1 });

/**
 * One record per appointment. The service checks first and answers with a
 * friendly 409; this index is what holds when two submissions race. Partial, so
 * the many records written without an appointment never collide.
 */
medicalRecordSchema.index(
  { organization: 1, branch: 1, appointment: 1 },
  {
    unique: true,
    name: 'uniq_record_per_appointment',
    partialFilterExpression: { appointment: { $type: 'objectId' } },
  }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
