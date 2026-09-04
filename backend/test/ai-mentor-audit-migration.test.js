'use strict';
const migration = require('../database/migrations/20260903b-add-ai-mentor-leak-flag');
const { ensureAiMentorAuditSchema } = require('../src/config/bootstrapAiMentorAuditSchema');

test('PostgreSQL migration is atomic, additive, and idempotent', async () => {
  const columns = { coding_ai_help: {}, quiz_ai_help: {} };
  const transaction = { id: 'test' };
  const sequelize = { getDialect: () => 'postgres', query: jest.fn(), transaction: async cb => cb(transaction) };
  const qi = {
    sequelize,
    showAllTables: async () => ['coding_ai_help', { tableName: 'quiz_ai_help' }],
    describeTable: async table => columns[table],
    addColumn: jest.fn(async (table, name, spec, opts) => {
      expect(opts.transaction).toBe(transaction);
      columns[table][name] = { ...spec, type: spec.type.toString() };
    }),
  };
  sequelize.getQueryInterface = () => qi;
  expect(await ensureAiMentorAuditSchema(sequelize)).toHaveLength(4);
  expect(columns.coding_ai_help.possible_leak_detected).toMatchObject({ type: 'BOOLEAN', allowNull: false, defaultValue: false });
  expect(await ensureAiMentorAuditSchema(sequelize)).toEqual([]);
  expect(qi.addColumn).toHaveBeenCalledTimes(4);
});

test('migration failures propagate instead of being treated as already applied', async () => {
  const qi = { sequelize: { getDialect: () => 'mysql' }, showAllTables: async () => ['coding_ai_help'], describeTable: async () => ({}), addColumn: async () => { throw new Error('Permission denied'); } };
  await expect(migration.up(qi)).rejects.toThrow('Permission denied');
});
