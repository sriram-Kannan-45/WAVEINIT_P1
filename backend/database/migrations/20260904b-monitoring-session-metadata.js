'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(qi) {
    const migrate = async transaction => {
      const options = transaction ? { transaction } : {};
      if (transaction) {
        await qi.sequelize.query('SELECT pg_advisory_xact_lock(60904, 2)', options);
        await qi.sequelize.query("SET LOCAL lock_timeout = '10s'", options);
      }
      const tables = await qi.showAllTables(options);
      if (!tables.some(table => (table.tableName || table) === 'monitoring_sessions')) return [];
      const columns = await qi.describeTable('monitoring_sessions', options);
      if (columns.metadata) return [];
      await qi.addColumn('monitoring_sessions', 'metadata', { type: DataTypes.JSON, allowNull: true }, options);
      return ['monitoring_sessions.metadata'];
    };
    return qi.sequelize.getDialect() === 'postgres' ? qi.sequelize.transaction(migrate) : migrate();
  },
  async down(qi) {
    const columns = await qi.describeTable('monitoring_sessions');
    if (columns.metadata) await qi.removeColumn('monitoring_sessions', 'metadata');
  },
};
