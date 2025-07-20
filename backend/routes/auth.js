const router = require('express').Router();
const { register, login, refreshToken } = require('../controllers/authController');
const validate = require('../middleware/validation');

router.post('/register', validate('register'), register);
router.post('/login', validate('login'), login);
router.post('/refresh-token', refreshToken);

module.exports = router;
