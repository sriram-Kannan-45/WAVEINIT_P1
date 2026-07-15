const { DiscussionPost, User, Training } = require('../models');

// GET /api/discussion/:trainingId
const getDiscussionPosts = async (req, res) => {
  try {
    const { trainingId } = req.params;

    const posts = await DiscussionPost.findAll({
      where: { trainingId, parentId: null },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'profilePic'] },
        {
          model: DiscussionPost,
          as: 'replies',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'profilePic'] }]
        }
      ],
      order: [
        ['isPinned', 'DESC'],
        ['createdAt', 'DESC'],
        [{ model: DiscussionPost, as: 'replies' }, 'createdAt', 'ASC']
      ]
    });

    res.json({ success: true, posts });
  } catch (error) {
    console.error('Get discussion posts error:', error.message);
    res.status(500).json({ error: 'Server error fetching discussion posts' });
  }
};

// POST /api/discussion/:trainingId
const createDiscussionPost = async (req, res) => {
  try {
    const { trainingId } = req.params;
    const { content, type, isPinned } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(422).json({ error: 'Content is required' });
    }

    const postType = type || 'DISCUSSION';
    if (postType === 'ANNOUNCEMENT' && req.user.role === 'PARTICIPANT') {
      return res.status(403).json({ error: 'Only trainers or admins can post announcements' });
    }

    const post = await DiscussionPost.create({
      trainingId,
      userId,
      content: content.trim(),
      type: postType,
      isPinned: isPinned !== undefined ? !!isPinned : (postType === 'ANNOUNCEMENT'),
      parentId: null
    });

    const createdPost = await DiscussionPost.findByPk(post.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'profilePic'] }]
    });

    // Notify users about a new post if it's an announcement
    if (postType === 'ANNOUNCEMENT') {
      const io = req.app.get('io');
      const { Enrollment } = require('../models');
      const NotificationService = require('../services/notificationService');
      const training = await Training.findByPk(trainingId);

      const enrollments = await Enrollment.findAll({ where: { trainingId, status: 'ENROLLED' } });
      for (const e of enrollments) {
        await NotificationService.createNotification({
          userId: e.participantId,
          message: `New announcement in training "${training.title}": ${content.substring(0, 50)}...`,
          type: 'NOTE_UPLOAD',
          actionUrl: `/participant`,
          relatedEntityId: post.id,
          relatedEntityType: 'DiscussionPost'
        }, io);
      }
    }

    res.status(201).json({ success: true, post: createdPost });
  } catch (error) {
    console.error('Create discussion post error:', error.message);
    res.status(500).json({ error: 'Server error creating post' });
  }
};

// POST /api/discussion/:trainingId/posts/:postId/reply
const replyToDiscussionPost = async (req, res) => {
  try {
    const { trainingId, postId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(422).json({ error: 'Reply content is required' });
    }

    const parent = await DiscussionPost.findByPk(postId);
    if (!parent) return res.status(404).json({ error: 'Parent post not found' });

    const reply = await DiscussionPost.create({
      trainingId,
      userId,
      content: content.trim(),
      type: 'DISCUSSION',
      isPinned: false,
      parentId: postId
    });

    const createdReply = await DiscussionPost.findByPk(reply.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'profilePic'] }]
    });

    res.status(201).json({ success: true, reply: createdReply });
  } catch (error) {
    console.error('Reply to post error:', error.message);
    res.status(500).json({ error: 'Server error posting reply' });
  }
};

// PUT /api/discussion/:trainingId/posts/:postId/pin
const pinDiscussionPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { isPinned } = req.body;

    if (req.user.role === 'PARTICIPANT') {
      return res.status(403).json({ error: 'Only trainers or admins can pin posts' });
    }

    const post = await DiscussionPost.findByPk(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.isPinned = !!isPinned;
    await post.save();

    res.json({ success: true, message: `Post ${post.isPinned ? 'pinned' : 'unpinned'} successfully` });
  } catch (error) {
    console.error('Pin post error:', error.message);
    res.status(500).json({ error: 'Server error pinning post' });
  }
};

// DELETE /api/discussion/:trainingId/posts/:postId
const deleteDiscussionPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await DiscussionPost.findByPk(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Validate ownership or role
    if (post.userId !== req.user.id && req.user.role === 'PARTICIPANT') {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    // Delete replies first
    await DiscussionPost.destroy({ where: { parentId: postId } });
    await post.destroy();

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error.message);
    res.status(500).json({ error: 'Server error deleting post' });
  }
};

module.exports = {
  getDiscussionPosts,
  createDiscussionPost,
  replyToDiscussionPost,
  pinDiscussionPost,
  deleteDiscussionPost
};
