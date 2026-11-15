'use strict';

/**
 * Every repository is a singleton: they are stateless wrappers around a compiled
 * model, so there is nothing to gain from per-request instances and the shared
 * one keeps the config (sortable fields, default sort) in a single place.
 *
 * Services depend on these objects rather than on Mongoose models directly, which
 * is what lets the unit tests substitute a fake without a database.
 */
module.exports = {
  analyticsRepository: require('./analyticsRepository'),
  appointmentRepository: require('./appointmentRepository'),
  bedRepository: require('./bedRepository'),
  billRepository: require('./billRepository'),
  careLogRepository: require('./careLogRepository'),
  conversationRepository: require('./conversationRepository'),
  doctorRepository: require('./doctorRepository'),
  emergencyRepository: require('./emergencyRepository'),
  medicalRecordRepository: require('./medicalRecordRepository'),
  medicineRepository: require('./medicineRepository'),
  messageRepository: require('./messageRepository'),
  notificationRepository: require('./notificationRepository'),
  nurseRepository: require('./nurseRepository'),
  patientRepository: require('./patientRepository'),
  staffRepository: require('./staffRepository'),
  stockMovementRepository: require('./stockMovementRepository'),
  userRepository: require('./userRepository'),
};
