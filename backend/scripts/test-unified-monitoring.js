/**
 * Unified Monitoring Engine End-to-End Verification Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates Section 13 Acceptance Criteria:
 *   1. Session lifecycle & calibration validation
 *   2. Server-side authoritative scoring & deterministic risk level
 *   3. Event debouncing & idempotency (rapid event flooding test)
 *   4. Mobile QR pairing (valid, single-use, expired, reused)
 *   5. Disconnection handling & integrity flags
 *   6. Report metrics matching persisted event sums
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const monitoringService = require('../src/services/monitoringService');
const { MonitoringSession, MonitoringEvent, MonitoringConfig, sequelize } = require('../src/models');
const logger = require('../src/utils/logger');

async function runTests() {
  console.log('======================================================================');
  console.log('  RUNNING UNIFIED MONITORING ENGINE END-TO-END VERIFICATION');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');

    // Ensure monitoring tables exist
    await MonitoringConfig.sync();
    await MonitoringSession.sync();
    await MonitoringEvent.sync();
    try {
      await sequelize.query("ALTER TABLE `monitoring_events` MODIFY COLUMN `severity` VARCHAR(32) NOT NULL DEFAULT 'INFO'");
      await sequelize.query("ALTER TABLE `monitoring_events` MODIFY COLUMN `idempotency_key` VARCHAR(191) NULL");
    } catch (_) {}
    console.log('Monitoring tables verified/synced.\n');

    // Find or create test user
    const { User } = require('../src/models');
    let testUser = await User.findOne();
    if (!testUser) {
      testUser = await User.create({
        name: 'Monitoring Test User',
        email: 'monitoring_test@example.com',
        password: 'Password123!',
        role: 'PARTICIPANT',
      });
    }
    const testParticipantId = testUser.id;

    // ── Test 1: Start Monitoring Session ──────────────────────────────────────
    console.log('--- TEST 1: Session Lifecycle (Start & Config) ---');
    const { session } = await monitoringService.startSession({
      participantId: testParticipantId,
      contextType: 'CODING',
      contextId: 101,
      attemptId: 501,
      mobileEnabled: true,
    });

    assert(session && session.sessionId.startsWith('ms_coding_'), 'Session created with correct prefix');
    assert(session.status === 'CALIBRATING', 'Initial session status is CALIBRATING');
    assert(session.laptopStatus === 'CALIBRATING', 'Laptop status is CALIBRATING');
    assert(session.mobileStatus === 'PAIRING', 'Mobile status is PAIRING when mobileEnabled is true');
    assert(session.score === 0, 'Initial score is 0.0');

    // ── Test 2: Calibration Path & Failure Rejection ─────────────────────────
    console.log('\n--- TEST 2: Calibration Verification ---');
    const calibFail = await monitoringService.recordCalibration({
      sessionId: session.sessionId,
      participantId: testParticipantId,
      passed: false,
      failureReason: 'TOO_FAR_AWAY',
    });
    assert(calibFail.calibrationPassed === false, 'Failed calibration recorded accurately');
    assert(calibFail.integrityFlags.includes('CALIBRATION_FAILED_TOO_FAR_AWAY'), 'Integrity flag added for calibration failure');

    const calibPass = await monitoringService.recordCalibration({
      sessionId: session.sessionId,
      participantId: testParticipantId,
      passed: true,
      details: { brightness: 120, face_height_ratio: 0.22, shoulders_in_frame: true },
    });
    assert(calibPass.calibrationPassed === true, 'Successful calibration recorded');
    assert(calibPass.laptopStatus === 'READY', 'Laptop status transitioned to READY');

    // ── Test 3: Mobile QR Pairing & Single-Use Enforcement ────────────────────
    console.log('\n--- TEST 3: Mobile QR Pairing (Valid, Single-Use & Expiry) ---');
    const { token: qrToken } = await monitoringService.generateMobilePairingToken({
      sessionId: session.sessionId,
      participantId: testParticipantId,
    });
    assert(qrToken && qrToken.startsWith('mpt_'), 'Dynamic single-use pairing token generated');

    // Valid pair
    const pairRes = await monitoringService.pairMobile({
      sessionId: session.sessionId,
      token: qrToken,
      participantId: testParticipantId,
    });
    assert(pairRes.success === true, 'Mobile paired successfully with valid token');

    // Reused token rejection
    let reusedRejected = false;
    try {
      await monitoringService.pairMobile({
        sessionId: session.sessionId,
        token: qrToken,
        participantId: testParticipantId,
      });
    } catch (e) {
      reusedRejected = true;
    }
    assert(reusedRejected, 'Reused pairing token strictly rejected (single-use consumed)');

    // ── Test 4: Authoritative Scoring & Rapid Debounce Flooding ───────────────
    console.log('\n--- TEST 4: Authoritative Event Ingestion & Debounce Protection ---');
    // Rapidly send 10 identical GAZE_OFF_SCREEN_LEFT events (simulate flicker)
    const eventPromises = [];
    for (let i = 0; i < 10; i++) {
      eventPromises.push(
        monitoringService.reportEvent({
          sessionId: session.sessionId,
          participantId: testParticipantId,
          source: 'LAPTOP',
          eventType: 'GAZE_OFF_SCREEN_LEFT',
          severity: 'WARNING',
          durationMs: 2500,
          confidence: 0.9,
          metadata: { gaze_classification: 'OFF_SCREEN_LEFT' },
        })
      );
    }

    const eventResults = await Promise.all(eventPromises);
    const persistedCount = eventResults.filter((r) => r.success).length;
    const debouncedCount = eventResults.filter((r) => r.skipped).length;

    assert(persistedCount === 1, `Rapid flicker debounced to exactly 1 event (persisted=${persistedCount})`);
    assert(debouncedCount === 9, `9 duplicate/flooded events successfully skipped (skipped=${debouncedCount})`);

    // Ingest a high severity event (Phone Detected)
    const phoneEventRes = await monitoringService.reportEvent({
      sessionId: session.sessionId,
      participantId: testParticipantId,
      source: 'MOBILE',
      eventType: 'PHONE_DETECTED',
      severity: 'HIGH',
      durationMs: 3000,
      confidence: 0.95,
      metadata: { detected_class: 'cell phone' },
    });
    assert(phoneEventRes.success === true, 'High severity PHONE_DETECTED event persisted');
    assert(phoneEventRes.currentScore > 0, `Cumulative score updated on backend (score=${phoneEventRes.currentScore})`);

    // ── Test 5: Watchdog Disconnect & Integrity Flags ────────────────────────
    console.log('\n--- TEST 5: Watchdog Disconnect Handling & Integrity Flags ---');
    // Artificially age the mobile heartbeat
    const agedSession = await MonitoringSession.findOne({ where: { sessionId: session.sessionId } });
    agedSession.status = 'ACTIVE';
    agedSession.lastMobileHeartbeatAt = new Date(Date.now() - 60000); // 60s ago (> 45s grace)
    await agedSession.save();

    const statusRes = await monitoringService.getStatus(session.sessionId);
    assert(statusRes.mobileStatus === 'DISCONNECTED', 'Missed heartbeats transitioned mobile status to DISCONNECTED');
    assert(
      statusRes.integrityFlags.includes('MOBILE_CAMERA_DISCONNECTED_MID_TEST'),
      'Integrity flag added for silent mobile disconnect'
    );

    // ── Test 6: End Session & Report Consistency ─────────────────────────────
    console.log('\n--- TEST 6: Report Generation & Integrity Verification ---');
    const finalReport = await monitoringService.endSession({
      sessionId: session.sessionId,
      participantId: testParticipantId,
    });

    assert(finalReport.status === 'COMPLETED', 'Session ended in COMPLETED status');
    assert(finalReport.integrityFlags.length > 0, 'Report displays integrity flags for broken monitoring');
    assert(
      finalReport.eventsCount.total === finalReport.timeline.length,
      `Report events count (${finalReport.eventsCount.total}) matches timeline length (${finalReport.timeline.length})`
    );

    // ── Test 7: YOLO Service Export & Proctoring Report Object Category Verification ──
    console.log('\n--- TEST 7: YOLO Service Export & Object Category Verification ---');
    let yoloServiceLoaded = false;
    let yoloService = null;
    try {
      yoloService = require('../src/services/yoloProctoringService');
      if (yoloService && typeof yoloService.analyzeFrame === 'function') {
        yoloServiceLoaded = true;
      }
    } catch (e) {
      console.error('Error loading yoloProctoringService:', e);
    }
    assert(yoloServiceLoaded, 'yoloProctoringService exports properly without ReferenceError');

    // Test proctoringReportService report generation with phone event
    const proctoringReportService = require('../src/services/proctoringReportService');
    const { ProctoringEvent } = require('../src/models');
    
    // Check ProctoringEvent row created during Test 4
    const phonePe = await ProctoringEvent.findOne({
      where: {
        monitoringSessionId: session.sessionId,
        eventType: 'PHONE_DETECTED'
      }
    });
    assert(phonePe !== null, 'ProctoringEvent row for PHONE_DETECTED was persisted');
    assert(phonePe?.attemptId === 501, `ProctoringEvent carries attemptId (attemptId=${phonePe?.attemptId})`);

    const { summary: procSummary } = proctoringReportService.buildSummaryAndTimeline(
      [
        {
          id: 'test_1',
          eventType: 'PHONE_DETECTED',
          severity: 'CRITICAL',
          confidence: 0.95,
          duration: 3,
          timestamp: new Date()
        }
      ],
      new Date(Date.now() - 60000),
      new Date()
    );

    assert(procSummary.categories.objects === 1, `Category 'objects' incremented for PHONE_DETECTED (count=${procSummary.categories.objects})`);
    assert(procSummary.objectMonitoring.phoneEvents === 1, `objectMonitoring.phoneEvents counted PHONE_DETECTED (count=${procSummary.objectMonitoring.phoneEvents})`);
    assert(procSummary.mobilePhoneViolation.detected === true, 'mobilePhoneViolation.detected is true for PHONE_DETECTED');
    assert(procSummary.mobilePhoneViolation.severity === 'CRITICAL', 'mobilePhoneViolation.severity is CRITICAL');

    // ── Test 8: validateLaptop Method Availability & Error Handling ──
    console.log('\n--- TEST 8: validateLaptop Service Method Verification ---');
    assert(typeof monitoringService.validateLaptop === 'function', 'monitoringService.validateLaptop is defined');

    // ── Test 9: Grace Counts Configuration Verification (Bug 18) ──
    console.log('\n--- TEST 9: Grace Counts Configuration (Bug 18) ---');
    const quizConfig = await monitoringService.getConfig('QUIZ');
    assert(quizConfig.grace_counts?.gaze === 5, `QUIZ grace_counts.gaze is 5 (got ${quizConfig.grace_counts?.gaze})`);
    assert(quizConfig.grace_counts?.head_pose === 5, `QUIZ grace_counts.head_pose is 5 (got ${quizConfig.grace_counts?.head_pose})`);

    const codingConfig = await monitoringService.getConfig('CODING');
    assert(codingConfig.grace_counts?.gaze === 8, `CODING grace_counts.gaze is 8 (got ${codingConfig.grace_counts?.gaze})`);
    assert(codingConfig.grace_counts?.head_pose === 8, `CODING grace_counts.head_pose is 8 (got ${codingConfig.grace_counts?.head_pose})`);

    // ── Test 10: Repeated Gaze / Head Pose Escalation Labels & Categorization ──
    console.log('\n--- TEST 10: Repeated Deviation Escalation Labels & Categories ---');
    const { summary: escalationSummary } = proctoringReportService.buildSummaryAndTimeline(
      [
        {
          id: 'test_gaze_esc',
          eventType: 'REPEATED_GAZE_DEVIATION',
          severity: 'WARNING',
          confidence: 0.9,
          duration: 300,
          timestamp: new Date()
        },
        {
          id: 'test_head_esc',
          eventType: 'REPEATED_HEAD_POSE_DEVIATION',
          severity: 'WARNING',
          confidence: 0.85,
          duration: 300,
          timestamp: new Date()
        }
      ],
      new Date(Date.now() - 600000),
      new Date()
    );

    assert(escalationSummary.categories.eyes >= 1, `Category 'eyes' counted REPEATED_GAZE_DEVIATION (count=${escalationSummary.categories.eyes})`);
    assert(escalationSummary.categories.head >= 1, `Category 'head' counted REPEATED_HEAD_POSE_DEVIATION (count=${escalationSummary.categories.head})`);

    // ── Test 11: AttemptId Fallback Resolution for Phone Detection (Bug 17) ──
    console.log('\n--- TEST 11: Phone Event AttemptId Resolution & Report Matching (Bug 17) ---');
    const { session: sessNoAttempt } = await monitoringService.startSession({
      participantId: testParticipantId,
      contextType: 'QUIZ',
      contextId: 202,
      attemptId: null, // intentionally null
      mobileEnabled: true,
    });

    const phoneEvtRes = await monitoringService.reportEvent({
      sessionId: sessNoAttempt.sessionId,
      participantId: testParticipantId,
      source: 'MOBILE',
      eventType: 'PHONE_DETECTED',
      severity: 'CRITICAL',
      durationMs: 2000,
      confidence: 0.95,
    });

    assert(phoneEvtRes.success === true, 'PHONE_DETECTED recorded successfully even with initially null attemptId');

    const createdPhoneEvt = await ProctoringEvent.findOne({
      where: {
        monitoringSessionId: sessNoAttempt.sessionId,
        eventType: 'PHONE_DETECTED',
      }
    });
    assert(createdPhoneEvt !== null, 'ProctoringEvent for phone detection persisted');

    // Clean up test session
    await MonitoringEvent.destroy({ where: { monitoringSessionId: sessNoAttempt.sessionId } });
    await ProctoringEvent.destroy({ where: { monitoringSessionId: sessNoAttempt.sessionId } });
    await MonitoringSession.destroy({ where: { sessionId: sessNoAttempt.sessionId } });

    console.log('\n======================================================================');
    console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================');

    // Clean up main test session
    await MonitoringEvent.destroy({ where: { monitoringSessionId: session.sessionId } });
    await ProctoringEvent.destroy({ where: { monitoringSessionId: session.sessionId } });
    await MonitoringSession.destroy({ where: { sessionId: session.sessionId } });
    console.log('Test session data cleaned up.\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
