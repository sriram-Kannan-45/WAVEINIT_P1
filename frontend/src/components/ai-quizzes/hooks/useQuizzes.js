/**
 * useQuizzes
 * ─────────────────────────────────────────────────────────────────────────
 * Loads the participant's quiz list and starts (or resumes) a quiz attempt.
 *
 * On startQuiz():
 *   1. Computes a stable device fingerprint via getDeviceFingerprint().
 *   2. POSTs to /api/ai-quiz/participant/start/:quizId with { deviceFingerprint }.
 *   3. On 200/201 → stores sessionToken in sessionStorage (NOT localStorage)
 *      and resolves with { attemptId, quiz, sessionToken }.
 *   4. On 423 → throws a typed error  { type: 'SESSION_LOCKED', ... }
 *      so AssessmentConsentGate can render <SessionLockedModal /> instead.
 *   5. On any other failure → swallows + sets `error` (caller can retry).
 */
import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../../../api/api';
import { getAuthHeaders } from '../../../api/request';
import { getStoredCompletion } from '../constants';
import { getDeviceFingerprint } from '../../../utils/deviceFingerprint';

const SESSION_TOKEN_KEY = 'quiz_session_token';

function enrichQuiz(quiz) {
  const questionCount = quiz.questions?.length ?? quiz.questionCount ?? quiz.numQuestions ?? 0;
  return {
    ...quiz,
    questionCount,
    completionPercent: quiz.completionPercent ?? quiz.bestScore ?? getStoredCompletion(quiz.id),
  };
}

export function useQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState(null);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/ai-quiz/participant/quizzes`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load quizzes');
      setQuizzes((data.quizzes || []).map(enrichQuiz));
      setCompletedQuizzes((data.completedQuizzes || []).map(enrichQuiz));
    } catch (err) {
      setError(err.message || 'Failed to load quizzes. Please check your connection.');
      setQuizzes([]);
      setCompletedQuizzes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const startQuiz = useCallback(
    async (quiz) => {
      if (startingId) return null;
      setStartingId(quiz.id);
      setError('');

      // Compute device fingerprint up-front so it's posted with /start.
      // Failures here aren't fatal — the backend will still create a
      // session; it just won't have a fingerprint to check against.
      let deviceFingerprint = '';
      try {
        deviceFingerprint = await getDeviceFingerprint();
      } catch {
        deviceFingerprint = '';
      }

      try {
        const res = await fetch(`${API_BASE}/ai-quiz/participant/start/${quiz.id}`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceFingerprint }),
        });
        const data = await res.json();

        // Hard-coded: HTTP 423 = session locked on another device.
        if (res.status === 423) {
          const lockedErr = new Error(
            data.message || 'This assessment is already active on another device.'
          );
          lockedErr.type = 'SESSION_LOCKED';
          lockedErr.lockedAt = data.lockedAt || null;
          lockedErr.sessionId = data.sessionId || null;
          throw lockedErr;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to start quiz');
        }
        if (!data.quiz?.questions?.length) {
          throw new Error('This quiz has no questions yet. Please contact your trainer.');
        }

        // Persist sessionToken in sessionStorage so it survives a refresh
        // (within the tab) but doesn't leak across browser sessions.
        if (data.sessionToken) {
          try {
            sessionStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
          } catch {
            /* private mode / quota — non-fatal */
          }
        }

        return {
          attemptId: data.attemptId,
          quiz: {
            ...data.quiz,
            initialViolationCount: data.violationCount || 0,
            initialStatus: data.quiz?.status === 'disqualified_copy_violation' ? 'disqualified_copy_violation' : 'IN_PROGRESS'
          },
          sessionToken: data.sessionToken || null,
        };
      } catch (err) {
        // Bubble session-locked errors up so the gate can render SessionLockedModal
        if (err.type === 'SESSION_LOCKED') {
          setStartingId(null);
          throw err;
        }
        setError(err.message || 'Could not start quiz');
        return null;
      } finally {
        setStartingId(null);
      }
    },
    [startingId]
  );

  return {
    quizzes,
    completedQuizzes,
    loading,
    error,
    startingId,
    fetchQuizzes,
    startQuiz,
    setError,
  };
}

export { SESSION_TOKEN_KEY };
