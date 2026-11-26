'use strict';

const profileService = require('../../src/services/profileService');
const { ROLES } = require('../../src/utils/constants');

describe('profileService.modelFor', () => {
  it('maps every staff role without a clinical profile to the shared Staff model', () => {
    for (const role of [ROLES.RECEPTIONIST, ROLES.PHARMACIST, ROLES.ACCOUNTANT, ROLES.MANAGER, ROLES.ADMIN]) {
      expect(profileService.modelFor(role)).toBe('Staff');
    }
  });

  it('keeps clinical roles and patients on their own models', () => {
    expect(profileService.modelFor(ROLES.DOCTOR)).toBe('Doctor');
    expect(profileService.modelFor(ROLES.NURSE)).toBe('Nurse');
    expect(profileService.modelFor(ROLES.PATIENT)).toBe('Patient');
  });

  it('returns undefined for a role it does not know', () => {
    expect(profileService.modelFor('chief_wizard')).toBeUndefined();
  });
});
