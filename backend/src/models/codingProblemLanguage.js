const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Per-language configuration for a coding problem. Each supported language has
// its OWN starter code, reference solution and optional execution overrides so
// that code is never reused/shared across different programming languages.
const CodingProblemLanguage = sequelize.define('CodingProblemLanguage', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  problemId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'problem_id'
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false
  },
  starterCode: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'starter_code'
  },
  referenceSolution: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'reference_solution'
  },
  starterCodeSource: {
    type: DataTypes.ENUM('generated', 'manual'),
    allowNull: false,
    defaultValue: 'manual',
    field: 'starter_code_source',
    comment: 'Tracks whether the starter code was AI-generated or manually edited (prevents accidental AI overwrites)'
  },
  referenceSolutionSource: {
    type: DataTypes.ENUM('generated', 'manual'),
    allowNull: false,
    defaultValue: 'manual',
    field: 'reference_solution_source',
    comment: 'Tracks whether the reference solution was AI-generated or manually edited'
  },
  generationStatus: {
    type: DataTypes.ENUM('pending', 'generating', 'completed'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'generation_status',
    comment: 'AI generation lifecycle state for this language configuration'
  },
  timeLimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'time_limit',
    comment: 'Optional per-language execution time limit in seconds (falls back to the problem time limit)'
  },
  memoryLimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'memory_limit',
    comment: 'Optional per-language memory limit in MB (falls back to the problem memory limit)'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'coding_problem_languages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['problem_id', 'language']
    }
  ]
});

module.exports = CodingProblemLanguage;
