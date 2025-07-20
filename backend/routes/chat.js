const router = require('express').Router();
const { sendMessage, getChatHistory } = require('../controllers/chatController');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/', sendMessage);
router.get('/', getChatHistory);

module.exports = router;
