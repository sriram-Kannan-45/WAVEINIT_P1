const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewCandidate = sequelize.define('InterviewCandidate', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  participantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  status: {
    type: DataTypes.ENUM('ASSIGNED','INVITED','ACCEPTED','DECLINED','JOINED','COMPLETED','NO_SHOW'),
    defaultValue: 'ASSIGNED'
  },
  invitationSentAt: { type: DataTypes.DATE, allowNull: true },
  joinedAt: { type: DataTypes.DATE, allowNull: true },
  leftAt: { type: DataTypes.DATE, allowNull: true },
  durationSeconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
}, {
  tableName: 'interview_candidates',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewCandidate;
