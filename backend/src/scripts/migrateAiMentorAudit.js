'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize } = require('../config/db');
const { ensureAiMentorAuditSchema } = require('../config/bootstrapAiMentorAuditSchema');

// Authenticate only: this command must not run the application's broad sync or
// unrelated bootstrap migrations against an existing database.
(async () => {
  try {
    await sequelize.authenticate();
    const added = await ensureAiMentorAuditSchema(sequelize);
    console.log(JSON.stringify({ dialect: sequelize.getDialect(), added, verified: true }));
  } catch (error) {
    console.error('AI Mentor audit migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
