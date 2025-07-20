const router = require('express').Router();
const {
  createNotification,
  getUserNotifications,
  markAsRead
} = require('../controllers/notificationController');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/', createNotification);
router.get('/:userId', getUserNotifications);
router.patch('/:id/read', markAsRead);

module.exports = router;
