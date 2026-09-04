jest.mock('../src/models', () => Object.fromEntries([
  'MonitoringSession', 'MonitoringEvent', 'MonitoringConfig', 'ProctoringEvent',
  'QuizAttempt', 'CodingAttempt', 'AIQuiz', 'CodingAssessment', 'User',
  'ExamSession', 'Violation', 'DeviceFingerprint', 'ProctorActivity',
].map(name => [name, Object.fromEntries(['findAll', 'findAndCountAll', 'findOne', 'findByPk', 'findOrCreate', 'count', 'create', 'update'].map(method => [method, jest.fn()]))])));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/socket/crossInstance', () => ({ emitToRoom: jest.fn() }));
jest.mock('../src/services/aiQuizService', () => ({}));

const { Op } = require('sequelize');
const models = require('../src/models');
models.sequelize = { transaction: jest.fn(callback => callback({ LOCK: { UPDATE: 'UPDATE' } })) };
const service = require('../src/services/monitoringService');
const legacy = require('../src/services/proctoringService');
const ExcelJS = require('exceljs');
const excel = require('../src/services/monitoringExcelService');

let sessions, events;
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  service.inMemoryCooldowns.clear();
  events = [];
  sessions = ['QUIZ', 'CODING'].map(contextType => ({
    id: contextType === 'QUIZ' ? 1 : 2, sessionId: `session-${contextType}`,
    attemptId: 17, participantId: 7, contextId: 10, contextType,
    status: 'ACTIVE', startedAt: new Date('2026-09-04T10:00:00Z'),
    endedAt: new Date('2026-09-04T10:10:00Z'),
    metadata: { configuredDurationSeconds: 600, actualTestDurationSeconds: 600 },
    score: 0, totalEvents: 0, warningEvents: 0, highEvents: 0, criticalEvents: 0,
    save: jest.fn(), update: async function(values) { Object.assign(this, values); },
  }));
  jest.spyOn(service, 'getSession').mockImplementation(async id => sessions.find(s => s.sessionId === id));
  models.MonitoringSession.findOne.mockImplementation(async ({ where }) => sessions.find(s => Object.entries(where).every(([k,v]) => s[k] === v)));
  models.MonitoringConfig.findAll.mockResolvedValue([]);
  models.MonitoringEvent.count.mockImplementation(async ({ where }) => events.filter(e => e.monitoringSessionId === where.monitoringSessionId).length);
  models.MonitoringEvent.findOrCreate.mockImplementation(async ({ where, defaults }) => {
    const old = events.find(e => e.idempotencyKey === where.idempotencyKey);
    if (old) return [old, false];
    const event = { ...defaults, ...where, id: events.length + 1 };
    events.push(event);
    return [event, true];
  });
  models.MonitoringEvent.findAll.mockImplementation(async ({ where }) => events.filter(e => e.monitoringSessionId === where.monitoringSessionId && (!where.eventType || where.eventType[Op.in].includes(e.eventType))));
  models.ProctoringEvent.findAll.mockResolvedValue([]);
  models.ProctoringEvent.findOrCreate.mockResolvedValue([{}, true]);
  models.QuizAttempt.findByPk.mockResolvedValue(null);
  models.CodingAttempt.findByPk.mockResolvedValue(null);
});

test('Coding inherits Quiz defaults, database overrides, and fallback rather than Coding overrides', async () => {
  models.MonitoringConfig.findAll.mockResolvedValue([
    { contextType: 'QUIZ', key: 'grace_counts', value: { gaze: 9 } },
    { contextType: 'CODING', key: 'grace_counts', value: { gaze: 99 } },
  ]);
  const quiz = await service.getConfig('QUIZ');
  expect(quiz.grace_counts.gaze).toBe(9);
  expect(await service.getConfig('coding')).toEqual(quiz);
  models.MonitoringConfig.findAll.mockRejectedValue(new Error('offline'));
  expect(await service.getConfig('CODING')).toEqual(await service.getConfig('QUIZ'));
});

test('same events retain Quiz grace allowance, browser threshold, final score and Excel marks in Coding', async () => {
  let now = new Date('2026-09-04T10:00:10Z').getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  for (let i = 0; i < 7; i++) {
    now += 16000;
    for (const session of sessions) {
      const result = await service.reportEvent({ sessionId: session.sessionId, eventType: 'FULLSCREEN_EXIT', severity: 'HIGH', durationMs: 2000 });
      expect(result.success).toBe(true);
      expect(result.warningNumber).toBe(i + 1);
      expect(result.isGraceWarning).toBe(i < 3);
      expect(session.status).toBe('ACTIVE');
    }
    const reports = await Promise.all(sessions.map(s => service.getReport({ attemptId: 17, contextType: s.contextType })));
    expect(reports[1].contextType).toBe('CODING');
    expect(reports[1].scoringBreakdown).toEqual(reports[0].scoringBreakdown);
    expect(reports[1].tabSwitchCount).toBe(i + 1);
    // The first three browser switches are warnings; the fourth adds the existing 10-point penalty.
    expect(reports[1].tabSwitchScore).toBe(i >= 3 ? 10 : 0);
    expect(reports[1].finalScore).toBe(i >= 3 ? 10 : 0);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await excel.generateReportBuffer(reports[1].events, reports[1]));
    const values = new Map();
    book.getWorksheet('Summary').eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value));
    expect(values.get('  Tab Switch Score')).toBe(`${reports[1].tabSwitchScore.toFixed(2)} / 10`);
    expect(values.get('  Total Proctoring Mark')).toBe(`${reports[1].finalScore.toFixed(2)} / 100`);
    expect(values.get('  Grace Warnings')).toBe(reports[1].graceWarningsCount);
    expect(book.getWorksheet('Warnings').rowCount - 1).toBe(reports[1].graceWarningsCount);
  }
  for (const call of models.MonitoringEvent.count.mock.calls) expect(Object.keys(call[0].where)).toEqual(['monitoringSessionId']);
  for (const call of models.ProctoringEvent.findAll.mock.calls) expect(Object.keys(call[0].where)).toEqual(['monitoringSessionId']);
});

test.each(['QUIZ', 'CODING'])('%s counts rapid distinct browser incidents once despite concurrent retries and unrelated AI warnings', async contextType => {
  const session = sessions.find(s => s.contextType === contextType);
  const now = new Date('2026-09-04T10:01:00Z').getTime();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  await service.reportEvent({sessionId:session.sessionId,eventType:'FACE_ABSENT',severity:'WARNING',durationMs:2000});
  const incident = index => ({sessionId:session.sessionId,eventType:'TAB_SWITCH',severity:'WARNING',durationMs:2000,
    occurredAt:new Date(now+index*2100).toISOString(),metadata:{browserIncidentId:`switch-${index}`}});
  const results = await Promise.all([1,2,3,4].map(i=>service.reportEvent(incident(i))));
  expect(results.map(r=>r.browserSwitchCount)).toEqual([1,2,3,4]);
  expect(results.map(r=>r.scoreDelta)).toEqual([0,0,0,10]);
  expect((await service.reportEvent({...incident(4),eventType:'FULLSCREEN_EXIT'})).reason).toBe('IDEMPOTENT_DUPLICATE');
  const report=await service.getReport({sessionId:session.sessionId});
  expect(report.tabSwitchCount).toBe(4);
  expect(report.tabSwitchScore).toBe(10);
  expect(session.totalEvents).toBe(5);
  expect(session.metadata.browserSwitchCount).toBe(4);
  expect(session.status).toBe('ACTIVE');
});

test('late lifecycle requests cannot reopen a completed assessment or overwrite its final timing', async () => {
  const session=sessions[0];
  session.status='COMPLETED';
  await service.startTestSession({sessionId:session.sessionId});
  await service.resumeTestSession({sessionId:session.sessionId});
  await service.pauseTestSession({sessionId:session.sessionId});
  await service.syncTestDuration({sessionId:session.sessionId,activeDurationSeconds:9999});
  expect(session.status).toBe('COMPLETED');
  expect(session.metadata.actualTestDurationSeconds).toBe(600);
  expect(session.save).not.toHaveBeenCalled();
});

test('Coding duration and session start never resolve through an overlapping Quiz attempt ID', async () => {
  delete sessions[1].metadata.actualTestDurationSeconds;
  models.QuizAttempt.findByPk.mockResolvedValue({ timeTaken: 10 });
  models.CodingAttempt.findByPk.mockResolvedValue({ timeTaken: 300 });
  const report = await service.getReport({ attemptId: 17, contextType: 'CODING' });
  expect(report.actualTestDurationSeconds).toBe(300);
  expect(models.QuizAttempt.findByPk).not.toHaveBeenCalled();
  await service.startTestSession({ sessionId: 'session-CODING', attemptId: 17 });
  expect(models.MonitoringSession.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ where: { sessionId: 'session-CODING' }, lock: 'UPDATE' }));
});

test('report lists display and filter the same audit score as individual and Excel reports', async () => {
  sessions[1].score = 99;
  sessions[1].riskLevel = 'CRITICAL';
  models.MonitoringSession.findAndCountAll.mockResolvedValue({ count: 1, rows: [sessions[1]] });
  const list = await service.getReportsList({ contextType: 'CODING' });
  expect(list.sessions[0].score).toBe(0);
  expect(list.sessions[0].riskLevel).toBe('LOW');
  expect((await service.getReportsList({ contextType: 'CODING', riskLevel: 'CRITICAL' })).sessions).toEqual([]);
  expect((await service.getReportsList({ contextType: 'CODING', riskLevel: 'LOW' })).total).toBe(1);
});

test('configuration updates through Coding modify the shared Quiz policy', async () => {
  const row = { update: jest.fn() };
  models.MonitoringConfig.findOrCreate.mockResolvedValue([row, false]);
  await service.updateConfig({ contextType: 'CODING', key: 'grace_counts', value: { gaze: 5 } });
  expect(models.MonitoringConfig.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
    where: { config_key: 'grace_counts', context_type: 'QUIZ' },
  }));
});

test('Excel preserves explicit zero scores even when raw incident counts are nonzero', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await excel.generateReportBuffer([], {
    mobileCount: 2, mobileScore: 0, multipleFaceCount: 2, multipleFaceScore: 0,
    noPersonDetected: true, noPersonScore: 0, tabSwitchCount: 8, tabSwitchScore: 0, finalScore: 0,
  }));
  const values = new Map();
  book.getWorksheet('Summary').eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value));
  for (const label of ['Mobile', 'Multiple Face', 'No Person', 'Tab Switch']) expect(values.get(`  ${label} Score`)).toBe('0.00 / 10');
});

test.each(['quiz', 'coding'])('legacy %s browser events cannot trigger warning-budget termination', async assessmentType => {
  const violations = [];
  models.Violation.create.mockImplementation(async values => { violations.push(values); return values; });
  models.Violation.count.mockImplementation(async ({ where }) => violations.filter(v =>
    typeof where.type === 'string' ? v.type === where.type : where.type[Op.in].includes(v.type)).length);
  const session = {
    id: assessmentType === 'quiz' ? 111 : 222, status: 'ACTIVE', assessmentType,
    quizId: assessmentType === 'quiz' ? 1 : null, assessmentId: assessmentType === 'coding' ? 1 : null,
    proctoringLevel: 'HIGH', warningsCount: 0, save: jest.fn(),
    setDataValue(k,v) { this[k] = v; }, getDataValue(k) { return this[k]; },
  };
  let now = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  for (const type of [...Array(9).fill('FULLSCREEN_EXIT'), 'TAB_SWITCH', 'WINDOW_BLUR', 'COPY_ATTEMPT']) {
    now += 6000;
    expect((await legacy.recordViolation({ session, type })).terminated).toBe(false);
  }
  expect(session.status).toBe('ACTIVE');
  expect(session.warningsCount).toBe(12);
});
