const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * DiscussionPost
 * ──────────────
 * Stores posts, questions, trainer announcements, and replies for a Training.
 */
const DiscussionPost = sequelize.define('DiscussionPost', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'training_id'
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('DISCUSSION', 'QUESTION', 'ANNOUNCEMENT'),
    allowNull: false,
    defaultValue: 'DISCUSSION'
  },
  isPinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_pinned'
  },
  parentId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'parent_id'
  }
}, {
  tableName: 'discussion_posts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['training_id'] },
    { fields: ['parent_id'] },
    { fields: ['user_id'] }
  ]
});

module.exports = DiscussionPost;
