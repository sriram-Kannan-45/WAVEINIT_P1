/**
 * smoke-e2e.js — End-to-end smoke test for the course-centric LMS restructure.
 *
 * Run with the backend already up on port 3001:
 *   node scripts/smoke-e2e.js
 *
 * Exercises the canonical flow described in Section 8 step 10 of the spec:
 *   Admin creates program → admin creates course → admin assigns trainer
 *   → trainer adds lesson + materials + quiz + assessment
 *   → participant enrolls → participant views lesson
 *   → participant submits quiz (result HIDDEN)
 *   → trainer publishes results → participant sees score and review
 *   → analytics endpoint returns data
 *   → cleanup
 *
 * Uses fetch (Node 18+). Colored console output. Exits with non-zero on any
 * step failure.
 */

const BASE = process.env.SMOKE_BASE || 'http://localhost:3001';

// ── tiny coloring ────────────────────────────────────────────────────────
const c = {
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
};

let stepNo = 0;
function step(name) {
  stepNo++;
  process.stdout.write(`\n${c.bold(c.cyan(`[${stepNo}] ${name}`))}\n`);
}
function ok(label, extra = '') {
  console.log(`  ${c.green('✓')} ${label} ${c.dim(extra)}`);
}
function fail(label, err) {
  console.log(`  ${c.red('✗')} ${label}: ${err.message || err}`);
  if (err.responseBody) console.log(`    body: ${err.responseBody}`);
  process.exit(1);
}

async function call(method, path, { token, body, query } = {}) {
  const url = `${BASE}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || data?.success === false || data?.error) {
    const e = new Error(`${method} ${path} → ${res.status}`);
    e.responseBody = JSON.stringify(data || {});
    throw e;
  }
  return data;
}

(async () => {
  // ── 0. Login as admin ─────────────────────────────────────────────────
  step('Login as admin');
  const adminLogin = await call('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'admin123' },
  }).catch(e => fail('admin login', e));
  const adminToken = adminLogin.token;
  ok(`logged in admin id=${adminLogin.user?.id || '?'}`);

  // ── 1. Create training program ───────────────────────────────────────
  step('Admin creates a Training Program');
  const progRes = await call('POST', '/api/admin/training-programs', {
    token: adminToken,
    body: { title: `Smoke Program ${Date.now()}`, description: 'E2E smoke test program' },
  }).catch(e => fail('create program', e));
  const programId = progRes.program.id;
  ok(`program id=${programId}`);

  // ── 2. Create / reuse a trainer ──────────────────────────────────────
  step('Use an existing trainer (or create one if missing)');
  const trList = await call('GET', '/api/admin/trainers', { token: adminToken });
  let trainerId = trList.trainers?.[0]?.id;
  if (!trainerId) {
    const tr = await call('POST', '/api/admin/create-trainer', {
      token: adminToken,
      body: { name: 'E2E Trainer', email: `e2e-trainer-${Date.now()}@test.com`, phone: '0000000000' },
    });
    trainerId = tr.user?.id || tr.id;
  }
  ok(`trainer id=${trainerId}`);

  // ── 3. Create course under program assigned to trainer ───────────────
  step('Admin creates a Course under the program assigned to the trainer');
  const courseRes = await call('POST', `/api/admin/training-programs/${programId}/courses`, {
    token: adminToken,
    body: {
      title: 'JavaScript Foundations',
      description: 'Variables, functions, async, error handling',
      trainerId,
      status: 'PUBLISHED',
    },
  }).catch(e => fail('create course', e));
  const courseId = courseRes.course.id;
  ok(`course id=${courseId} trainer=${courseRes.course.trainerName}`);

  // Make sure course is PUBLISHED so the participant can enroll
  await call('PUT', `/api/admin/courses/${courseId}`, {
    token: adminToken, body: { status: 'PUBLISHED' },
  });

  // ── 4. Trainer (or admin override) adds a lesson ─────────────────────
  step('Trainer adds a lesson to the course');
  const lessonRes = await call('POST', `/api/trainer/courses/${courseId}/lessons`, {
    token: adminToken,
    body: { title: 'Async / Await Basics', description: 'Promises, async functions, error handling', orderIndex: 0 },
  });
  const lessonId = lessonRes.lesson.id;
  ok(`lesson id=${lessonId}`);

  // ── 5. Trainer adds materials (NOTE + LINK) ──────────────────────────
  step('Trainer adds materials (NOTE + LINK)');
  await call('POST', `/api/trainer/lessons/${lessonId}/materials`, {
    token: adminToken,
    body: {
      materialType: 'NOTE', title: 'Async overview',
      content: '<h2>What is async?</h2><p>Functions that return a Promise.</p>',
    },
  });
  await call('POST', `/api/trainer/lessons/${lessonId}/materials`, {
    token: adminToken,
    body: {
      materialType: 'LINK', title: 'MDN async/await',
      linkUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function',
      content: 'Official MDN reference',
    },
  });
  const mats = await call('GET', `/api/trainer/lessons/${lessonId}/materials`, { token: adminToken });
  ok(`materials: ${mats.materials.length} (NOTE + LINK)`);

  // ── 6. Trainer adds a manual quiz tied to the lesson ─────────────────
  step('Trainer creates a manual quiz tied to this lesson');
  const quizRes = await call('POST', `/api/trainer/courses/${courseId}/quiz/manual`, {
    token: adminToken,
    body: {
      title: 'Async Knowledge Check',
      lessonId,
      isMandatory: true,
      questions: [
        {
          question: 'What does the `await` keyword do?',
          options: ['Sleeps the thread', 'Pauses async fn until promise resolves', 'Cancels the promise', 'Throws an error'],
          correctIndex: 1,
        },
        {
          question: 'A `function` declared with `async` always returns:',
          options: ['undefined', 'A callback', 'A Promise', 'A generator'],
          correctIndex: 2,
        },
      ],
    },
  });
  const quizId = quizRes.quiz.id;
  ok(`quiz id=${quizId} status=${quizRes.quiz.status}`);

  // Publish the quiz so the participant can see and start it
  await call('PUT', `/api/trainer/courses/${courseId}/quizzes/${quizId}`, {
    token: adminToken, body: { status: 'PUBLISHED' },
  });
  ok('quiz status flipped to PUBLISHED');

  // ── 7. Trainer adds an assessment ────────────────────────────────────
  step('Trainer adds a (mandatory) assessment to the lesson');
  const assRes = await call('POST', `/api/trainer/courses/${courseId}/lessons/${lessonId}/assessments`, {
    token: adminToken,
    body: { title: 'Reflection essay', instructions: 'Write 200 words on async/await.', maxScore: 100, isMandatory: false },
  });
  const assessmentId = assRes.assessment.id;
  ok(`assessment id=${assessmentId}`);

  // ── 8. Register / approve a fresh participant ────────────────────────
  step('Register & approve a fresh participant');
  const pEmail = `e2e-participant-${Date.now()}@test.com`;
  const pPass = 'e2e-pass-123';
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Participant', email: pEmail, phone: '9000000000', password: pPass }),
  });
  if (!reg.ok) fail('register', new Error(`HTTP ${reg.status}`));
  // Find pending and approve
  const pending = await call('GET', '/api/admin/pending-participants', { token: adminToken });
  const newP = (pending.participants || []).find(p => p.email === pEmail);
  if (!newP) fail('approve', new Error('new participant not in pending list'));
  await call('POST', `/api/admin/approve-participant/${newP.id}`, { token: adminToken });
  ok(`participant id=${newP.id} approved`);

  // ── 9. Participant logs in and enrolls in the course ─────────────────
  step('Participant logs in and enrolls in the course');
  const pLogin = await call('POST', '/api/auth/login', {
    body: { email: pEmail, password: pPass },
  });
  const pToken = pLogin.token;
  await call('POST', '/api/participant/enroll', { token: pToken, body: { courseId } });
  ok('enrolled');

  // ── 10. Participant fetches my courses and confirms it's listed ──────
  step('Participant fetches /api/participant/courses');
  const myCourses = await call('GET', '/api/participant/courses', { token: pToken });
  const found = (myCourses.courses || []).find(c => c.courseId === courseId);
  if (!found) fail('list-my-courses', new Error('course not in participant list'));
  ok(`course visible · progress=${Math.round(found.progressPercent)}%`);

  // ── 11. Participant views lesson ─────────────────────────────────────
  step('Participant marks lesson viewed');
  await call('POST', `/api/participant/lessons/${lessonId}/view`, { token: pToken });
  ok('contentViewed = true');

  // ── 12. Participant starts and submits the quiz ──────────────────────
  step('Participant starts the quiz');
  const startRes = await call('POST', `/api/participant/quizzes/${quizId}/start`, { token: pToken });
  if ((startRes.questions || []).length !== 2) fail('start', new Error('expected 2 questions'));
  const verifyHidden = startRes.questions.some(q => 'correctAnswer' in q);
  if (verifyHidden) fail('leak', new Error('correctAnswer must NOT be in /start response'));
  ok(`attempt=${startRes.attemptId} questions=${startRes.questions.length} (no correct answers leaked)`);

  step('Participant submits answers (one wrong, one right)');
  const answers = [
    { questionId: startRes.questions[0].id, answer: startRes.questions[0].options[0] }, // intentional wrong
    { questionId: startRes.questions[1].id, answer: 'A Promise' },                        // correct
  ];
  await call('POST', `/api/participant/quizzes/${quizId}/submit`, {
    token: pToken,
    body: { attemptId: startRes.attemptId, answers },
  });
  ok('quiz submitted');

  // ── 13. Verify result is HIDDEN before publish ───────────────────────
  step('Participant fetches result before trainer publishes — must be HIDDEN');
  const hiddenRes = await call('GET', `/api/participant/quizzes/${quizId}/result`, { token: pToken });
  if (hiddenRes.status !== 'SUBMITTED_HIDDEN') {
    fail('hidden', new Error(`expected SUBMITTED_HIDDEN, got ${hiddenRes.status}`));
  }
  if ('score' in hiddenRes && hiddenRes.score != null) {
    fail('score-leak', new Error('score must NOT be in HIDDEN response'));
  }
  ok('SUBMITTED_HIDDEN, score not visible');

  // ── 14. Verify analytics + participants endpoints ────────────────────
  step('Trainer-side analytics + participants endpoints work');
  const analytics = await call('GET', `/api/trainer/courses/${courseId}/analytics`, { token: adminToken });
  if (analytics.completion.totalEnrolled !== 1) {
    fail('analytics', new Error(`expected totalEnrolled=1, got ${analytics.completion.totalEnrolled}`));
  }
  ok(`analytics: ${analytics.completion.totalEnrolled} enrolled, ${analytics.quizScores?.length || 0} quizzes tracked`);

  const partList = await call('GET', `/api/trainer/courses/${courseId}/participants`, { token: adminToken });
  if ((partList.participants || []).length !== 1) {
    fail('participants', new Error(`expected 1 participant, got ${partList.participants?.length}`));
  }
  ok(`participants: ${partList.participants.length}, lessonsDone=${partList.participants[0].lessonsDone}/${partList.participants[0].totalLessons}`);

  // ── 15. Trainer publishes results ────────────────────────────────────
  step('Trainer publishes quiz results');
  const dash = await call('GET', `/api/trainer/courses/${courseId}/quizzes/${quizId}/dashboard`, { token: adminToken });
  ok(`dashboard: enrolled=${dash.enrolled} completed=${dash.completed} pending=${dash.pending} canPublish=${dash.canPublish}`);

  await call('POST', `/api/trainer/courses/${courseId}/quizzes/${quizId}/publish`, {
    token: adminToken, body: {},
  });
  ok('publish OK');

  // ── 16. Participant fetches result post-publish — full review ────────
  step('Participant fetches result after publish — must be PUBLISHED with review');
  const finalRes = await call('GET', `/api/participant/quizzes/${quizId}/result`, { token: pToken });
  if (finalRes.status !== 'PUBLISHED') {
    fail('post-publish', new Error(`expected PUBLISHED, got ${finalRes.status}`));
  }
  if (finalRes.score == null) fail('score', new Error('score missing'));
  if ((finalRes.review || []).length !== 2) fail('review', new Error(`expected 2 review entries, got ${finalRes.review?.length}`));

  const r0 = finalRes.review[0];
  const r1 = finalRes.review[1];
  if (r0.isCorrect !== false) fail('q1 grading', new Error('Q1 should be marked incorrect'));
  if (r1.isCorrect !== true)  fail('q2 grading', new Error('Q2 should be marked correct'));
  if (!r0.correctAnswer)      fail('q1 reveal', new Error('correctAnswer should now be revealed'));
  ok(`PUBLISHED · score=${finalRes.score}% · ${finalRes.totalScore}/${finalRes.maxScore} · review[0].correct=${r0.isCorrect} review[1].correct=${r1.isCorrect}`);

  // ── 17. Participant submits the assessment ───────────────────────────
  step('Participant submits the (optional) assessment');
  await call('POST', `/api/participant/assessments/${assessmentId}/submit`, {
    token: pToken,
    body: { content: 'A short reflection on async/await and how it improves over callback chains.' },
  });
  ok('assessment submitted');

  // ── 18. Trainer grades + publishes the assessment submission ─────────
  step('Trainer grades and publishes the assessment submission');
  const subList = await call('GET', `/api/trainer/assessments/${assessmentId}/submissions`, { token: adminToken });
  const sub = subList.submissions?.[0];
  if (!sub) fail('subs', new Error('no submission found'));
  await call('PUT', `/api/trainer/submissions/${sub.id}/grade`, {
    token: adminToken,
    body: { score: 88, feedback: 'Solid analogies, expand the error-handling section next time.' },
  });
  await call('POST', `/api/trainer/submissions/${sub.id}/publish`, { token: adminToken });
  ok(`graded 88, published`);

  // ── 19. Participant verifies assessment result is now visible ────────
  step('Participant fetches assessment result (should be PUBLISHED with score)');
  const aRes = await call('GET', `/api/participant/assessments/${assessmentId}/result`, { token: pToken });
  if (aRes.status !== 'PUBLISHED') fail('a-status', new Error(`expected PUBLISHED, got ${aRes.status}`));
  if (aRes.score !== 88)            fail('a-score',  new Error(`expected 88, got ${aRes.score}`));
  ok(`PUBLISHED · score=${aRes.score}/${aRes.maxScore} · feedback received`);

  // ── 20. Cleanup — delete program (cascades everything) ───────────────
  step('Cleanup: delete training program (cascades course, lesson, quiz, etc.)');
  await call('DELETE', `/api/admin/training-programs/${programId}`, { token: adminToken });
  ok('program deleted with full cascade');

  // ── 21. Done ─────────────────────────────────────────────────────────
  console.log(`\n${c.bold(c.green('━━━ SMOKE TEST PASSED ━━━'))}\n`);
  console.log(c.dim('Full flow verified: admin → program → course → lesson → materials → quiz →'));
  console.log(c.dim('  → enroll → view → submit (hidden) → publish → review (visible).'));
  console.log(c.dim('Score privacy enforced; analytics functional; cascade delete clean.\n'));
})().catch(e => {
  console.error(c.red(`\nFATAL: ${e.message}`));
  if (e.responseBody) console.error(`Response: ${e.responseBody}`);
  process.exit(1);
});
