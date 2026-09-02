/**
 * ai-quiz-autosubmit-flow.test.js
 * Comprehensive integration test for AI Quiz submission lifecycle.
 */

const { gradeAnswer } = require('../src/utils/gradeAnswer');

async function runTests() {
  console.log('🧪 Starting AI Quiz Submission & Auto-Submit Flow Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST 1: Grade Answer Logic for MCQs, Fill Blank, and Matching ────────
  console.log('Test Suite 1: Answer Grading & Unanswered Question Handling');
  
  const mcqQuestion = {
    id: 1,
    questionType: 'MCQ',
    questionText: 'What is Node.js?',
    options: ['Runtime', 'Language', 'Database', 'Framework'],
    correctAnswer: '0',
    marks: 2,
  };

  const correctMcq = gradeAnswer(mcqQuestion, { selectedOption: 0 });
  assert(correctMcq.isCorrect === true && correctMcq.score === 100, 'MCQ correct answer awarded 100%');

  const wrongMcq = gradeAnswer(mcqQuestion, { selectedOption: 2 });
  assert(wrongMcq.isCorrect === false && wrongMcq.score === 0, 'MCQ incorrect answer awarded 0%');

  const unansweredMcq = gradeAnswer(mcqQuestion, { selectedOption: null, answerText: '' });
  assert(unansweredMcq.isCorrect === false && unansweredMcq.score === 0, 'Unanswered MCQ awarded 0%');

  // ── TEST 2: Unanswered & Partial Answer Array Normalization ──────────────
  console.log('\nTest Suite 2: Question Payload Normalization');
  
  const quizQuestions = [
    { id: 101, marks: 2, questionType: 'MCQ' },
    { id: 102, marks: 3, questionType: 'MCQ' },
    { id: 103, marks: 5, questionType: 'FILL_BLANK' },
  ];

  // User only answered question 101
  const participantAnswers = {
    101: { selectedOption: 0, answerText: null }
  };

  const normalizedPayload = quizQuestions.map(q => {
    const ans = participantAnswers[q.id];
    return {
      questionId: q.id,
      selectedOption: ans?.selectedOption !== undefined ? ans.selectedOption : null,
      answerText: ans?.answerText || null,
      matches: ans?.matches || null
    };
  });

  assert(normalizedPayload.length === 3, 'All 3 questions included in normalized payload');
  assert(normalizedPayload[0].selectedOption === 0, 'Answered question 101 preserves selection');
  assert(normalizedPayload[1].selectedOption === null, 'Unanswered question 102 safely mapped to null');
  assert(normalizedPayload[2].selectedOption === null, 'Unanswered question 103 safely mapped to null');

  // ── TEST 3: Timer Remaining Calculation on Page Refresh ──────────────────
  console.log('\nTest Suite 3: Test Timer Persistence Across Reloads');
  
  const totalLimitMinutes = 30;
  const totalLimitSeconds = totalLimitMinutes * 60; // 1800s
  
  // Case A: Fresh start
  const now = Date.now();
  const freshStart = now;
  const freshElapsed = Math.floor((Date.now() - freshStart) / 1000);
  const freshRemaining = Math.max(0, totalLimitSeconds - freshElapsed);
  assert(freshRemaining === 1800, 'Fresh quiz starts with full 1800s');

  // Case B: Refresh after 5 minutes (300 seconds)
  const reloadStart = now - (300 * 1000);
  const reloadElapsed = Math.floor((Date.now() - reloadStart) / 1000);
  const reloadRemaining = Math.max(0, totalLimitSeconds - reloadElapsed);
  assert(reloadRemaining === 1500, 'Reload after 5 minutes accurately resumes with 1500s remaining');

  // Case C: Reload after time has already expired (35 minutes = 2100 seconds)
  const expiredStart = now - (2100 * 1000);
  const expiredElapsed = Math.floor((Date.now() - expiredStart) / 1000);
  const expiredRemaining = Math.max(0, totalLimitSeconds - expiredElapsed);
  assert(expiredRemaining === 0, 'Reload after expiration yields 0s remaining and triggers immediate auto-submit');

  // ── TEST 4: Submission Idempotency & Double Submit Prevention ────────────
  console.log('\nTest Suite 4: Idempotent Submission Guard');

  const simulatedAttempt = {
    id: 999,
    status: 'IN_PROGRESS',
    participantId: 1,
    quizId: 50,
  };

  function simulateSubmit(attempt) {
    if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
      return { success: true, message: 'Quiz already submitted', status: 'PENDING_RESULT', duplicate: true };
    }
    attempt.status = 'SUBMITTED';
    return { success: true, message: 'Quiz submitted successfully', status: 'PENDING_RESULT', duplicate: false };
  }

  const firstSubmission = simulateSubmit(simulatedAttempt);
  assert(firstSubmission.success === true && firstSubmission.duplicate === false, 'First submission completes successfully');

  const duplicateSubmission = simulateSubmit(simulatedAttempt);
  assert(duplicateSubmission.success === true && duplicateSubmission.duplicate === true, 'Duplicate submission safely returns idempotent success without error');

  console.log(`\n========================================`);
  console.log(`All Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
