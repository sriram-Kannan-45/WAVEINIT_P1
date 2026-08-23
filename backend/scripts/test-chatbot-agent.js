const assert = require('assert');
const { resolveParticipantAction } = require('../src/services/participantChatbotService');

console.log('🧪 Starting Expanded 42-Point Testing Matrix for LMS Action Agent...\n');

// ── Mock Context: Participant with 1 enrolled course (React) ──
const contextSingle = {
  user: { id: 1048, name: 'Sriram' },
  profile: {
    completionPercent: 85,
    completedSections: 7,
    totalSections: 8,
    missingSections: ['Certifications'],
    headline: 'Frontend Developer',
  },
  courses: [
    {
      courseId: 101,
      courseTitle: 'React JS Essentials',
      progressPercent: 65,
      status: 'ENROLLED',
      lessonsCount: 12,
      nextLesson: { id: 5, title: 'React Hooks & State' },
    },
  ],
  quizzes: {
    completedCount: 1,
    attemptedCount: 1,
    availableList: [
      { id: 201, title: 'React Hooks Quiz', timeLimit: 20 },
    ],
    recentResults: [
      { quizId: 200, percentage: 90, passed: true },
    ],
  },
  certificatesCount: 2,
  certificates: [
    { id: 1, certificateCode: 'CERT-RCT-001' },
    { id: 2, certificateCode: 'CERT-JS-002' },
  ],
  interviews: [
    { id: 301, title: 'Frontend Technical Interview', scheduled_at: '2026-08-25T10:00:00.000Z', duration_minutes: 45 },
  ],
  clientContext: { currentRoute: '/participant', currentTab: 'overview' },
};

// ── Mock Context: Participant with Multiple Courses ──
const contextMulti = {
  ...contextSingle,
  courses: [
    { courseId: 101, courseTitle: 'React JS Essentials', progressPercent: 65, status: 'ENROLLED', nextLesson: { id: 5, title: 'React Hooks & State' } },
    { courseId: 102, courseTitle: 'Java Masterclass', progressPercent: 20, status: 'ENROLLED', nextLesson: { id: 2, title: 'OOP Principles' } },
    { courseId: 103, courseTitle: 'Spring Boot Microservices', progressPercent: 0, status: 'ENROLLED', nextLesson: { id: 1, title: 'Introduction to Spring' } },
  ],
};

// ── Mock Context: Empty / New Participant ──
const contextEmpty = {
  user: { id: 2000, name: 'New Student' },
  profile: {
    completionPercent: 35,
    completedSections: 3,
    totalSections: 8,
    missingSections: ['Resume', 'Skills', 'Experience & Projects', 'Certifications', 'Education'],
  },
  courses: [],
  quizzes: { completedCount: 0, attemptedCount: 0, availableList: [], recentResults: [] },
  certificatesCount: 0,
  certificates: [],
  interviews: [],
  clientContext: { currentRoute: '/my-profile', currentTab: 'profile' },
};

let passedCount = 0;
let totalCount = 0;

function runTest(testName, testFn) {
  totalCount++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}: ${err.message}`);
  }
}

// ── 1. Navigation Commands ──
runTest('1. "Open dashboard" -> navigates to /participant?tab=overview', () => {
  const r = resolveParticipantAction('Open dashboard', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_DASHBOARD');
  assert.strictEqual(r.action.type, 'OPEN_DASHBOARD');
  assert.strictEqual(r.action.tab, 'overview');
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('2. "Open my courses" -> navigates to My Courses (/participant?tab=myEnrollments)', () => {
  const r = resolveParticipantAction('Open my courses', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSES');
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('3. "Open my course" (1 course) -> auto-opens that course directly', () => {
  const r = resolveParticipantAction('Open my course', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('4. "Open my course" (Multiple courses) -> asks clarification with option buttons', () => {
  const r = resolveParticipantAction('Open my course', contextMulti);
  assert.strictEqual(r.intent, 'SELECT_COURSE');
  assert.strictEqual(r.action.type, 'SHOW_SELECTION');
  assert.strictEqual(r.actionButtons.length, 3);
});

runTest('5. "Open React" -> matches course name and auto-opens React', () => {
  const r = resolveParticipantAction('Open React', contextMulti);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('6. "Continue my course" -> resumes from next uncompleted lesson with progress', () => {
  const r = resolveParticipantAction('Continue my course', contextSingle);
  assert.strictEqual(r.intent, 'CONTINUE_COURSE');
  assert.strictEqual(r.action.courseId, 101);
  assert.strictEqual(r.action.lessonId, 5);
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('7. "Start my course" -> opens available course to begin', () => {
  const r = resolveParticipantAction('Start my course', contextSingle);
  assert.strictEqual(r.intent, 'START_COURSE');
  assert.strictEqual(r.action.courseId, 101);
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('8. "Show my profile" -> navigates to /my-profile', () => {
  const r = resolveParticipantAction('Show my profile', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_PROFILE');
  assert.strictEqual(r.action.route, '/my-profile');
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('9. "Edit my profile" -> navigates with edit action', () => {
  const r = resolveParticipantAction('Edit my profile', contextSingle);
  assert.strictEqual(r.intent, 'EDIT_PROFILE');
  assert.strictEqual(r.action.type, 'EDIT_PROFILE');
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('10. "Complete my profile" -> checks profile completion & missing sections', () => {
  const r = resolveParticipantAction('Complete my profile', contextEmpty);
  assert.strictEqual(r.intent, 'COMPLETE_PROFILE');
  assert(r.reply.includes('35%'));
  assert(r.reply.includes('Resume'));
});

// ── 2. Quiz / Assessment Variations (Fixes "the quiz" false-positive bug & navigates to Course AI Quiz subtab) ──
runTest('11. "open the quiz" -> opens course AI Quiz subtab (not unenrolled course or standalone tab)', () => {
  const r = resolveParticipantAction('open the quiz', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('12. "start the quiz" -> opens available quiz on course AI Quiz subtab', () => {
  const r = resolveParticipantAction('start the quiz', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
});

runTest('13. "take the quiz" -> opens available quiz on course AI Quiz subtab', () => {
  const r = resolveParticipantAction('take the quiz', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
});

runTest('14. "open quiz" -> opens available quiz on course AI Quiz subtab', () => {
  const r = resolveParticipantAction('open quiz', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
});

runTest('15. "open React Hooks Quiz" -> matches specific quiz title and navigates to course AI Quiz subtab', () => {
  const r = resolveParticipantAction('open React Hooks Quiz', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
});

runTest('16. "Show my assessments" -> navigates to course AI Quiz subtab (/participant?tab=myEnrollments&courseId=101&subtab=quizzes)', () => {
  const r = resolveParticipantAction('Show my assessments', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_ASSESSMENTS');
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('17. "Start my assessment" -> launches available assessment on course AI Quiz subtab', () => {
  const r = resolveParticipantAction('Start my assessment', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
  assert.strictEqual(r.action.tab, 'myEnrollments');
  assert.strictEqual(r.action.subtab, 'quizzes');
});

runTest('18. "Show my result" -> displays published scores and opens reports', () => {
  const r = resolveParticipantAction('Show my result', contextSingle);
  assert.strictEqual(r.intent, 'VIEW_RESULTS');
  assert.strictEqual(r.action.tab, 'reports');
  assert(r.reply.includes('90%'));
});

runTest('19. "Show my certificates" (2 certs) -> confirms count & navigates to certificates', () => {
  const r = resolveParticipantAction('Show my certificates', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_CERTIFICATES');
  assert.strictEqual(r.action.tab, 'certificates');
  assert(r.reply.includes('2 certificate(s)'));
});

runTest('20. "Show my certificates" (0 certs) -> explains none available without fabricating', () => {
  const r = resolveParticipantAction('Show my certificates', contextEmpty);
  assert.strictEqual(r.intent, 'OPEN_CERTIFICATES');
  assert.strictEqual(r.action, null);
  assert(r.reply.includes("don't have any certificates yet"));
});

runTest('21. "Show my achievements" -> navigates to /participant?tab=achievements', () => {
  const r = resolveParticipantAction('Show my achievements', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_ACHIEVEMENTS');
  assert.strictEqual(r.action.tab, 'achievements');
});

runTest('22. "Show my interviews" -> checks schedule and reports scheduled time', () => {
  const r = resolveParticipantAction('Show my interviews', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_INTERVIEWS');
  assert.strictEqual(r.action.route, '/interviews');
});

runTest('23. "Scan QR" -> opens real QR scanner modal', () => {
  const r = resolveParticipantAction('Scan QR', contextSingle);
  assert.strictEqual(r.intent, 'SCAN_QR');
  assert.strictEqual(r.action.type, 'OPEN_QR_SCANNER');
  assert.strictEqual(r.action.autoExecute, true);
});

runTest('24. "Open QR scanner" -> opens real QR scanner modal', () => {
  const r = resolveParticipantAction('Open QR scanner', contextSingle);
  assert.strictEqual(r.intent, 'SCAN_QR');
  assert.strictEqual(r.action.type, 'OPEN_QR_SCANNER');
});

runTest('25. "What should I do next?" (Incomplete Profile) -> recommends completing profile', () => {
  const r = resolveParticipantAction('What should I do next?', contextEmpty);
  assert.strictEqual(r.intent, 'RECOMMENDATION_PROFILE');
  assert(r.actionButtons.some(b => b.label.includes('Profile')));
});

runTest('26. "What should I do next?" (Active Course) -> recommends continuing course', () => {
  const r = resolveParticipantAction('What should I do next?', contextSingle);
  assert.strictEqual(r.intent, 'RECOMMENDATION_COURSE');
  assert(r.actionButtons.some(b => b.label.includes('Continue')));
});

runTest('27. "Guide me" -> gives intelligent action recommendation', () => {
  const r = resolveParticipantAction('Guide me', contextSingle);
  assert(r.intent.startsWith('RECOMMENDATION'));
  assert(r.actionButtons.length > 0);
});

runTest('28. "Help me" -> gives intelligent action recommendation', () => {
  const r = resolveParticipantAction('Help me', contextSingle);
  assert(r.intent.startsWith('RECOMMENDATION'));
  assert(r.actionButtons.length > 0);
});

// ── 3. Articles & Prefix handling ("open the X") ──
runTest('29. "open the course" -> opens single enrolled course', () => {
  const r = resolveParticipantAction('open the course', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('30. "open the profile" -> opens profile', () => {
  const r = resolveParticipantAction('open the profile', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_PROFILE');
  assert.strictEqual(r.action.route, '/my-profile');
});

runTest('31. "open the interview" -> opens interview', () => {
  const r = resolveParticipantAction('open the interview', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_INTERVIEWS');
  assert.strictEqual(r.action.route, '/interviews');
});

runTest('32. "open the certificate" -> opens certificates', () => {
  const r = resolveParticipantAction('open the certificate', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_CERTIFICATES');
  assert.strictEqual(r.action.tab, 'certificates');
});

runTest('33. "open the dashboard" -> opens dashboard', () => {
  const r = resolveParticipantAction('open the dashboard', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_DASHBOARD');
  assert.strictEqual(r.action.tab, 'overview');
});

// ── 4. Tamil-English ("Tanglish") Conversational Variations ──
runTest('34. "go course" -> opens course', () => {
  const r = resolveParticipantAction('go course', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('35. "course open pannu" -> opens course', () => {
  const r = resolveParticipantAction('course open pannu', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('36. "en course open pannu" -> opens course', () => {
  const r = resolveParticipantAction('en course open pannu', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE');
  assert.strictEqual(r.action.courseId, 101);
});

runTest('37. "certificate kaatu" -> opens certificates', () => {
  const r = resolveParticipantAction('certificate kaatu', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_CERTIFICATES');
  assert.strictEqual(r.action.tab, 'certificates');
});

runTest('38. "profile open pannu" -> opens profile', () => {
  const r = resolveParticipantAction('profile open pannu', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_PROFILE');
  assert.strictEqual(r.action.route, '/my-profile');
});

runTest('39. "QR scan pannu" -> opens QR scanner modal', () => {
  const r = resolveParticipantAction('QR scan pannu', contextSingle);
  assert.strictEqual(r.intent, 'SCAN_QR');
  assert.strictEqual(r.action.type, 'OPEN_QR_SCANNER');
});

runTest('40. "assessment start pannu" -> starts available assessment', () => {
  const r = resolveParticipantAction('assessment start pannu', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
});

runTest('41. "quiz start pannu" -> starts available quiz', () => {
  const r = resolveParticipantAction('quiz start pannu', contextSingle);
  assert.strictEqual(r.intent, 'START_ASSESSMENT');
  assert.strictEqual(r.action.quizId, 201);
});

runTest('42. "Open Python" (unenrolled) -> explains not enrolled without hallucinating', () => {
  const r = resolveParticipantAction('Open Python', contextSingle);
  assert.strictEqual(r.intent, 'OPEN_COURSE_NOT_ENROLLED');
  assert.strictEqual(r.action, null);
  assert(r.reply.includes('not currently enrolled'));
});

console.log(`\n========================================`);
console.log(`Results: ${passedCount}/${totalCount} tests passed!`);
console.log(`========================================\n`);

if (passedCount === totalCount) {
  process.exit(0);
} else {
  process.exit(1);
}
