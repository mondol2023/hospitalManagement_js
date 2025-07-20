const router = require('express').Router();
const { getStats, customAnalytics } = require('../controllers/analyticsController');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/stats', rbac(['admin', 'manager']), getStats);
router.get('/custom', rbac(['admin']), customAnalytics);

module.exports = router;
