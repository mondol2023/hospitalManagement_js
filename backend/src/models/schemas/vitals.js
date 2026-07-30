'use strict';

const mongoose = require('mongoose');

/**
 * Vital signs, with physiologic bounds.
 *
 * Both the doctor's encounter note (`MedicalRecord`) and the nurse's bedside
 * observation (`CareLog`) record the same measurements. Defining the shape once
 * means a range fix or a new measurement lands in both places — the original
 * codebase had this block copy-pasted with subtly different limits.
 *
 * Returned as a factory rather than a shared `Schema` instance because Mongoose
 * mutates sub-schemas when they are compiled into a parent (paths, hooks,
 * options), so reusing one object across two models couples them.
 */
const buildVitalsSchema = () =>
  new mongoose.Schema(
    {
      temperatureC: { type: Number, min: 25, max: 45 },
      heartRateBpm: { type: Number, min: 20, max: 300 },
      systolicBp: { type: Number, min: 40, max: 300 },
      diastolicBp: { type: Number, min: 20, max: 200 },
      respiratoryRate: { type: Number, min: 4, max: 80 },
      oxygenSaturation: { type: Number, min: 50, max: 100 },
      weightKg: { type: Number, min: 0, max: 500 },
      /** 0–10 subjective pain score. */
      painScore: { type: Number, min: 0, max: 10 },
      bloodGlucoseMgDl: { type: Number, min: 10, max: 1000 },
    },
    { _id: false }
  );

/**
 * True when any reading falls outside the "call a doctor" band. Used to flag a
 * care log for clinician review the moment a nurse saves it, rather than relying
 * on someone reading the chart in time.
 *
 * @param {object|null|undefined} vitals
 * @returns {boolean}
 */
const isCritical = (vitals) => {
  if (!vitals) return false;
  const outOfBand = (value, low, high) =>
    typeof value === 'number' && Number.isFinite(value) && (value < low || value > high);

  return (
    outOfBand(vitals.temperatureC, 35, 39) ||
    outOfBand(vitals.heartRateBpm, 45, 130) ||
    outOfBand(vitals.systolicBp, 90, 180) ||
    outOfBand(vitals.diastolicBp, 50, 110) ||
    outOfBand(vitals.respiratoryRate, 10, 28) ||
    outOfBand(vitals.oxygenSaturation, 92, 100) ||
    outOfBand(vitals.bloodGlucoseMgDl, 60, 300)
  );
};

module.exports = { buildVitalsSchema, isCritical };
