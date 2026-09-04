'use strict';

// Integration check against the configured DB. New attempt/exchange rows are
// created inside one outer transaction and ALWAYS rolled back (sequence gaps
// are possible). No existing candidate's attempt or evaluation is changed.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('node:assert/strict');
const { sequelize } = require('../config/db');
const { CodingAttempt, CodingAiHelp } = require('../models');
const mentor = require('../services/codingAiAssistantService');

(async () => {
  let outer;
  const originalTransaction = sequelize.transaction.bind(sequelize);
  try {
    await sequelize.authenticate();
    assert.equal(sequelize.getDialect(), 'postgres', 'This rollback integration check targets PostgreSQL');
    const columns = await sequelize.getQueryInterface().describeTable('coding_ai_help');
    assert.deepEqual([columns.possible_leak_detected.type, columns.possible_leak_detected.allowNull, columns.possible_leak_detected.defaultValue], ['BOOLEAN', false, false]);
    for (const attr of Object.values(CodingAiHelp.rawAttributes)) {
      assert.ok(columns[attr.field], `Missing model column: ${attr.field}`);
    }
    const [fixtures] = await sequelize.query(`
      SELECT a.assessment_id, a.participant_id, p.id AS problem_id
      FROM coding_attempts a
      JOIN coding_assessments assessment ON assessment.id = a.assessment_id
      JOIN coding_problems p ON p.assessment_id = a.assessment_id
      WHERE assessment.ai_assistant_enabled = TRUE
      ORDER BY a.id DESC, p.id ASC LIMIT 1
    `);
    assert.ok(fixtures.length, 'An existing coding assessment, question, and participant are needed for foreign keys');
    const fixture = fixtures[0];
    outer = await originalTransaction();
    const attempt = await CodingAttempt.create({ assessmentId: fixture.assessment_id, participantId: fixture.participant_id, status: 'IN_PROGRESS', aiHelpUsage: {} }, { transaction: outer });
    // Route service transactions through savepoints under the rollback-only
    // attempt. Its initial ownership read must also see this uncommitted row.
    sequelize.transaction = callback => originalTransaction({ transaction: outer }, callback);
    CodingAttempt.addHook('beforeFind', 'mentor-db-regression', options => { options.transaction = outer; });
    const request = { attemptId: attempt.id, problemId: fixture.problem_id, participantId: fixture.participant_id, question: 'Can you explain what this problem is asking?', language: 'python' };

    // Reproduce the missing-column error using an empty TEMP table shadowing
    // the real table in a savepoint. The real schema is never altered/dropped.
    const quoted = name => sequelize.getQueryInterface().quoteIdentifier(name);
    const oldColumns = Object.keys(columns).filter(c => !['possible_leak_detected','leak_reasons'].includes(c)).map(quoted).join(', ');
    const schema = sequelize.options.define?.schema || 'public';
    await assert.rejects(originalTransaction({ transaction: outer }, async savepoint => {
      await sequelize.query(`CREATE TEMP TABLE coding_ai_help ON COMMIT DROP AS SELECT ${oldColumns} FROM ${quoted(schema)}.coding_ai_help WITH NO DATA`, { transaction: savepoint });
      await CodingAiHelp.create({ attemptId: attempt.id, problemId: fixture.problem_id, participantId: fixture.participant_id, prompt: 'Schema regression', response: 'Schema regression' }, { transaction: savepoint });
    }), error => error.original?.code === '42703' && /possible_leak_detected/.test(error.message));
    console.log('PASS: exact missing-column error reproduced in a rollback-only temporary table');

    const prompts = ['Can you explain what this problem is asking?', 'Can you give me a hint?', 'I wrote this code but it gives an error.', 'Can you explain the error?'];
    for (let index = 0; index < 10; index++) {
      const response = await mentor.grantAssist({ ...request, question: prompts[index % prompts.length] });
      assert.equal(response.usageUsed, index + 1);
      assert.ok(response.response?.trim());
      assert.equal(typeof response.possibleLeakDetected, 'boolean');
      console.log(`PASS: real mentor service + PostgreSQL exchange ${index + 1}/10`);
    }
    const records = await CodingAiHelp.findAll({ where: { attemptId: attempt.id }, transaction: outer, order: [['usageNumber','ASC']] });
    assert.equal(records.length, 10);
    assert.ok(records.every(r => typeof r.possibleLeakDetected === 'boolean' && r.created_at));
    assert.equal((await mentor.getStatus(request)).used, 10);
    // Also exercise DB default independently of Sequelize's model default.
    const [defaults] = await sequelize.query(`INSERT INTO coding_ai_help (attempt_id, problem_id, participant_id, prompt, response, usage_number, created_at, updated_at) VALUES (:attempt, :problem, :participant, 'Default check', 'Default check', 11, NOW(), NOW()) RETURNING possible_leak_detected, leak_reasons`, {
      replacements: { attempt: attempt.id, problem: fixture.problem_id, participant: fixture.participant_id }, transaction: outer,
    });
    assert.equal(defaults[0].possible_leak_detected, false);
    assert.equal(defaults[0].leak_reasons, null);
    console.log('PASS: reporting reads, Boolean types, timestamps, usage count, and SQL default FALSE');
  } catch (error) {
    console.error('Database integration check failed:', error.message);
    process.exitCode = 1;
  } finally {
    sequelize.transaction = originalTransaction;
    CodingAttempt.removeHook('beforeFind', 'mentor-db-regression');
    if (outer) { await outer.rollback(); console.log('Rolled back all integration-test attempt and exchange rows'); }
    await sequelize.close();
  }
})();
