const express = require('express');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const discussionController = require('../controllers/discussionController');
const { validateDiscussionPost } = require('../security/inputValidator');

const router = express.Router();

router.use(authenticateToken);

router.get('/:trainingId', discussionController.getDiscussionPosts);
router.post('/:trainingId', validateDiscussionPost, discussionController.createDiscussionPost);
router.post('/:trainingId/posts/:postId/reply', validateDiscussionPost, discussionController.replyToDiscussionPost);
router.put('/:trainingId/posts/:postId/pin', roleMiddleware('TRAINER', 'ADMIN'), discussionController.pinDiscussionPost);
router.delete('/:trainingId/posts/:postId', discussionController.deleteDiscussionPost);

module.exports = router;
