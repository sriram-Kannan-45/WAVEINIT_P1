const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * ChatMessage Model
 * Stores real-time chat messages for live sessions or standard courses.
 */
const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  senderId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'sender_id'
  },
  roomId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'room_id',
    comment: 'Can be a live session roomId or a general trainingId string'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  seen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ChatMessage;
