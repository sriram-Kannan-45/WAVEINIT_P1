/**
 * test-api-response-benchmark.js
 * ─────────────────────────────────────────────────────────────
 * End-to-end performance and latency auditor for feedWeb LMS API.
 * Validates that all major query paths & controllers respond in < 2.00 seconds.
 */

const { sequelize } = require('../src/config/db');
const { bootstrapPerformanceIndexes } = require('../src/config/bootstrapPerformanceIndexes');
const cacheService = require('../src/services/cacheService');
const {
  User, Training, Course, Lesson, Enrollment, Feedback, AIQuiz, CodingAssessment
} = require('../src/models');
const reportController = require('../src/controllers/reportController');
const trainerCourseController = require('../src/controllers/trainerCourseController');
const participantCourseController = require('../src/controllers/participantCourseController');
const adminController = require('../src/controllers/adminController');
const adminSummaryController = require('../src/controllers/adminSummaryController');

// Mock Express response helper
function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    }
  };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('  LMS API END-TO-END AUDIT & RESPONSE TIME BENCHMARK');
  console.log('  Target threshold: All responses < 2000ms');
  console.log('====================================================\n');

  await sequelize.authenticate();
  console.log('✓ Database connected successfully');
  await bootstrapPerformanceIndexes();

  // Find sample users
  const adminUser = await User.findOne({ where: { role: 'ADMIN', isDeleted: false } }) || { id: 1, role: 'ADMIN' };
  const trainerUser = await User.findOne({ where: { role: 'TRAINER', isDeleted: false } }) || { id: 2, role: 'TRAINER' };
  const participantUser = await User.findOne({ where: { role: 'PARTICIPANT', isDeleted: false } }) || { id: 3, role: 'PARTICIPANT' };

  console.log(`[AUDIT] Using test subjects: Admin(id: ${adminUser.id}), Trainer(id: ${trainerUser.id}), Participant(id: ${participantUser.id})\n`);

  const results = [];

  async function benchmarkEndpoint(name, category, testFn) {
    const start = process.hrtime.bigint();
    let error = null;
    let statusCode = 200;

    try {
      await testFn();
    } catch (err) {
      error = err.message;
      statusCode = 500;
    }

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const passed = !error && durationMs < 2000;

    results.push({
      name,
      category,
      durationMs,
      passed,
      error
    });

    const statusIcon = passed ? '✓' : '✗';
    const timeColor = durationMs < 500 ? '⚡' : durationMs < 1500 ? '⏱' : '⚠';
    console.log(`[${category}] ${statusIcon} ${name}: ${durationMs.toFixed(2)}ms ${timeColor} ${error ? `(ERROR: ${error})` : ''}`);
  }

  // 1. Database & Core Infrastructure
  await benchmarkEndpoint('Database Ping / Connection Pool Query', 'DATABASE', async () => {
    await sequelize.query('SELECT 1 + 1 AS result');
  });

  await benchmarkEndpoint('Performance Index Bootstrapping (Warm Cache)', 'DATABASE', async () => {
    await bootstrapPerformanceIndexes();
  });

  // 2. Trainer Course Endpoints
  await benchmarkEndpoint('Trainer: listMyCourses (Page 1)', 'TRAINER', async () => {
    const req = { user: trainerUser, query: { page: 1, limit: 10 } };
    const res = createMockRes();
    await trainerCourseController.listMyCourses(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Trainer: listMyCourses (All Unpaginated)', 'TRAINER', async () => {
    const req = { user: trainerUser, query: {} };
    const res = createMockRes();
    await trainerCourseController.listMyCourses(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  // 3. Participant Course Endpoints
  await benchmarkEndpoint('Participant: listMyCourses', 'PARTICIPANT', async () => {
    const req = { user: participantUser, query: {} };
    const res = createMockRes();
    await participantCourseController.listMyCourses(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  // 4. Report Endpoints (Fresh & Cached)
  await benchmarkEndpoint('Admin Report (Cold / Fresh Query)', 'REPORTS', async () => {
    const req = { user: adminUser, query: { fresh: 'true' } };
    const res = createMockRes();
    await reportController.getAdminReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Admin Report (Cached Fast Path)', 'REPORTS', async () => {
    const req = { user: adminUser, query: {} };
    const res = createMockRes();
    await reportController.getAdminReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Trainer Report (Cold / Fresh Query)', 'REPORTS', async () => {
    const req = { user: trainerUser, query: { fresh: 'true' } };
    const res = createMockRes();
    await reportController.getTrainerReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Trainer Report (Cached Fast Path)', 'REPORTS', async () => {
    const req = { user: trainerUser, query: {} };
    const res = createMockRes();
    await reportController.getTrainerReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Participant Report (Cold / Fresh Query)', 'REPORTS', async () => {
    const req = { user: participantUser, query: { fresh: 'true' } };
    const res = createMockRes();
    await reportController.getParticipantReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Participant Report (Cached Fast Path)', 'REPORTS', async () => {
    const req = { user: participantUser, query: {} };
    const res = createMockRes();
    await reportController.getParticipantReport(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  // 5. Admin Dashboard & Operations
  await benchmarkEndpoint('Admin: Dashboard Summary (Fresh)', 'ADMIN', async () => {
    const req = { user: adminUser, query: { fresh: 'true' } };
    const res = createMockRes();
    await adminSummaryController.getDashboardSummary(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Admin: Dashboard Summary (Cached)', 'ADMIN', async () => {
    const req = { user: adminUser, query: {} };
    const res = createMockRes();
    await adminSummaryController.getDashboardSummary(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Admin: getStats (Fresh)', 'ADMIN', async () => {
    const req = { user: adminUser, query: { fresh: 'true' } };
    const res = createMockRes();
    await adminController.getStats(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Admin: getStats (Cached)', 'ADMIN', async () => {
    const req = { user: adminUser, query: {} };
    const res = createMockRes();
    await adminController.getStats(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  await benchmarkEndpoint('Admin: getParticipants (Page 1)', 'ADMIN', async () => {
    const req = { user: adminUser, query: { page: 1, limit: 10 } };
    const res = createMockRes();
    await adminController.getParticipants(req, res);
    if (res.statusCode >= 400) throw new Error(`Status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });

  // 6. Structure & Bulk Delete Controller Readiness
  await benchmarkEndpoint('Bulk Delete Lessons (Validation & Execution Safety)', 'STRUCTURE', async () => {
    const req = {
      user: trainerUser,
      params: { courseId: 999999 },
      body: { lessonIds: [999998, 999999] }
    };
    const res = createMockRes();
    await trainerCourseController.bulkDeleteLessons(req, res);
    // Should return 404 (course not found) within milliseconds safely without crash
    if (res.statusCode !== 404 && res.statusCode !== 200) {
      throw new Error(`Unexpected status code: ${res.statusCode}`);
    }
  });

  console.log('\n====================================================');
  console.log('                  AUDIT SUMMARY');
  console.log('====================================================');
  const allPassed = results.every(r => r.passed);
  const maxDuration = Math.max(...results.map(r => r.durationMs));
  const avgDuration = results.reduce((acc, r) => acc + r.durationMs, 0) / results.length;

  console.log(`Total Endpoints Audited: ${results.length}`);
  console.log(`Passed SLA (< 2000ms):    ${results.filter(r => r.passed).length} / ${results.length}`);
  console.log(`Average Latency:         ${avgDuration.toFixed(2)}ms`);
  console.log(`Worst-Case Latency:      ${maxDuration.toFixed(2)}ms`);

  if (!allPassed) {
    console.error('\nFAILED: One or more endpoints violated the 2.0s SLA or threw an error:');
    results.filter(r => !r.passed).forEach(r => {
      console.error(` - [${r.category}] ${r.name}: ${r.durationMs.toFixed(2)}ms, error: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All endpoints and database queries respond well within 2 seconds! ✓');
    process.exit(0);
  }
}

runBenchmark().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
