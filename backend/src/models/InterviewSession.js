const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewSession = sequelize.define('InterviewSession', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  session_uuid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true,
  },
  interview_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'interviews', key: 'id' },
    onDelete: 'CASCADE',
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('WAITING', 'ACTIVE', 'ENDED', 'FAILED'),
    allowNull: false,
    defaultValue: 'WAITING',
  },
}, {
  tableName: 'interview_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['interview_id'] },
    { fields: ['session_uuid'], unique: true },
    { fields: ['status'] },
  ],
});

module.exports = InterviewSession;
