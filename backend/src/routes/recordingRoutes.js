const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const uploadRecording = require('../middleware/uploadRecording');
const ctrl = require('../controllers/recordingController');

// Stream route must handle its own auth (supports ?token= query param for <video> tag)
router.get('/:id/stream', ctrl.stream);

router.use(auth);

router.post('/upload', roleMiddleware('ADMIN', 'TRAINER', 'PARTICIPANT'), uploadRecording.single('recording'), ctrl.upload);

router.get('/', roleMiddleware('ADMIN', 'TRAINER'), ctrl.list);

router.get('/:id', roleMiddleware('ADMIN', 'TRAINER'), ctrl.getOne);

router.patch('/:id', roleMiddleware('ADMIN', 'TRAINER'), ctrl.update);

router.delete('/:id', roleMiddleware('ADMIN'), ctrl.remove);

module.exports = router;
