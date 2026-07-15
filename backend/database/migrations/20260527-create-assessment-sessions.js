/**
 * Migration: create assessment_sessions
 * ─────────────────────────────────────────────────────────────────────────
 * Adds the table that backs the secure assessment session-locking system
 * (see src/models/AssessmentSession.js).
 *
 * NOTE: This project doesn't currently use sequelize-cli to run migrations
 * (it bootstraps tables via `sequelize.sync({ alter: true })` inside
 * src/app.js, scoped per-model so unrelated schemas aren't touched). This
 * file is therefore primarily an audit-trail document of the schema.
 *
 * To run it manually once you wire up sequelize-cli:
 *   npx sequelize-cli db:migrate
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('assessment_sessions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      attempt_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
        references: { model: 'quiz_attempts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quiz_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'ai_quizzes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      participant_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      device_fingerprint: { type: Sequelize.STRING(512), allowNull: true },
      session_token: { type: Sequelize.STRING(512), allowNull: false },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'EXPIRED', 'RESET'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      locked_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      reset_by_admin: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reset_at: { type: Sequelize.DATE, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('assessment_sessions', ['participant_id', 'quiz_id', 'status']);
    await queryInterface.addIndex('assessment_sessions', ['session_token']);
    await queryInterface.addIndex('assessment_sessions', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('assessment_sessions');
  },
};
