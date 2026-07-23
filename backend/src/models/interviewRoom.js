const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewRoom = sequelize.define('InterviewRoom', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  roomId: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  status: { type: DataTypes.ENUM('WAITING','ACTIVE','ENDED'), defaultValue: 'WAITING' },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  endedAt: { type: DataTypes.DATE, allowNull: true },
  maxParticipants: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 10 },
  iceServers: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'interview_rooms',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewRoom;
