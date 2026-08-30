const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * UserBadge / StudentAchievement
 * ──────────────────────────────
 * Stores earned achievements/badges based on real LMS activity.
 */
const UserBadge = sequelize.define('UserBadge', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'user_id',
  },
  badgeKey: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'badge_key',
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  icon: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Award',
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'GENERAL',
  },
  earnedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'earned_at',
  },
}, {
  tableName: 'user_badges',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['user_id', 'badge_key'] },
    { fields: ['user_id'] },
  ],
});

module.exports = UserBadge;
