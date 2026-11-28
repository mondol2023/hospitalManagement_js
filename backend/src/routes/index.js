'use strict';

const express = require('express');

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');
const nurseRoutes = require('./nurseRoutes');
const staffRoutes = require('./staffRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const medicalRecordRoutes = require('./medicalRecordRoutes');
const careLogRoutes = require('./careLogRoutes');
const bedRoutes = require('./bedRoutes');
const medicineRoutes = require('./medicineRoutes');
const billingRoutes = require('./billingRoutes');
const emergencyRoutes = require('./emergencyRoutes');
const chatRoutes = require('./chatRoutes');
const notificationRoutes = require('./notificationRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const organizationRoutes = require('./organizationRoutes');
const branchRoutes = require('./branchRoutes');
const departmentRoutes = require('./departmentRoutes');
const platformRoutes = require('./platformRoutes');

/**
 * The API surface, in one place.
 *
 * Mounting happens here rather than in `app.js` so the application file stays
 * about the pipeline — parsers, security headers, error handling — and this file
 * stays about what the service exposes. Adding a domain is one require and one
 * `use`, and nothing about the request pipeline has to be touched.
 *
 * Path names are plural nouns and hyphenated: `/medical-records`, `/care-logs`.
 * The only non-noun is `/auth`, which is a set of actions rather than a
 * collection.
 */
const router = express.Router();

const routes = [
  { path: '/auth', router: authRoutes },
  { path: '/users', router: userRoutes },
  { path: '/patients', router: patientRoutes },
  { path: '/doctors', router: doctorRoutes },
  { path: '/nurses', router: nurseRoutes },
  { path: '/staff', router: staffRoutes },
  { path: '/appointments', router: appointmentRoutes },
  { path: '/medical-records', router: medicalRecordRoutes },
  { path: '/care-logs', router: careLogRoutes },
  { path: '/beds', router: bedRoutes },
  { path: '/medicines', router: medicineRoutes },
  { path: '/bills', router: billingRoutes },
  { path: '/emergencies', router: emergencyRoutes },
  { path: '/chat', router: chatRoutes },
  { path: '/notifications', router: notificationRoutes },
  { path: '/analytics', router: analyticsRoutes },
  { path: '/organization', router: organizationRoutes },
  { path: '/branches', router: branchRoutes },
  { path: '/departments', router: departmentRoutes },
  { path: '/platform', router: platformRoutes },
];

routes.forEach((route) => router.use(route.path, route.router));

/** A directory of what is mounted — handy in development, harmless in production. */
router.get('/', (req, res) =>
  res.json({
    success: true,
    data: {
      name: 'Hospital Management API',
      resources: routes.map((route) => route.path),
    },
  })
);

module.exports = router;
