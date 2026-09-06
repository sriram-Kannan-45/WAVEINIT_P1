'use strict';

/**
 * Fix distributed_locks.token column length.
 *
 * ROOT CAUSE: DistributedLock.token was VARCHAR(64), but every leader-guarded
 * job generates a token of the form `{instanceId}-{suffix}` where instanceId is
 * the Azure WEBSITE_INSTANCE_ID (a 64-character hex hash) — e.g.
 * `f9119f33201dcae45166c24eaac7e40d09260d107ded4822b2625b9081eb8cfb-35ec9c99`
 * (73 chars). This overflowed the column and raised:
 *   SequelizeDatabaseError: value too long for type character varying(64)
 *   (PostgreSQL error 22001)
 * breaking every DistributedLock.create() call and all cron jobs:
 *   monitorAutoSubmit, quizAutoClose, expireStaleSessions,
 *   expireGracePeriodSessions, autoSubmitExpiredSessions.
 *
 * FIX: widen token to VARCHAR(255) while preserving existing rows, the unique
 * lock_key constraint, and the ownership semantics (release still matches token).
 */

module.exports = {
  async up(qi) {
    const dialect = qi.sequelize.getDialect();
    const run = async transaction => {
      const options = transaction ? { transaction } : {};
      if (dialect === 'postgres') {
        await qi.sequelize.query('SELECT pg_advisory_xact_lock(20260906, 1)', options);
        await qi.sequelize.query("SET LOCAL lock_timeout = '10s'", options);
      }
      const tables = await qi.showAllTables(options);
      if (!tables.some(table => (table.tableName || table) === 'distributed_locks')) {
        return ['distributed_locks table missing (no-op)'];
      }
      const columns = await qi.describeTable('distributed_locks', options);
      if (!columns.token) return ['distributed_locks.token already exists'];
      if (dialect === 'postgres') {
        const [rows] = await qi.sequelize.query(
          "SELECT character_maximum_length AS len FROM information_schema.columns WHERE table_name = 'distributed_locks' AND column_name = 'token'",
          options,
        );
        const currentLen = Number(rows && rows.length ? (rows[0].len ?? rows[0].character_maximum_length) : 0);
        if (currentLen < 255) {
          await qi.sequelize.query(
            'ALTER TABLE "distributed_locks" ALTER COLUMN "token" TYPE VARCHAR(255)',
            options,
          );
          return ['distributed_locks.token widened to VARCHAR(255)'];
        }
        return ['distributed_locks.token already wide (no-op)'];
      }
      // MySQL / others — Sequelize changeColumn.
      await qi.changeColumn('distributed_locks', 'token', {
        type: qi.sequelize.Sequelize.STRING(255),
        allowNull: false,
      }, options);
      return ['distributed_locks.token widened to VARCHAR(255)'];
    };
    return dialect === 'postgres' ? qi.sequelize.transaction(run) : run();
  },

  async down(qi) {
    // Down is intentionally a no-op / format-only change; we keep the larger
    // column so existing tokens are never truncated.
    const columns = await qi.describeTable('distributed_locks');
    if (!columns.token) return;
  },
};
