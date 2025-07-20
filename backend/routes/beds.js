const router = require('express').Router();
const { addBed, getAllBeds, updateBedStatus } = require('../controllers/bedController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['admin', 'manager']), addBed);
router.get('/', rbac(['admin', 'doctor', 'nurse']), getAllBeds);
router.patch('/:id/status', rbac(['admin']), updateBedStatus);

module.exports = router;
