/**
 * Regression tests for monitoring-session object-level ownership (IDOR guard).
 *
 * A participant must only be able to start/pause/resume/sync/end their own
 * monitoring session, upload evidence/video/segments to it, and list their own
 * reports. Admins and trainers keep their existing review ability. This applies
 * uniformly to Course and Hire sessions without changing legitimate flows.
 */
const monitoringService = require('../src/services/monitoringService');
const ctrl = require('../src/controllers/monitoringController');

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json: jest.fn(), setHeader: jest.fn(), send: jest.fn() });
const request = (sessionId, user) => ({ params: { id: sessionId }, body: {}, headers: {}, user, get: () => 'localhost', protocol: 'http', query: {} });
const sessionRow = (sessionId, participantId) => ({ sessionId: String(sessionId), participantId, contextType: 'QUIZ', contextId: 9, status: 'ACTIVE', toJSON() { return { ...this }; } });

afterEach(() => jest.restoreAllMocks());

describe('monitoring session ownership guard', () => {
  const enforcedHandlers = [
    ['startTestTimer', 'startTestSession'],
    ['pauseTestTimer', 'pauseTestSession'],
    ['resumeTestTimer', 'resumeTestSession'],
    ['syncTestDuration', 'syncTestDuration'],
    ['validateLaptop', 'validateLaptop'],
    ['getMobilePairingQR', 'generateMobilePairingToken'],
    ['uploadVideo', 'saveSessionVideo'],
    ['endSession', 'endSession'],
    ['getStatus', 'getStatus'],
  ];

  test.each(enforcedHandlers)('%s rejects a PARTICIPANT controlling another candidate session', async (handler, serviceMethod) => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 7));
    const serviceSpy = jest.spyOn(monitoringService, serviceMethod).mockResolvedValue({});
    const res = response();
    const req = request('ms_quiz_1_aaa', { id: 42, role: 'PARTICIPANT' });
    if (handler === 'uploadVideo') req.file = { filename: 'clip.webm', path: 'x' };

    await ctrl[handler](req, res);

    expect(res.statusCode).toBe(403);
    expect(serviceSpy).not.toHaveBeenCalled();
  });

  test('finalizeSegment and uploadSegment reject a foreign session', async () => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_coding_2_bbb', 7));
    const videoService = require('../src/services/monitoringVideoService');
    const regSpy = jest.spyOn(videoService, 'registerSegment').mockResolvedValue({});
    const finSpy = jest.spyOn(videoService, 'finalizeSegment').mockResolvedValue({});
    const upSpy = jest.spyOn(videoService, 'handleSegmentUpload').mockResolvedValue({});
    const res = response();
    const req = request('ms_coding_2_bbb', { id: 42, role: 'PARTICIPANT' });
    req.params.segmentKey = 'seg-1';
    req.file = { filename: 'seg.webm', path: 'x' };
    await ctrl.registerSegment(req, res);
    await ctrl.finalizeSegment(req, res);
    await ctrl.uploadSegment({ ...req, file: req.file }, res);
    expect(res.statusCode).toBe(403);
    expect(regSpy).not.toHaveBeenCalled();
    expect(finSpy).not.toHaveBeenCalled();
    expect(upSpy).not.toHaveBeenCalled();
  });

  test('unknown session id yields 404, not a permission leak', async () => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(null);
    const res = response();
    await ctrl.startTestTimer(request('ms_missing_9_zzz', { id: 42, role: 'PARTICIPANT' }), res);
    expect(res.statusCode).toBe(404);
  });

  test('PARTICIPANT may control their own session', async () => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 42));
    const startSpy = jest.spyOn(monitoringService, 'startTestSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 42));
    const res = response();
    await ctrl.startTestTimer(request('ms_quiz_1_aaa', { id: 42, role: 'PARTICIPANT' }), res);
    expect(res.statusCode).toBe(200);
    expect(startSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'ms_quiz_1_aaa' }));
  });

  test('ADMIN may control any monitoring session', async () => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 7));
    const startSpy = jest.spyOn(monitoringService, 'startTestSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 7));
    const res = response();
    await ctrl.startTestTimer(request('ms_quiz_1_aaa', { id: 1, role: 'ADMIN' }), res);
    expect(res.statusCode).toBe(200);
    expect(startSpy).toHaveBeenCalled();
  });

  test('PARTICIPANT status polling works on their own session', async () => {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 42));
    const statusSpy = jest.spyOn(monitoringService, 'getStatus').mockResolvedValue({ sessionId: 'ms_quiz_1_aaa' });
    const res = response();
    await ctrl.getStatus(request('ms_quiz_1_aaa', { id: 42, role: 'PARTICIPANT' }), res);
    expect(res.statusCode).toBe(200);
    expect(statusSpy).toHaveBeenCalled();
  });

  test('PARTICIPANT reports list is scoped to their own id', async () => {
    const listSpy = jest.spyOn(monitoringService, 'getReportsList').mockResolvedValue({ sessions: [], total: 0 });
    const res = response();
    await ctrl.getReportsList(
      { ...request('none', { id: 42, role: 'PARTICIPANT' }), query: { contextType: 'QUIZ', contextId: '9' } },
      res,
    );
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ participantId: 42 }));
  });

  test('ADMIN reports list may pass explicit participant filter', async () => {
    const listSpy = jest.spyOn(monitoringService, 'getReportsList').mockResolvedValue({ sessions: [], total: 0 });
    const res = response();
    await ctrl.getReportsList(
      { ...request('none', { id: 1, role: 'ADMIN' }), query: { contextType: 'QUIZ', contextId: '9', participantId: '177' } },
      res,
    );
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ participantId: '177' }));
  });

  test('recordCalibration and recordEvent keep their existing service-level guards', async () => {
    const calSpy = jest.spyOn(monitoringService, 'recordCalibration').mockRejectedValue(new Error('Unauthorized for this monitoring session'));
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(sessionRow('ms_quiz_1_aaa', 7));
    const res = response();
    await ctrl.recordCalibration(request('ms_quiz_1_aaa', { id: 42, role: 'PARTICIPANT' }), res, { passed: true });
    expect(calSpy).toHaveBeenCalled();
    // recordEvent's server-side attribution is unchanged: session mismatch still throws.
    await expect(monitoringService.reportEvent({
      sessionId: 'ms_quiz_1_aaa', participantId: 42, eventType: 'FACE_ABSENT',
    })).rejects.toThrow('another candidate');
  });
});