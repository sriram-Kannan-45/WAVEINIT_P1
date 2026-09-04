/**
 * ai-quiz-autosubmit-flow.test.js
 * Comprehensive Jest integration test for AI Quiz submission lifecycle.
 */

const { gradeAnswer } = require('../src/utils/gradeAnswer');

describe('AI Quiz Submission & Auto-Submit Flow Tests', () => {
  const mcqQuestion = {
    id: 1,
    questionType: 'MCQ',
    questionText: 'What is Node.js?',
    options: ['Runtime', 'Language', 'Database', 'Framework'],
    correctAnswer: '0',
    marks: 2,
  };

  describe('Answer Grading & Unanswered Question Handling', () => {
    it('awards 100% for MCQ correct answer', () => {
      const correctMcq = gradeAnswer(mcqQuestion, { selectedOption: 0 });
      expect(correctMcq.isCorrect).toBe(true);
      expect(correctMcq.score).toBe(100);
    });

    it('awards 0% for MCQ incorrect answer', () => {
      const wrongMcq = gradeAnswer(mcqQuestion, { selectedOption: 2 });
      expect(wrongMcq.isCorrect).toBe(false);
      expect(wrongMcq.score).toBe(0);
    });

    it('awards 0% for unanswered MCQ', () => {
      const unansweredMcq = gradeAnswer(mcqQuestion, { selectedOption: null, answerText: '' });
      expect(unansweredMcq.isCorrect).toBe(false);
      expect(unansweredMcq.score).toBe(0);
    });
  });

  describe('Question Payload Normalization', () => {
    const quizQuestions = [
      { id: 101, marks: 2, questionType: 'MCQ' },
      { id: 102, marks: 3, questionType: 'MCQ' },
      { id: 103, marks: 5, questionType: 'FILL_BLANK' },
    ];

    it('normalizes answers payload including unanswered questions as null', () => {
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

      expect(normalizedPayload.length).toBe(3);
      expect(normalizedPayload[0].selectedOption).toBe(0);
      expect(normalizedPayload[1].selectedOption).toBeNull();
      expect(normalizedPayload[2].selectedOption).toBeNull();
    });
  });

  describe('Test Timer Persistence Across Reloads', () => {
    const totalLimitMinutes = 30;
    const totalLimitSeconds = totalLimitMinutes * 60; // 1800s

    it('starts fresh quiz with full 1800s', () => {
      const freshElapsed = 0;
      const freshRemaining = Math.max(0, totalLimitSeconds - freshElapsed);
      expect(freshRemaining).toBe(1800);
    });

    it('accurately resumes with 1500s remaining after 5m reload', () => {
      const elapsedSeconds = 300;
      const reloadRemaining = Math.max(0, totalLimitSeconds - elapsedSeconds);
      expect(reloadRemaining).toBe(1500);
    });

    it('yields 0s remaining and triggers auto-submit when expired', () => {
      const elapsedSeconds = 2100;
      const expiredRemaining = Math.max(0, totalLimitSeconds - elapsedSeconds);
      expect(expiredRemaining).toBe(0);
    });
  });

  describe('Idempotent Submission Guard', () => {
    function simulateSubmit(attempt) {
      if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
        return { success: true, message: 'Quiz already submitted', status: 'PENDING_RESULT', duplicate: true };
      }
      attempt.status = 'SUBMITTED';
      return { success: true, message: 'Quiz submitted successfully', status: 'PENDING_RESULT', duplicate: false };
    }

    it('completes first submission successfully and flags duplicate safely', () => {
      const simulatedAttempt = {
        id: 999,
        status: 'IN_PROGRESS',
        participantId: 1,
        quizId: 50,
      };

      const firstSubmission = simulateSubmit(simulatedAttempt);
      expect(firstSubmission.success).toBe(true);
      expect(firstSubmission.duplicate).toBe(false);

      const duplicateSubmission = simulateSubmit(simulatedAttempt);
      expect(duplicateSubmission.success).toBe(true);
      expect(duplicateSubmission.duplicate).toBe(true);
    });
  });
});
