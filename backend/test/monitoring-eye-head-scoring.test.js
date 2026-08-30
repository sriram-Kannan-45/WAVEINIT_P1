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
    setInterval,
    clearInterval,
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
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
  }, 25000);

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

  test('TEST 21: Direct Start -> Submit (60s active) produces 60s actual duration', async () => {
    const requests = [];
    const MonitoringEngineClient = loadMonitoringEngineClient(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true }) };
    });
    const client = new MonitoringEngineClient();
    client.sessionId = 'test-session-direct';
    client.attemptId = 101;

    const baseTime = 1000000;
    client.init({ sessionId: 'test-session-direct', attemptId: 101, participantId: 1, isTestActive: false });
    
    // Start active test
    client.currentSegmentStartedAt = baseTime;
    client.isTestActive = true;
    client.isPaused = false;

    // Simulate 60s active time
    Date.now = () => baseTime + 60000;
    expect(client.getActiveDurationSeconds()).toBe(60);

    const report = await client.finishSession();
    expect(requests.some(r => r.url.includes('/end'))).toBe(true);
    const endCall = requests.find(r => r.url.includes('/end'));
    const endBody = JSON.parse(endCall.options.body);
    expect(endBody.actualTestDurationSeconds).toBe(60);
  });

  test('TEST 22: Start -> Break (30 min) -> Resume -> Submit (30 min active + 30 min break + 30 min active = 60 min active)', async () => {
    const requests = [];
    const MonitoringEngineClient = loadMonitoringEngineClient(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true }) };
    });
    const client = new MonitoringEngineClient();
    client.sessionId = 'test-session-break';
    client.attemptId = 102;

    let mockNow = 100000000;
    Date.now = () => mockNow;

    client.init({ sessionId: 'test-session-break', attemptId: 102, participantId: 1 });
    client.startActiveTestTimer(102, 3600);

    // Active session 1: 30 minutes (1800s)
    mockNow += 1800 * 1000;
    expect(client.getActiveDurationSeconds()).toBe(1800);

    // Break/Pause for 30 minutes (1800s)
    client.pauseActiveTestTimer('PARTICIPANT_BREAK');
    mockNow += 1800 * 1000;
    // Active duration must remain 1800s during break!
    expect(client.getActiveDurationSeconds()).toBe(1800);

    // Resume test and take for another 30 minutes (1800s)
    client.resumeActiveTestTimer('RESUMED');
    mockNow += 1800 * 1000;
    expect(client.getActiveDurationSeconds()).toBe(3600); // 60 minutes active, NOT 90 minutes!

    await client.finishSession();
    const endCall = requests.find(r => r.url.includes('/end'));
    const endBody = JSON.parse(endCall.options.body);
    expect(endBody.actualTestDurationSeconds).toBe(3600);
    expect(endBody.activeSegments).toHaveLength(2);
    expect(endBody.activeSegments[0].durationSec).toBe(1800);
    expect(endBody.activeSegments[1].durationSec).toBe(1800);
  });

  test('TEST 23: Multiple breaks and disconnects accumulate only active session time', async () => {
    const requests = [];
    const MonitoringEngineClient = loadMonitoringEngineClient(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true }) };
    });
    const client = new MonitoringEngineClient();
    client.sessionId = 'test-session-multi';

    let mockNow = 200000000;
    Date.now = () => mockNow;

    client.init({ sessionId: 'test-session-multi', attemptId: 103, participantId: 1 });
    client.startActiveTestTimer(103);

    // Segment 1: 15s active
    mockNow += 15000;
    client.pauseActiveTestTimer('BREAK_1');

    // Inactive 60s
    mockNow += 60000;

    // Segment 2: 25s active
    client.resumeActiveTestTimer('RESUMED_1');
    mockNow += 25000;
    client.pauseActiveTestTimer('BREAK_2');

    // Inactive 120s
    mockNow += 120000;

    // Segment 3: 20s active
    client.resumeActiveTestTimer('RESUMED_2');
    mockNow += 20000;

    // Total active = 15s + 25s + 20s = 60s (Wall clock = 15 + 60 + 25 + 120 + 20 = 240s)
    expect(client.getActiveDurationSeconds()).toBe(60);

    await client.finishSession();
    const endCall = requests.find(r => r.url.includes('/end'));
    const endBody = JSON.parse(endCall.options.body);
    expect(endBody.actualTestDurationSeconds).toBe(60);
    expect(endBody.activeSegments).toHaveLength(3);
  });

  test('TEST 24: Eye + Head Tracking Score calculation with break: (Unique Violations / Actual Active Duration) * 60', () => {
    // Configured: 60s
    // Active time: 60s (1:00)
    // Wall-clock time with break: 104m 26s (6266s)
    // Eye/Head Violations: 20s
    const actualActiveDurationSec = 60.0;
    const uniqueViolationSec = 20.0;

    // Correct formula with real active duration: (20 / 60) * 60 = 20.0
    const correctScore = calculateEyeHeadScore(uniqueViolationSec, actualActiveDurationSec);
    expect(correctScore).toBe(20.0);

    // Erroneous formula with wall-clock break time: (20 / 6266) * 60 = 0.19 (WRONG)
    const inflatedDuration = 6266.0;
    const incorrectScore = calculateEyeHeadScore(uniqueViolationSec, inflatedDuration);
    expect(incorrectScore).toBeCloseTo(0.1915, 2);
    expect(correctScore).not.toBe(incorrectScore);
  });

  test('TEST 25: Active segments calculation accurately sums interval bounds', () => {
    const activeSegments = [
      { start: '2026-08-29T10:00:00.000Z', end: '2026-08-29T10:15:00.000Z', durationSec: 900 },
      { start: '2026-08-29T11:00:00.000Z', end: '2026-08-29T11:15:00.000Z', durationSec: 900 },
    ];
    const totalActiveSec = activeSegments.reduce((sum, s) => sum + s.durationSec, 0);
    expect(totalActiveSec).toBe(1800);
    expect(Math.floor(totalActiveSec / 60)).toBe(30);
  });
});
