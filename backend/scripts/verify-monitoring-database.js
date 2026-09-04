// Real database verification, with every fixture write rolled back. No existing
// participant attempt is submitted or edited. Run from backend/ after migration.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const models = require('../src/models');
const { sequelize, MonitoringSession, MonitoringEvent, ProctoringEvent } = models;
const service = require('../src/services/monitoringService');
const excel = require('../src/services/monitoringExcelService');
const ExcelJS = require('exceljs');

(async () => {
  const outer = await sequelize.transaction();
  const query = sequelize.query.bind(sequelize);
  const transaction = sequelize.transaction.bind(sequelize);
  const videoService = require('../src/services/monitoringVideoService');
  const aggregate = videoService.aggregateSession;
  // Keep real service queries and nested ingestion transactions inside this
  // rollback boundary, including queries made by report/export helpers.
  sequelize.query = (sql, options = {}) => query(sql, { ...options, transaction: options.transaction || outer });
  sequelize.transaction = (options, callback) => typeof options === 'function'
    ? transaction({ transaction: outer }, options)
    : transaction({ ...options, transaction: options?.transaction || outer }, callback);
  videoService.aggregateSession = async () => {};
  try {
    for (const contextType of ['QUIZ', 'CODING']) {
      const Attempt = contextType === 'QUIZ' ? models.QuizAttempt : models.CodingAttempt;
      const contextField = contextType === 'QUIZ' ? 'quizId' : 'assessmentId';
      const attempt = await Attempt.findOne({ attributes: ['id', 'participantId', contextField] });
      assert.ok(attempt, `A ${contextType} attempt is needed for foreign-key verification`);
      const sessionId = `rollback-monitoring-${randomUUID()}`;
      await MonitoringSession.create({ sessionId, contextType, attemptId: attempt.id,
        participantId: attempt.participantId, contextId: attempt[contextField],
        status: 'ACTIVE', laptopStatus: 'ACTIVE', calibrationPassed: true,
        startedAt: new Date(Date.now() - 600000),
        metadata: { configuredDurationSeconds: 600, actualTestDurationSeconds: 600 },
      });
      const incident = index => ({ sessionId, eventType: 'TAB_SWITCH', severity: 'WARNING',
        durationMs: 2000, occurredAt: new Date(Date.now() - 20000 + index * 3000).toISOString(),
        metadata: { browserIncidentId: `incident-${index}`, signals: { tabHidden: true, windowBlur: true, fullscreenExit: true } },
      });
      // Concurrent requests and retries must preserve four distinct incidents.
      const responses = await Promise.all([1, 2, 3, 4].map(index => service.reportEvent(incident(index))));
      await service.syncTestDuration({ sessionId, activeDurationSeconds: 600 });
      assert.deepEqual(responses.map(r => r.browserSwitchCount), [1, 2, 3, 4]);
      assert.deepEqual(responses.map(r => r.scoreDelta), [0, 0, 0, 10]);
      const duplicate = await service.reportEvent({ ...incident(4), eventType: 'FULLSCREEN_EXIT' });
      assert.equal(duplicate.reason, 'IDEMPOTENT_DUPLICATE');
      assert.equal(await MonitoringEvent.count({ where: { monitoringSessionId: sessionId } }), 4);
      assert.equal(await ProctoringEvent.count({ where: { monitoringSessionId: sessionId } }), 4);
      const report = await service.endSession({ sessionId, actualTestDurationSeconds: 600 });
      assert.equal(report.tabSwitchCount, 4);
      assert.equal(report.tabSwitchScore, 10);
      assert.equal(report.finalScore, 10);
      assert.equal(report.graceWarningsCount, 3);
      const saved = await MonitoringSession.findOne({ where: { sessionId } });
      assert.equal(saved.status, 'COMPLETED');
      assert.equal(saved.metadata.browserSwitchCount, 4);
      assert.equal(saved.metadata.finalAudit.score, 10);
      assert.equal(saved.metadata.actualTestDurationSeconds, 600);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await excel.generateReportBuffer(report.events, report));
      const values = new Map();
      workbook.getWorksheet('Summary').eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value));
      assert.equal(values.get('  Tab Switch Score'), '10.00 / 10');
      assert.equal(values.get('  Total Proctoring Mark'), '10.00 / 100');
      // An offline event that occurred before submission can arrive afterward;
      // it must refresh the persisted final snapshot too.
      await service.reportEvent(incident(5));
      const afterRetry = await MonitoringSession.findOne({ where: { sessionId } });
      assert.equal(afterRetry.metadata.browserSwitchCount, 5);
      assert.equal(afterRetry.metadata.finalAudit.totalEvents, 5);
      assert.equal(afterRetry.metadata.finalAudit.score, 10);
      console.log(`PASS ${contextType}: real database ingestion, concurrent counts, duplicate retry, both event stores, saved final report and Excel penalty`);
    }
  } finally {
    sequelize.query = query;
    sequelize.transaction = transaction;
    videoService.aggregateSession = aggregate;
    await outer.rollback();
    await sequelize.close();
    console.log('All verification fixture writes rolled back.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
