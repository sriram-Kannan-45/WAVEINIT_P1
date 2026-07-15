const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * QuizResultsAudit
 * ────────────────
 * Immutable audit log written every time a trainer publishes (or overrides)
 * quiz results. Provides a traceable history for compliance and debugging.
 *
 * action:
 *   'published'      — normal publish (pending === 0)
 *   'override_used'  — trainer forced publish despite pending participants
 */
const QuizResultsAudit = sequelize.define('QuizResultsAudit', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'quiz_id',
  },
  action: {
    type: DataTypes.ENUM('published', 'override_used'),
    allowNull: false,
    defaultValue: 'published',
  },
  performedBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'performed_by',
  },
  enrolledCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    field: 'enrolled_count',
  },
  completedCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    field: 'completed_count',
  },
  pendingCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    field: 'pending_count',
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'quiz_results_audit',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // immutable rows — no updated_at
});

module.exports = QuizResultsAudit;
