'use strict';

/**
 * Single import surface for models. Requiring this module guarantees every
 * schema is registered before any `populate()` runs — the original code relied
 * on incidental require order and had refs (`'Patient'`, `'Appointment'`) that
 * pointed at models registered under different names or never loaded at all.
 */

module.exports = {
  Analytics: require('./Analytics'),
  Appointment: require('./Appointment'),
  Bed: require('./Bed'),
  Bill: require('./Bill'),
  CareLog: require('./CareLog'),
  Conversation: require('./Conversation'),
  Doctor: require('./Doctor'),
  Emergency: require('./Emergency'),
  MedicalRecord: require('./MedicalRecord'),
  Medicine: require('./Medicine'),
  Message: require('./Message'),
  Notification: require('./Notification'),
  Nurse: require('./Nurse'),
  Patient: require('./Patient'),
  Staff: require('./Staff'),
  StockMovement: require('./StockMovement'),
  User: require('./User'),
};
