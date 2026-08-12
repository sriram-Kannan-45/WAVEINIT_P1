const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewNotes = sequelize.define('InterviewNotes', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  session_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    references: { model: 'interview_sessions', key: 'id' },
    onDelete: 'CASCADE',
  },
  interview_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'interviews', key: 'id' },
    onDelete: 'CASCADE',
  },
  author_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  note_type: {
    type: DataTypes.ENUM('OBSERVATION', 'QUESTION', 'ANSWER', 'SCORE', 'FLAG', 'GENERAL'),
    allowNull: false,
    defaultValue: 'GENERAL',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  timestamp_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Seconds into the interview when note was taken',
  },
  is_private: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'If true, only visible to the author',
  },
}, {
  tableName: 'interview_notes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['interview_id'] },
    { fields: ['author_id'] },
    { fields: ['note_type'] },
  ],
});

module.exports = InterviewNotes;
