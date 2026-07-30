'use strict';

/**
 * The service layer, in one place.
 *
 * Controllers depend on this barrel; services depend on each other by direct
 * path. That asymmetry is deliberate — requiring the barrel from inside a service
 * would make every service transitively load every other one, and the first
 * genuine cycle would resolve to a half-built `module.exports` that fails at call
 * time rather than at load time.
 *
 * Each entry is a singleton with its class attached (`module.exports.XService`),
 * so a unit test can build its own instance with fakes injected while the
 * application shares one.
 */
module.exports = {
  analyticsService: require('./analyticsService'),
  appointmentService: require('./appointmentService'),
  authService: require('./authService'),
  bedService: require('./bedService'),
  billingService: require('./billingService'),
  cacheService: require('./cacheService'),
  careLogService: require('./careLogService'),
  chatService: require('./chatService'),
  doctorService: require('./doctorService'),
  emergencyService: require('./emergencyService'),
  medicalRecordService: require('./medicalRecordService'),
  medicineService: require('./medicineService'),
  notificationService: require('./notificationService'),
  nurseService: require('./nurseService'),
  patientService: require('./patientService'),
  profileService: require('./profileService'),
  realtimeService: require('./realtimeService'),
  staffService: require('./staffService'),
  tokenService: require('./tokenService'),
  userService: require('./userService'),
};
