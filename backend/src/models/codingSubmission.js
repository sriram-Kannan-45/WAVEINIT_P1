const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingSubmission = sequelize.define('CodingSubmission', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  attemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'attempt_id'
  },
  problemId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'problem_id'
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'javascript'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'RUNNING', 'COMPILING', 'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'OUTPUT_LIMIT_EXCEEDED', 'PRESENTATION_ERROR', 'INTERNAL_ERROR', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  totalTestCases: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_test_cases'
  },
  passedTestCases: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'passed_test_cases'
  },
  executionTime: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'execution_time',
    comment: 'Execution time in seconds (decimal)'
  },
  memoryUsed: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'memory_used',
    comment: 'Memory used in MB'
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0
  },
  output: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of test case results'
  },
  compilerOutput: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'compiler_output'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  },
  failedTestCase: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'failed_test_case',
    comment: 'Index of first failed test case (1-based)'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'submitted_at'
  }
}, {
  tableName: 'coding_submissions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingSubmission;
