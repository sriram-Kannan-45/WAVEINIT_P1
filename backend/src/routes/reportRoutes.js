const express = require('express');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const reportController = require('../controllers/reportController');

const router = express.Router();

router.use(authenticateToken);

router.get('/admin', roleMiddleware('ADMIN'), reportController.getAdminReport);
router.get('/trainer', roleMiddleware('TRAINER', 'ADMIN'), reportController.getTrainerReport);
router.get('/participant', roleMiddleware('PARTICIPANT'), reportController.getParticipantReport);

module.exports = router;
