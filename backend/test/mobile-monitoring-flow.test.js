jest.mock('../src/models', () => Object.fromEntries([
  'AssessmentVerificationSession', 'MonitoringSession', 'MonitoringEvent', 'MonitoringConfig', 'ProctoringEvent',
  'QuizAttempt', 'CodingAttempt', 'AIQuiz', 'CodingAssessment', 'User',
  'ExamSession', 'Violation', 'DeviceFingerprint', 'ProctorActivity',
].map(name => [name, Object.fromEntries(['findAll', 'findAndCountAll', 'findOne', 'findByPk', 'findOrCreate', 'count', 'create', 'update'].map(method => [method, jest.fn()]))])));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/socket/crossInstance', () => ({ emitToRoom: jest.fn(), relayEmit: jest.fn() }));
jest.mock('../src/services/aiQuizService', () => ({}));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../src/config/socket', () => ({ getIO: () => null }));

const { Op } = require('sequelize');
const models = require('../src/models');
models.sequelize = { literal: require('sequelize').literal, transaction: jest.fn(callback => callback({ LOCK: { UPDATE: 'UPDATE' } })) };
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
  models.MonitoringEvent.findOne.mockImplementation(async ({where}) => events.find(e=>e.idempotencyKey===where.idempotencyKey) || null);
  service.activeMobileViolations.clear();
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


const crypto = require('crypto');
const axios = require('axios');
const verification = require('../src/services/assessmentVerificationService');
const pairingVersion = crypto.createHash('sha256').update('test-pairing-token').digest('hex');

test.each(['CODING', 'QUIZ'])('%s concurrent initialization locks the attempt and reuses one QR session', async assessmentType => {
  const Attempt = assessmentType === 'CODING' ? models.CodingAttempt : models.QuizAttempt;
  let release, persisted = null;
  let previous = Promise.resolve();
  const transactions = [];
  jest.spyOn(models.sequelize, 'transaction').mockImplementation(async callback => {
    const before = previous;
    let unlock;
    previous = new Promise(resolve => { unlock = resolve; });
    const tx = { LOCK: { UPDATE: 'UPDATE' }, before };
    transactions.push(tx);
    try { return await callback(tx); } finally { unlock(); }
  });
  Attempt.findOne.mockImplementation(async ({ transaction, lock, where }) => {
    expect(lock).toBe('UPDATE');
    expect(where).toMatchObject({ id:17, participantId:7, status:'IN_PROGRESS' });
    await transaction.before;
    return { id:17 };
  });
  models.AssessmentVerificationSession.findOne.mockImplementation(async ({transaction}) => {
    expect(transactions).toContain(transaction);
    return persisted;
  });
  models.AssessmentVerificationSession.create.mockImplementation(async (data, {transaction}) => {
    expect(transactions).toContain(transaction);
    await new Promise(resolve => { release = resolve; });
    persisted = { ...data, update:jest.fn() };
    return persisted;
  });
  const args = { participantId:7, assessmentType, assessmentId:10, attemptId:17 };
  const requests = [verification.createOrGetSession(args), verification.createOrGetSession(args)];
  await new Promise(resolve => setImmediate(resolve));
  release();
  const [first, second] = await Promise.all(requests);
  expect(first.session.session_id).toBe(second.session.session_id);
  expect(models.AssessmentVerificationSession.create).toHaveBeenCalledTimes(1);
});
const mobile = () => ({session_id:'verification', token:'test-pairing-token', participant_id:7, attempt_id:17,
  assessment_id:10, assessment_type:'CODING', status:'USED', expires_at:new Date(Date.now()+600000),
  update:async function(values) { Object.assign(this,values); }});
const phoneArgs = s => ({sessionId:s.sessionId, participantId:7, source:'MOBILE', eventType:'PHONE_DETECTED', severity:'HIGH',
  serverMobileDetection:true, metadata:{mobileEvidence:{phone_stable:true}}, confidence:0.85});

function aiResponse(phone = true, eligible = true) {
  axios.post.mockResolvedValue({ data:{ success:true, composition_state:eligible?'VALID':'WAITING_FOR_LAPTOP',
    mobile_evidence:{eligible,phone_stable:phone,phone_confidence:0.9},detections:[] } });
}

test.each(['QUIZ','CODING'])('%s stable phone adds exactly ten once including first event and report reload/completion', async type => {
  const s = sessions.find(s=>s.contextType===type);
  const first=await service.reportEvent(phoneArgs(s));
  expect(first.scoreDelta).toBe(10);
  expect(first.isGraceWarning).toBe(false);
  for(let n=0;n<5;n++) { service.inMemoryCooldowns.clear(); await service.reportEvent(phoneArgs(s)); }
  expect(events).toHaveLength(1);
  expect(s.score).toBe(10);
  expect(s.metadata.mobile_phone_score_awarded).toBe(true);
  for (const status of ['ACTIVE','COMPLETED','COMPLETED']) {
    s.status=status;
    const report=await service.getReport({sessionId:s.sessionId});
    expect(report.mobilePhoneDetected).toBe(true);
    expect(report.mobilePhoneScore).toBe(10);
    expect(report.finalScore).toBe(10);
    expect(report.scoringBreakdown.mobile.count).toBe(1);
  }
  await service.reportEvent(phoneArgs(s));
  expect(events).toHaveLength(1);
});

test('desktop phone, untrusted mobile events and no phone do not award the mobile ten', async () => {
  const s=sessions[1];
  await service.reportEvent({...phoneArgs(s),source:'LAPTOP',serverMobileDetection:false});
  await service.reportEvent({...phoneArgs(s),serverMobileDetection:false});
  const report=await service.getReport({sessionId:s.sessionId});
  expect(report.mobilePhoneScore).toBe(0);
  expect(report.mobilePhoneDetected).toBe(false);
  expect(events.filter(e=>e.source==='MOBILE')).toHaveLength(0);
});

test('phone frames before entry and before active monitoring never score', async () => {
  const s=sessions[1], v=mobile(); aiResponse();
  v.status='PAIRED';
  await service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:v});
  expect(events).toHaveLength(0);
  v.status='USED'; s.status='CALIBRATING';
  await service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:v});
  expect(events).toHaveLength(0);
});

test('sampled detections persist bounded leases and one phone event, not each frame', async () => {
  const s=sessions[1], v=mobile(); aiResponse();
  const save=jest.spyOn(s,'update');
  let now=Date.now(); jest.spyOn(Date,'now').mockImplementation(()=>now);
  for(let n=0;n<10;n++) { await service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:v}); now+=600; }
  expect(events).toHaveLength(1);
  // Three lease updates plus the one scoring update.
  expect(save.mock.calls.length).toBeLessThanOrEqual(4);
  expect(s.score).toBe(10);
});

test('one inference in flight per session and no client participant/module override', async () => {
  const s=sessions[1], v=mobile();
  let resolve; axios.post.mockImplementation(()=>new Promise(r=>resolve=r));
  const running=service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:v});
  await new Promise(r=>setImmediate(r));
  expect((await service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:v})).busy).toBe(true);
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post.mock.calls[0][1]).toMatchObject({participantId:7,moduleType:'CODING',cameraSource:'MOBILE_CAMERA'});
  resolve({data:{success:false}}); await running;
  await expect(service.validateMobile({sessionId:s.sessionId,participantId:88,frame:'jpeg',verificationSession:v})).rejects.toThrow();
  await expect(service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg'})).rejects.toThrow();
});

test('verify-start requires exact ownership, stable recent evidence and current pairing generation', async () => {
  const v=mobile(), s=sessions[1]; v.status='PAIRED';
  models.AssessmentVerificationSession.findOne.mockImplementation(async ({where}) =>
    where.participant_id===7 && where.attempt_id===17 && where.assessment_type==='CODING' ? v:null);
  const args={participantId:7,assessmentType:'CODING',assessmentId:10,attemptId:17,sessionId:v.session_id};
  expect((await verification.verifySessionForStart(args)).valid).toBe(false);
  s.metadata.mobileEvidence={eligible:true,receivedAt:Date.now(),verificationSessionId:v.session_id,pairingVersion};
  expect((await verification.verifySessionForStart({...args,participantId:8})).valid).toBe(false);
  expect((await verification.verifySessionForStart(args)).valid).toBe(true);
  expect(s.metadata.mobileAdmission.verificationSessionId).toBe(v.session_id);
  s.metadata.mobileEvidence.receivedAt=Date.now()-6000;
  expect((await verification.verifySessionForStart(args)).valid).toBe(false);
  s.metadata.mobileEvidence.receivedAt=Date.now(); v.token='rotated';
  expect((await verification.verifySessionForStart(args)).valid).toBe(false);
});

test('permission-only request never marks either camera verified', async () => {
  const v=mobile(); v.status='PENDING'; models.AssessmentVerificationSession.findOne.mockResolvedValue(v);
  const result=await verification.recordMobileCameraReady({token:v.token,deviceInfo:{permission:true}});
  expect(result.isFullyVerified).toBe(false);
  expect(v.mobile_verified).not.toBe(true);
  expect(v.laptop_verified).not.toBe(true);
});

test('start-test and admission deny bypass, allow admitted attempt, and retain completed status', async () => {
  const s=sessions[1]; s.mobileEnabled=true; s.status='CALIBRATING';
  await expect(service.startTestSession({sessionId:s.sessionId})).rejects.toThrow(/verification/);
  await expect(verification.assertAttemptAdmitted({participantId:7,assessmentType:'CODING',attemptId:17})).rejects.toThrow();
  s.metadata.mobileAdmission={verificationSessionId:'verification'};
  await service.startTestSession({sessionId:s.sessionId});
  expect(s.status).toBe('ACTIVE');
  s.status='COMPLETED'; await service.startTestSession({sessionId:s.sessionId});
  expect(s.status).toBe('COMPLETED');
});

test('attempt-scoped phone award stays in the report when a monitoring session is recreated', async () => {
  const first=sessions[1]; await service.reportEvent(phoneArgs(first));
  const saved=events[0];
  first.sessionId='recreated-coding-session'; first.score=0; first.metadata={actualTestDurationSeconds:600};
  models.MonitoringEvent.findOne.mockImplementation(async ({where})=>where.idempotencyKey===saved.idempotencyKey?saved:null);
  const report=await service.getReport({sessionId:first.sessionId});
  expect(report.mobilePhoneScore).toBe(10);
  service.inMemoryCooldowns.clear(); await service.reportEvent(phoneArgs(first));
  expect(events).toHaveLength(1);
});

test('no phone in actual inference response creates no phone event', async () => {
  aiResponse(false); const s=sessions[1];
  for(let n=0;n<4;n++) await service.validateMobile({sessionId:s.sessionId,participantId:7,frame:'jpeg',verificationSession:mobile()});
  expect(events).toHaveLength(0);
  expect((await service.getReport({sessionId:s.sessionId})).mobilePhoneScore).toBe(0);
});

test('socket handshake ACK follows authorized membership and rejects wrong role/room/peer', async () => {
  const handlers={}, joined=[]; const ack=jest.fn();
  const socket={ id:'phone', userId:7, assessmentMobileClaims:{token:'test-pairing-token'}, data:{},
    on:(event,fn)=>handlers[event]=fn, join:async room=>joined.push(room), emit:jest.fn() };
  const io={in:()=>({fetchSockets:async()=>[{id:'laptop',data:{assessmentVerification:{role:'laptop'}}}]})};
  jest.spyOn(verification,'authorizeSocket').mockResolvedValue({session:mobile(),monitor:sessions[1]});
  require('../src/socket/assessmentVerificationEvents')(io,socket);
  await handlers['assessment_verif:join']({sessionId:'verification',role:'mobile_camera'},ack);
  expect(joined).toEqual(['assessment_verif_verification']);
  expect(ack).toHaveBeenCalledWith({ok:true,sessionId:'verification'});
  const relay=require('../src/socket/crossInstance'); relay.relayEmit.mockClear();
  await handlers['assessment_verif:offer']({sessionId:'someone-else',targetSocketId:'laptop',offer:{type:'offer'}});
  await handlers['assessment_verif:offer']({sessionId:'verification',targetSocketId:'intruder',offer:{type:'offer'}});
  expect(relay.relayEmit).not.toHaveBeenCalled();
  await handlers['assessment_verif:offer']({sessionId:'verification',targetSocketId:'laptop',offer:{type:'offer'}});
  expect(relay.relayEmit).toHaveBeenCalledTimes(1);
  expect(handlers['assessment_verif:complete']).toBeUndefined();
  expect(handlers['assessment_verif:start_assessment']).toBeUndefined();
  await handlers['assessment_verif:join']({sessionId:'verification',role:'laptop'},ack);
  expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({ok:false}));
});

test.each(['CODING','QUIZ'])('%s rescans the admitted camera QR after expiry without resetting the test or scoring', async type => {
  const s=sessions.find(item=>item.contextType===type), v=mobile();
  v.assessment_type=type; v.expires_at=new Date(Date.now()-7200000); v.socket_token='old-expired-jwt';
  v.update=jest.fn(); s.update=jest.fn(); s.score=10;
  s.metadata.mobileAdmission={verificationSessionId:v.session_id};
  s.metadata.mobile_phone_score_awarded=true;
  const before=JSON.stringify({metadata:s.metadata,startedAt:s.startedAt,score:s.score,status:s.status});
  const Attempt=type==='CODING'?models.CodingAttempt:models.QuizAttempt;
  Attempt.findOne.mockResolvedValue({id:17,status:'IN_PROGRESS'});
  models.AssessmentVerificationSession.findOne.mockResolvedValue(v);
  const reconnect=await verification.getReconnectQr({sessionId:v.session_id,participantId:7});
  expect(reconnect.sessionId).toBe(v.session_id);
  expect(reconnect.qrPayload.shortUrl).toContain(v.token);
  for(let i=0;i<3;i++) {
    const result=await verification.validatePairingToken(v.token);
    expect(result).toMatchObject({success:true,sessionId:v.session_id,attemptId:17,isAssessmentStarted:true,status:'USED'});
    expect(result.socketToken).not.toBe(v.socket_token);
    expect(require('jsonwebtoken').decode(result.socketToken).exp).toBeGreaterThan(Date.now()/1000);
  }
  expect(JSON.stringify({metadata:s.metadata,startedAt:s.startedAt,score:s.score,status:s.status})).toBe(before);
  expect(v.update).not.toHaveBeenCalled(); expect(s.update).not.toHaveBeenCalled();
});

test('camera rescan rejects ended, unadmitted, mismatched and foreign attempts', async () => {
  const v=mobile(), s=sessions[1]; models.AssessmentVerificationSession.findOne.mockResolvedValue(v);
  models.CodingAttempt.findOne.mockResolvedValue({id:17});
  s.metadata.mobileAdmission={verificationSessionId:v.session_id};
  s.status='COMPLETED';
  expect((await verification.validatePairingToken(v.token)).success).toBe(false);
  s.status='ACTIVE'; delete s.metadata.mobileAdmission;
  expect((await verification.validatePairingToken(v.token)).success).toBe(false);
  s.metadata.mobileAdmission={verificationSessionId:'other-verification'};
  expect((await verification.validatePairingToken(v.token)).success).toBe(false);
  s.metadata.mobileAdmission={verificationSessionId:v.session_id}; models.CodingAttempt.findOne.mockResolvedValue(null);
  expect((await verification.validatePairingToken(v.token)).success).toBe(false);
  models.AssessmentVerificationSession.findOne.mockResolvedValue(null); models.MonitoringSession.findOne.mockResolvedValue(null);
  await expect(verification.getReconnectQr({sessionId:v.session_id,participantId:99})).rejects.toThrow();
});
