const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id'
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('ENROLLMENT', 'NOTE_UPLOAD', 'APPROVAL', 'FEEDBACK_REPLY', 'ASSIGNMENT', 'OTHER'),
    defaultValue: 'OTHER'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_read'
  },
  actionUrl: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'action_url'
  },
  relatedEntityId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'related_entity_id'
  },
  relatedEntityType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'related_entity_type'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Notification;
