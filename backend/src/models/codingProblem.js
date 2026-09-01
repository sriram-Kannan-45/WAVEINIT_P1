const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingProblem = sequelize.define('CodingProblem', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  assessmentId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'assessment_id'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  constraints: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  inputFormat: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'input_format'
  },
  outputFormat: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'output_format'
  },
  sampleInput: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sample_input'
  },
  sampleOutput: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sample_output'
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  difficulty: {
    type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD'),
    allowNull: false,
    defaultValue: 'MEDIUM'
  },
  programmingLanguage: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'javascript',
    field: 'programming_language'
  },
  starterCode: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'starter_code'
  },
  expectedSolution: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'expected_solution'
  },
  timeLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    field: 'time_limit',
    comment: 'Execution time limit in seconds'
  },
  memoryLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 256,
    field: 'memory_limit',
    comment: 'Memory limit in MB'
  },
  marks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  source: {
    type: DataTypes.ENUM('MANUAL', 'AI'),
    allowNull: false,
    defaultValue: 'MANUAL'
  },
  aiValidationStatus: {
    type: DataTypes.ENUM('AI_GENERATED', 'VALIDATING', 'VALIDATED', 'VALIDATION_FAILED', 'NEEDS_TRAINER_REVIEW', 'PUBLISHED'),
    allowNull: false,
    defaultValue: 'PUBLISHED',
    field: 'ai_validation_status'
  },
  aiValidationMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'ai_validation_message'
  },
  requiredConcepts: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'required_concepts',
    comment: 'Structured list of required coding concepts a participant MUST use (e.g. ["for_loop", "function"]). Stored separately from problem constraints.'
  }
}, {
  tableName: 'coding_problems',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingProblem;
