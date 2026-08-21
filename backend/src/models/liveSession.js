const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * LiveSession Model
 * Tracks a scheduled or active live class session.
 */
const LiveSession = sequelize.define('LiveSession', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  trainerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'trainer_id'
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id',
    comment: 'Optional link to an existing Training'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'live', 'ended'),
    allowNull: false,
    defaultValue: 'scheduled'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_at'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at'
  },
  recordingUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'recording_url'
  },
  // Room ID used for WebRTC peer signaling
  roomId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'room_id'
  },
  // Max participants allowed
  maxParticipants: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    field: 'max_participants'
  }
}, {
  tableName: 'live_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = LiveSession;
