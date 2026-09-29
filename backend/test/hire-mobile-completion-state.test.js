const models = require('../src/models');
const controller = require('../src/controllers/assessmentVerificationController');

afterEach(() => jest.restoreAllMocks());

function response() {
  return { json: jest.fn(function json(value) { this.body = value; return this; }),
    status: jest.fn(function status(value) { this.statusCode = value; return this; }) };
}

test('room verification and a completed monitor never report assessment completion', async () => {
  const session = { session_id: 'paired-hire', attempt_id: 23, assessment_type: 'CODING',
    participant_id: 7, assessment_id: 12,
    status: 'COMPLETED', mobile_verified: true, update: jest.fn() };
  jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue(session);
  jest.spyOn(models.MonitoringSession, 'findOne').mockResolvedValue({
    metadata: { hireProctoring: { policy: { enabled: true } } },
  });
  jest.spyOn(models.CodingAttempt, 'findByPk').mockResolvedValue({ status: 'IN_PROGRESS' });
  const res = response();
  await controller.getMobileStatus({ params: { token: 'paired-hire' } }, res);
  expect(res.body).toMatchObject({ isEnded: false });
  expect(session.update).not.toHaveBeenCalled();
});

test('a submitted attempt reports genuine assessment completion', async () => {
  jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue({
    session_id: 'submitted-hire', attempt_id: 23, assessment_type: 'CODING',
    status: 'USED', mobile_verified: true, update: jest.fn().mockResolvedValue(true),
  });
  jest.spyOn(models.CodingAttempt, 'findByPk').mockResolvedValue({ status: 'SUBMITTED' });
  const res = response();
  await controller.getMobileStatus({ params: { token: 'submitted-hire' } }, res);
  expect(res.body).toMatchObject({ isEnded: true, status: 'COMPLETED' });
});

test('mobile status reports workspace readiness only after the stored scan passes every check', async () => {
  jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue({
    session_id: 'hire-room', attempt_id: 23, assessment_type: 'CODING',
    participant_id: 7, assessment_id: 12, status: 'PAIRED', mobile_verified: false,
  });
  jest.spyOn(models.CodingAttempt, 'findByPk').mockResolvedValue({ status: 'IN_PROGRESS' });
  const hire = { policy: { enabled: true }, roomScanClear: true,
    roomScanCompletedAt: new Date().toISOString(), roomScanSampleIds: Array(5).fill('sample'),
    roomSimilarityReport: { result: 'PASS' }, roomPostScanReport: { result: 'PASS', arcDegrees: 180, reviewedSectors: 5,
      checks: { coverage: true, baseline: true, person: true, computer: true, unauthorizedObjects: true } } };
  jest.spyOn(models.MonitoringSession, 'findOne').mockResolvedValue({ metadata: { hireProctoring: hire } });
  const res = response();
  await controller.getMobileStatus({ params: { token: 'hire-room' } }, res);
  expect(res.body).toMatchObject({ isEnded: false, hireFraming: true, workspaceReady: true });
  hire.roomPostScanReport.checks.baseline = false;
  const rejected = response();
  await controller.getMobileStatus({ params: { token: 'hire-room' } }, rejected);
  expect(rejected.body.workspaceReady).toBe(false);
});
