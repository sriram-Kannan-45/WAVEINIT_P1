const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Notification = sequelize.define('Notification', {
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
  actorUserId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'actor_user_id',
  },
  recipientRole: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'recipient_role',
  },
  type: {
    type: DataTypes.STRING(60),
    allowNull: false,
    defaultValue: 'OTHER',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'SYSTEM',
  },
  relatedEntityType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'related_entity_type',
  },
  relatedEntityId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'related_entity_id',
  },
  actionUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'action_url',
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_read',
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at',
  },
  priority: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'NORMAL',
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Notification;
