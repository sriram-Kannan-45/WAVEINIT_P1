/**
 * ProctorActivity — granular, low-severity events used for the trainer
 * timeline (focus changes, mouse-leaves, network blips). Kept separate
 * from Violation to avoid noise in the violation feed.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProctorActivity = sequelize.define('ProctorActivity', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'session_id',
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id',
  },
  eventType: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'event_type',
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  occurredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'occurred_at',
  },
}, {
  tableName: 'proctor_activities',
  timestamps: false,
  indexes: [
    { fields: ['session_id'] },
    { fields: ['participant_id'] },
    { fields: ['event_type'] },
  ],
});

module.exports = ProctorActivity;
