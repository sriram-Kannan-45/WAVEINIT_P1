'use strict';

const migration = require('../../database/migrations/20260903b-add-ai-mentor-leak-flag');

async function ensureAiMentorAuditSchema(sequelize) {
  const qi = sequelize.getQueryInterface();
  const added = await migration.up(qi);
  const columns = await qi.describeTable('coding_ai_help');
  const flag = columns.possible_leak_detected;
  const falseDefault = [false, 0, '0', 'false'].includes(flag?.defaultValue);
  if (!flag || !/BOOLEAN|TINYINT\(1\)/i.test(flag.type) || flag.allowNull || !falseDefault || !columns.leak_reasons) {
    throw new Error('coding_ai_help audit schema is inconsistent: expected possible_leak_detected BOOLEAN NOT NULL DEFAULT FALSE and leak_reasons');
  }
  return added;
}

module.exports = { ensureAiMentorAuditSchema };
