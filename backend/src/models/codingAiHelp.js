const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingAiHelp = sequelize.define('CodingAiHelp', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'attempt_id'
  },
  problemId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'problem_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  prompt: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  response: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING,
    allowNull: true
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Snapshot of code when help was requested (never passed to the model unredacted)'
  },
  usageNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'usage_number'
  },
  assistanceLevel: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'assistance_level',
    comment: 'Level of AI assistance requested (1=Hint, 2=Approach, 3=Code Guidance)'
  },
  assistanceCategory: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'assistance_category',
    comment: 'Category of assistance: hint, approach, explain_error, explain_problem, code_guidance, custom'
  },
  possibleLeakDetected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'possible_leak_detected',
    comment: 'True when aiAnswerGuard flagged the generated reply as a possible answer leak'
  },
  leakReasons: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'leak_reasons',
    comment: 'Comma-separated guard reason codes, e.g. tier:reference_similarity:0.83'
  }
}, {
  tableName: 'coding_ai_help',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingAiHelp;
