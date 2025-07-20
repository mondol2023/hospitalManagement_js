const router = require('express').Router();
const {
  createAlert,
  getAllAlerts,
  updateAlertStatus
} = require('../controllers/emergencyController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['nurse', 'receptionist']), createAlert);
router.get('/', rbac(['admin', 'doctor']), getAllAlerts);
router.patch('/:id/status', rbac(['admin']), updateAlertStatus);

module.exports = router;
