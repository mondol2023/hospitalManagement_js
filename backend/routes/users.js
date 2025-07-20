const router = require('express').Router();
const { getAllUsers, getUserById, updateUser, deleteUser } = require('../controllers/userController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', rbac(['admin']), getAllUsers);
router.get('/:id', rbac(['admin', 'manager']), getUserById);
router.put('/:id', rbac(['admin']), updateUser);
router.delete('/:id', rbac(['admin']), deleteUser);

module.exports = router;
