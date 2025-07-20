const router = require('express').Router();
const { createPatient, getAllPatients, getPatientById } = require('../controllers/patientController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['receptionist', 'admin']), createPatient);
router.get('/', rbac(['admin', 'doctor', 'nurse']), getAllPatients);
router.get('/:id', rbac(['admin', 'doctor', 'nurse']), getPatientById);

module.exports = router;
