'use strict';

const { z } = require('./common');

/**
 * One reading, one set of bounds.
 *
 * A nurse's bedside observation and a doctor's encounter record store the same
 * vitals through the same `models/schemas/vitals.js`, so they validate through
 * the same schema here. The numbers are stated in both places deliberately: the
 * model remains the authority, this is the early exit that turns a respiratory
 * rate of 400 into a field-level 422 naming the bad reading, rather than a cast
 * error raised after the request has been authorised and the patient loaded.
 */
const vitals = z
  .object({
    temperatureC: z.coerce.number().min(25).max(45).optional(),
    heartRateBpm: z.coerce.number().int().min(20).max(300).optional(),
    systolicBp: z.coerce.number().int().min(40).max(300).optional(),
    diastolicBp: z.coerce.number().int().min(20).max(200).optional(),
    respiratoryRate: z.coerce.number().int().min(4).max(80).optional(),
    oxygenSaturation: z.coerce.number().min(50).max(100).optional(),
    weightKg: z.coerce.number().min(0).max(500).optional(),
    painScore: z.coerce.number().int().min(0).max(10).optional(),
    bloodGlucoseMgDl: z.coerce.number().min(10).max(1000).optional(),
  })
  // Mirrors the model's pre-validate hook: an observation with no observation in
  // it is a row that costs a query and tells a doctor nothing.
  .refine((reading) => Object.keys(reading).length > 0, {
    message: 'At least one reading is required',
  });

module.exports = { vitals };
