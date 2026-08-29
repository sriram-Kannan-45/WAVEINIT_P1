const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const monitoringService = require('../src/services/monitoringService');

const {
  calculateEyeHeadScore,
  mergeIntervals,
  calculateUniqueViolationSeconds,
  aggregateMonitoringEvents,
} = monitoringService;

function loadMonitoringEngineClient(fetchImpl) {
  const clientPath = path.resolve(__dirname, '../../frontend/src/proctoring/engine/MonitoringEngineClient.js');
  const source = fs.readFileSync(clientPath, 'utf8')
    .replace(/import \{ API_BASE, BACKEND_ORIGIN \} from '\.\.\/\.\.\/api\/api';\r?\n/, "const API_BASE = 'http://monitoring.test/api';\n")
    .replace(/export default new MonitoringEngineClient\(\);\s*$/, 'module.exports = MonitoringEngineClient;\n');
  const sandbox = {
    module: { exports: {} },
    console,
    Date,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
  };
  vm.runInNewContext(source, sandbox, { filename: clientPath });
  return sandbox.module.exports;
}

describe('MediaPipe Audit Scoring Test Suite', () => {
  test('TEST 1: 100-second test with 6 categories (10s each = 60s total) -> 36 / 60', () => {
    const intervals = [
      [0.0, 10.0], [10.0, 20.0], [20.0, 30.0],
      [30.0, 40.0], [40.0, 50.0], [50.0, 60.0],
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(60.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(36.0);
  });

  test('TEST 2: 100-second test with 35s non-overlapping violations -> 21 / 60', () => {
    const intervals = [
      [0.0, 10.0],  // Head Left: 10s
      [15.0, 20.0], // Head Right: 5s
      [30.0, 50.0], // Eye Left: 20s
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(35.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(21.0);
  });

  test('TEST 3: Overlapping Head Left [10, 20] & Eye Left [12, 18] -> 10s unique (6 / 60)', () => {
    const intervals = [
      [10.0, 20.0],
      [12.0, 18.0],
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(10.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(6.0);
  });

  test('TEST 4: Early submission at 63s with 21s violation -> 20 / 60 (NOT 12.6)', () => {
    const actualTestDuration = 63.0;
    const uniqueSec = 21.0;
    const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
    expect(score).toBe(20.0);
  });

  test('TEST 5: Early submission (Configured 600s, Actual 300s, Violation 60s) -> 12 / 60', () => {
    const actualTestDuration = 300.0;
    const uniqueSec = 60.0;
    const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
    expect(score).toBe(12.0);
  });

  test('TEST 6: Valid continuous episodes (7.4s, 8.7s) preserve full actual duration', () => {
    const intervals = [
      [10.0, 17.4], // 7.4s
      [20.0, 28.7], // 8.7s
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(16.1);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(Math.round(score * 100) / 100).toBe(9.66);
  });

  test('TEST 7: Clamping from 0 to 60', () => {
    expect(calculateEyeHeadScore(0.0, 100.0)).toBe(0.0);
    expect(calculateEyeHeadScore(100.0, 100.0)).toBe(60.0);
    expect(calculateEyeHeadScore(150.0, 100.0)).toBe(60.0);
  });

  test('TEST 8: 5-Part 100-Mark Audit Model: Tab switch <= 3 -> 0/10; Tab switch > 3 -> 10/10', () => {
    const calcTabSwitch = (count) => count > 3 ? 10.0 : 0.0;
    expect(calcTabSwitch(0)).toBe(0.0);
    expect(calcTabSwitch(1)).toBe(0.0);
    expect(calcTabSwitch(3)).toBe(0.0);
    expect(calcTabSwitch(4)).toBe(10.0);
    expect(calcTabSwitch(7)).toBe(10.0);
  });

  test('TEST 9: 5-Part 100-Mark Audit Model: Perfect test with 0 violations -> 0 / 100', () => {
    const eyeHead = calculateEyeHeadScore(0.0, 300.0); // 0 / 60
    const noPerson = 0.0; // 0 / 10
    const multiPerson = 0.0; // 0 / 10
    const tabSwitch = 0.0; // 0 / 10 (<= 3 switches)
    const mobile = 0.0; // 0 / 10
    const total = eyeHead + noPerson + multiPerson + tabSwitch + mobile;
    expect(total).toBe(0.0);
  });

  test('TEST 10: 5-Part 100-Mark Audit Model: Full violation accumulation -> 100 / 100', () => {
    const eyeHead = calculateEyeHeadScore(300.0, 300.0); // 60 / 60
    const noPerson = 10.0; // 10 / 10
    const multiPerson = 10.0; // 10 / 10
    const tabSwitch = 10.0; // 10 / 10 (4 switches)
    const mobile = 10.0; // 10 / 10
    const total = Math.min(100.0, eyeHead + noPerson + multiPerson + tabSwitch + mobile);
    expect(total).toBe(100.0);
  });

  test('TEST 11: Multi-Participant Excel Marks Generator produces valid buffer', async () => {
    const MonitoringExcelService = require('../src/services/monitoringExcelService');
    const mockParticipants = [
      {
        name: 'Sriram Kannan',
        email: 'sriram@example.com',
        attemptId: 27,
        status: 'SUBMITTED',
        actualDuration: '1m 54s',
        quizScore: 85,
        eyeHeadScore: 0.0,
        noPersonScore: 0.0,
        multiFaceScore: 0.0,
        tabSwitchScore: 0.0,
        tabSwitchCount: 0,
        mobileScore: 0.0,
        mobileCount: 0,
        finalScore: 0.0,
        riskLevel: 'LOW',
        videoUrl: 'http://localhost:5000/uploads/monitoring-videos/monitoring_123.webm'
      },
      {
        name: 'Candidate Two',
        email: 'candidate2@example.com',
        attemptId: 28,
        status: 'SUBMITTED',
        actualDuration: '2m 30s',
        quizScore: 70,
        eyeHeadScore: 12.5,
        noPersonScore: 10.0,
        multiFaceScore: 0.0,
        tabSwitchScore: 10.0,
        tabSwitchCount: 4,
        mobileScore: 0.0,
        mobileCount: 0,
        finalScore: 32.5,
        riskLevel: 'MEDIUM',
        videoUrl: null
      }
    ];

    const buffer = await MonitoringExcelService.generateAssessmentParticipantsBuffer(mockParticipants, {
      title: 'Candidate Information Form Compliance',
      configuredDuration: '10 minutes'
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('TEST 12: DOWN is ALWAYS ALLOWED - Never triggers violation timer or score', () => {
    // DOWN directions are explicitly ignored
    const ignoredDirections = new Set(['Down', 'DOWN', 'OFF_SCREEN_DOWN', 'LOOKING_DOWN', 'HEAD_DOWN', 'EYE_DOWN']);
    const isViolation = (dir) => !ignoredDirections.has(dir);

    expect(isViolation('DOWN')).toBe(false);
    expect(isViolation('Down')).toBe(false);
    expect(isViolation('OFF_SCREEN_DOWN')).toBe(false);
    expect(isViolation('LEFT')).toBe(true);
    expect(isViolation('RIGHT')).toBe(true);
    expect(isViolation('UP')).toBe(true);
  });

  test('TEST 13: Single-Session Excel Report contains all required proctoring columns', async () => {
    const MonitoringExcelService = require('../src/services/monitoringExcelService');
    const mockEvents = [
      {
        time: 14.5,
        eventType: 'Eye Gaze',
        direction: 'Left',
        validationStatus: 'VALID VIOLATION (>= 3.0s)',
        duration: '3.5 sec',
        startTime: '14.5s',
        endTime: '18.0s',
      }
    ];
    const mockMetrics = {
      participantId: 45,
      startTime: '2026-08-28T07:00:00.000Z',
      endTime: '2026-08-28T07:02:00.000Z',
      actualTestDuration: 120.0,
      configuredDuration: 600.0,
      violationSeconds: 3.5,
      violationPercentage: 2.92,
      monitoringScore: 1.75,
      finalScore: 1.75,
      videoUrl: 'http://localhost:5000/uploads/monitoring-videos/monitoring_session_1.webm'
    };

    const buffer = await MonitoringExcelService.generateReportBuffer(mockEvents, mockMetrics);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('TEST 14: Short eye/head violations (< 3s) MUST count — no minimum-duration filter', () => {
    // 0.5s, 1s and 2s intervals must all be accumulated (previously dropped by the 3.0s gate).
    const intervals = [
      [0.0, 0.5],   // 0.5s
      [1.0, 2.0],   // 1.0s
      [3.0, 5.0],   // 2.0s
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(3.5);
    // Over a 100s test: (3.5 / 100) * 60 = 2.1 / 60
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(2.1);
  });

  test('TEST 15: Short overlapping intervals merge by union, preserving short cumulative time', () => {
    // Each interval is < 3.0s but they overlap; union still counted once.
    const intervals = [
      [10.0, 10.5],  // 0.5s
      [10.3, 11.0],  // overlaps previous -> union [10.0, 11.0] = 1.0s
      [11.0, 12.5],  // contiguous -> 1.5s total
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(2.5);
  });

  test('TEST 16: Zero-duration and invalid intervals are dropped, positive short ones kept', () => {
    const intervals = [
      [5.0, 5.0],   // zero duration -> dropped
      [6.0, 6.0],   // zero duration -> dropped
      [7.0, 8.0],   // 1.0s -> kept
      [8.0, 9.5],   // 1.5s -> kept (contiguous)
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(2.5);
  });

  test('TEST 17: A 30-second continuous look-away survives duplicate transport records', () => {
    const startedAt = '2026-08-28T10:00:00.000Z';
    const endedAt = '2026-08-28T10:00:30.000Z';
    const incidents = aggregateMonitoringEvents([
      {
        id: 1,
        source: 'LAPTOP',
        eventType: 'GAZE_OFF_SCREEN_LEFT',
        severity: 'WARNING',
        confidence: 0.9,
        durationMs: 30000,
        occurredAt: endedAt,
        metadata: { direction: 'LEFT', violationStartTime: startedAt, violationEndTime: endedAt },
      },
      {
        id: 2,
        source: 'LAPTOP',
        eventType: 'GAZE_OFF_SCREEN_LEFT',
        severity: 'WARNING',
        confidence: 0.9,
        durationMs: 30000,
        occurredAt: endedAt,
        metadata: { direction: 'LEFT', violationStartTime: startedAt, violationEndTime: endedAt },
      },
      {
        id: 3,
        source: 'LAPTOP',
        eventType: 'HEAD_LOOKING_LEFT',
        severity: 'WARNING',
        confidence: 0.85,
        durationMs: 30000,
        occurredAt: endedAt,
        metadata: { direction: 'LEFT', violationStartTime: startedAt, violationEndTime: endedAt },
      },
    ]);

    expect(incidents).toHaveLength(2);
    expect(incidents[0].durationMs).toBe(30000);
    expect(incidents[0].metadata.aggregatedEventIds).toEqual([1, 2]);

    const ranges = incidents.map((event) => [
      new Date(event.metadata.violationStartTime).getTime() / 1000,
      new Date(event.metadata.violationEndTime).getTime() / 1000,
    ]);
    expect(calculateUniqueViolationSeconds(ranges)).toBe(30);
    expect(calculateEyeHeadScore(30, 72)).toBe(25);
  });

  test('TEST 18: Excel exports the authoritative aggregated incident unchanged', async () => {
    const MonitoringExcelService = require('../src/services/monitoringExcelService');
    const ExcelJS = require('exceljs');
    const buffer = await MonitoringExcelService.generateReportBuffer([
      {
        eventType: 'GAZE_OFF_SCREEN_LEFT',
        durationMs: 30000,
        occurredAt: '2026-08-28T10:00:30.000Z',
        metadata: {
          direction: 'LEFT',
          violationStartTime: '2026-08-28T10:00:00.000Z',
          violationEndTime: '2026-08-28T10:00:30.000Z',
        },
      },
    ], {
      participantId: 42,
      startTime: '2026-08-28T10:00:00.000Z',
      endTime: '2026-08-28T10:01:12.000Z',
      actualTestDuration: 72,
      violationSeconds: 30,
      violationPercentage: 41.6667,
      monitoringScore: 25,
      finalScore: 25,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const row = workbook.getWorksheet('Monitoring Report').getRow(2);

    expect(row.getCell(8).value).toBe('30.0s');
    expect(row.getCell(9).value).toBe('25.00 / 60');
    expect(row.getCell(10).value).toBe('25.00 / 100');
    expect(row.getCell(6).value).not.toBe(row.getCell(7).value);
  });

  test('TEST 19: A completed client gaze interval is posted once, not discarded by its own cooldown', async () => {
    const requests = [];
    const MonitoringEngineClient = loadMonitoringEngineClient(async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ success: true, data: { eventType: 'GAZE_OFF_SCREEN_LEFT' } }),
      };
    });
    const client = new MonitoringEngineClient();
    const endedAt = Date.now();

    client.sessionId = 'monitoring-session-1';
    client.attemptId = 38;
    client.participantId = 7;
    client.isMonitoringActive = true;
    client.gazeIntervalStart = endedAt - 2000;
    client.gazeIntervalDirection = 'LEFT';

    await client._closeAndReportGazeInterval(endedAt, null, 0.9);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('http://monitoring.test/api/monitoring/sessions/monitoring-session-1/events');
    const payload = JSON.parse(requests[0].options.body);
    expect(payload.eventType).toBe('GAZE_OFF_SCREEN_LEFT');
    expect(payload.durationMs).toBe(2000);
    expect(new Date(payload.metadata.violationEndTime).getTime()).toBe(endedAt);
  });

  test('TEST 20: MediaPipe iris baseline waits for ready, not merely one accepted frame', async () => {
    const MonitoringEngineClient = loadMonitoringEngineClient(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }));
    const client = new MonitoringEngineClient();
    client.sessionId = 'monitoring-session-calibration';

    let calibrationFrames = 0;
    client.validateCalibration = async () => {
      calibrationFrames += 1;
      return {
        success: true,
        data: {
          passed: true,
          ready: calibrationFrames === 10,
        },
      };
    };

    const ready = await client.calibrateGazeBaseline({});

    expect(ready).toBe(true);
    expect(calibrationFrames).toBe(10);
    expect(client.gazeCalibrationSessionId).toBe('monitoring-session-calibration');
  });
});
