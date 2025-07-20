const router = require('express').Router();
const {
  addMedicine,
  getAllMedicines,
  updateStock
} = require('../controllers/medicineController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['pharmacist', 'admin']), addMedicine);
router.get('/', rbac(['admin', 'pharmacist', 'doctor']), getAllMedicines);
router.put('/:id', rbac(['pharmacist']), updateStock);

module.exports = router;
