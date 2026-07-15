/**
 * AIQuizzesDashboard
 * ─────────────────────────────────────────────────────────────────────────
 * Page shell that orchestrates header + filter bar + responsive 3-column
 * grid with Framer-Motion staggered card mount. Also hosts the secure
 * assessment flow inline:
 *
 *   QuizCard click  →  startQuiz()
 *     ├─ 200 OK   →  <AssessmentConsentGate />   (consent + fullscreen)
 *     │              └─ on consent  →  <QuizTaking />  (live exam)
 *     ├─ 423      →  <SessionLockedModal />       (admin reset required)
 *     └─ other    →  inline error banner; retry available
 *
 * Backwards-compatible: the legacy `onStartQuiz` prop still fires (so the
 * outer dashboard's "continue learning" tracker still receives the event),
 * but no navigation happens — the whole flow stays inside this component.
 */
import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import '../../styles/design-tokens.css';

import { useQuizzes } from './hooks/useQuizzes';
import { useSocketEvent } from '../../hooks/useSocket';
import PageHeader from './sections/PageHeader';
import FilterChips from './sections/FilterChips';
import ErrorBanner from './sections/ErrorBanner';
import EmptyState from './sections/EmptyState';
import QuizCard from './cards/QuizCard';
import QuizCardSkeleton from './cards/QuizCardSkeleton';
import QuizzesTopNav from './layout/QuizzesTopNav';

import AssessmentConsentGate from './AssessmentConsentGate';
import SessionLockedModal from './SessionLockedModal';
import QuizTaking from '../QuizTaking';

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

export default function AIQuizzesDashboard({ user, onStartQuiz, onLogout, embedded = true }) {
  const navigate = useNavigate();
  const { quizzes, completedQuizzes, loading, error, startingId, fetchQuizzes, startQuiz } = useQuizzes();

  useSocketEvent('quiz:published', () => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  useSocketEvent('quiz:results:published', () => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const [activeTab, setActiveTab] = useState('AVAILABLE'); // 'AVAILABLE' | 'COMPLETED'
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // ── Secure assessment flow state ─────────────────────────────────────
  // 'list'     → grid of cards
  // 'consent'  → AssessmentConsentGate modal over the grid
  // 'taking'   → QuizTaking fullscreen exam
  const [flow, setFlow] = useState('list');
  const [pendingQuiz, setPendingQuiz] = useState(null);
  const [pendingAttemptId, setPendingAttemptId] = useState(null);
  const [pendingSessionToken, setPendingSessionToken] = useState(null);
  const [lockedInfo, setLockedInfo] = useState(null); // { lockedAt }

  const activeList = useMemo(() => {
    return activeTab === 'AVAILABLE' ? quizzes : completedQuizzes;
  }, [activeTab, quizzes, completedQuizzes]);

  const counts = useMemo(() => {
    const c = { ALL: activeList.length };
    activeList.forEach((q) => {
      const k = (q.difficulty || 'MEDIUM').toUpperCase();
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [activeList]);

  const filteredQuizzes = useMemo(() => {
    return activeList.filter((q) => {
      const diff = (q.difficulty || 'MEDIUM').toUpperCase();
      const matchesFilter = filter === 'ALL' || diff === filter;
      const matchesSearch =
        !search.trim() || q.title?.toLowerCase().includes(search.trim().toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activeList, filter, search]);

  const totalQuestions = useMemo(
    () => activeList.reduce((s, q) => s + (q.questionCount ?? q.questions?.length ?? 0), 0),
    [activeList],
  );
  const totalMinutes = useMemo(
    () => activeList.reduce((s, q) => s + (q.timeLimit || 30), 0),
    [activeList],
  );

  // Reset all flow state back to the list
  const resetFlow = useCallback(() => {
    setFlow('list');
    setPendingQuiz(null);
    setPendingAttemptId(null);
    setPendingSessionToken(null);
    setLockedInfo(null);
  }, []);

  const handleStart = useCallback(async (quiz) => {
    try {
      const result = await startQuiz(quiz);
      if (!result) return; // setError already raised in the hook
      
      if (result.quiz?.proctoringEnabled) {
        navigate(`/participant/exam/${quiz.id}`, {
          state: {
            attemptId: result.attemptId,
            quizData: result.quiz
          }
        });
        return;
      }

      setPendingQuiz(result.quiz);
      setPendingAttemptId(result.attemptId);
      setPendingSessionToken(result.sessionToken);
      setFlow('consent');
      // Legacy callback kept for outer dashboard tracking
      if (onStartQuiz) onStartQuiz(result.attemptId, result.quiz);
    } catch (err) {
      if (err?.type === 'SESSION_LOCKED') {
        setLockedInfo({ lockedAt: err.lockedAt || null });
        return;
      }
      // Anything else surfaces via the hook's `error` state already.
    }
  }, [startQuiz, onStartQuiz, navigate]);

  // Consent gate accepted → enter QuizTaking
  const handleConsented = useCallback((attemptId, quiz) => {
    setPendingAttemptId(attemptId);
    setPendingQuiz(quiz);
    setFlow('taking');
  }, []);

  const handleQuizTakingSubmit = useCallback(() => {
    // Refresh list so completion / best score updates appear, then drop back
    fetchQuizzes();
    resetFlow();
  }, [fetchQuizzes, resetFlow]);

  // ── Render — three top-level branches share the gradient/canvas wrapper
  return (
    <div className="quizzes-page">
      {/* Live exam takes over the entire viewport */}
      {flow === 'taking' && pendingQuiz && pendingAttemptId && (
        <QuizTaking
          quizId={pendingQuiz.id}
          attemptId={pendingAttemptId}
          quizData={pendingQuiz}
          sessionToken={pendingSessionToken}
          onSubmit={handleQuizTakingSubmit}
        />
      )}

      {/* List + (optional) consent gate over it */}
      {flow !== 'taking' && (
        <div
          className={embedded ? 'mx-auto w-full' : 'mx-auto w-full min-h-screen'}
          style={{
            maxWidth: 1280,
            padding: embedded ? '32px 24px' : '40px 32px',
          }}
        >
          {!embedded && <QuizzesTopNav user={user} onLogout={onLogout} />}

          <PageHeader
            quizCount={activeList.length}
            totalMinutes={totalMinutes}
            totalQuestions={totalQuestions}
            loading={loading}
            onRefresh={fetchQuizzes}
            statusLabel={activeTab === 'AVAILABLE' ? "Available" : "Completed"}
          />

          {!loading && (
            <div className="qz-tabs">
              <button
                type="button"
                className="qz-tab-btn"
                data-active={activeTab === 'AVAILABLE' ? "true" : "false"}
                onClick={() => { setActiveTab('AVAILABLE'); setFilter('ALL'); }}
              >
                Available Quizzes ({quizzes.length})
              </button>
              <button
                type="button"
                className="qz-tab-btn"
                data-active={activeTab === 'COMPLETED' ? "true" : "false"}
                onClick={() => { setActiveTab('COMPLETED'); setFilter('ALL'); }}
              >
                Completed Quizzes ({completedQuizzes.length})
              </button>
            </div>
          )}

          <ErrorBanner message={error} onRetry={fetchQuizzes} />

          {!loading && activeList.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <FilterChips
                filter={filter}
                onFilterChange={setFilter}
                counts={counts}
                search={search}
                onSearchChange={setSearch}
              />
            </div>
          )}

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <QuizCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <EmptyState
              onRefresh={fetchQuizzes}
              filtered={activeList.length > 0 && filteredQuizzes.length === 0}
              title={activeTab === 'COMPLETED' && activeList.length === 0 ? 'No completed quizzes' : undefined}
              description={activeTab === 'COMPLETED' && activeList.length === 0 ? 'You have not completed any quizzes yet.' : undefined}
            />
          ) : (
            <motion.div
              variants={gridVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              style={{ alignItems: 'stretch', marginTop: 24 }}
            >
              {filteredQuizzes.map((quiz, i) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  index={i}
                  onStart={handleStart}
                  isStarting={startingId === quiz.id}
                />
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Consent gate — over the list */}
      {flow === 'consent' && pendingQuiz && pendingAttemptId && (
        <AssessmentConsentGate
          quiz={pendingQuiz}
          attemptId={pendingAttemptId}
          onConsented={handleConsented}
          onCancel={resetFlow}
        />
      )}

      {/* Locked modal — shown if /start returned 423 */}
      <SessionLockedModal
        open={!!lockedInfo}
        lockedAt={lockedInfo?.lockedAt}
        onCancel={resetFlow}
      />
    </div>
  );
}
