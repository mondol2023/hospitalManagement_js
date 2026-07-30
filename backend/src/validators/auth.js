'use strict';

const { z, shortText, optionalText, dateValue } = require('./common');
const { BLOOD_GROUPS, GENDERS } = require('../utils/constants');

/**
 * Notably absent from `register`: `role`. Public signup always creates a
 * patient, and the only way to be sure of that is for the field to have no way
 * in — a check inside the service would still leave the value sitting in
 * `req.body` for the next person who writes `create(req.body)`.
 */

const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number');

/**
 * Length is the only requirement that survives contact with real users. A
 * composition rule ("one symbol, one digit") pushes people towards `Passw0rd!`
 * and buys less entropy than four extra characters.
 */
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

const emergencyContact = z.object({
  name: shortText(120),
  relationship: shortText(60),
  phone,
  email: email.optional(),
});

const patientProfile = z.object({
  age: z.coerce.number().int().min(0).max(150),
  gender: z.enum(GENDERS),
  dateOfBirth: dateValue.optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  allergies: z.array(shortText(120)).max(50).optional(),
  chronicConditions: z.array(shortText(120)).max(50).optional(),
  emergencyContact,
});

const register = {
  body: z.object({
    name: shortText(120),
    email,
    password,
    phone: phone.optional(),
    address: optionalText(500),
    profile: patientProfile,
  }),
};

const login = {
  body: z.object({ email, password: z.string().min(1).max(128) }),
};

const refresh = {
  body: z.object({ refreshToken: z.string().min(1).max(4096) }),
};

const logout = {
  body: z.object({ refreshToken: z.string().min(1).max(4096).optional() }),
};

const changePassword = {
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  }),
};

module.exports = { register, login, refresh, logout, changePassword, email, phone, password };
