const router = require('express').Router();
const {
  createAppointment,
  getAppointments,
  updateAppointmentStatus
} = require('../controllers/appointmentController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['patient', 'receptionist']), createAppointment);
router.get('/', rbac(['doctor', 'admin']), getAppointments);
router.patch('/:id/status', rbac(['doctor', 'admin']), updateAppointmentStatus);

module.exports = router;
