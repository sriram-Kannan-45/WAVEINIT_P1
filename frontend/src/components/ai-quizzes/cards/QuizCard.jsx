/**
 * QuizCard — premium SaaS card.
 *
 * Available quizzes  → progress bar + "Start quiz" CTA
 * Completed quizzes:
 *   - Results published  → green score banner + "Completed · Results Available"
 *   - Results pending    → amber "Awaiting results" banner
 */
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DIFFICULTY = {
  HARD:   { label: 'Hard',   bg: '#fef2f2', border: '#fecdd3', text: '#be123c' },
  MEDIUM: { label: 'Medium', bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  EASY:   { label: 'Easy',   bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  MIXED:  { label: 'Mixed',  bg: '#f0fdfa', border: '#99f6e4', text: '#0F766E' },
};

function getDiff(level) {
  const k = (level || 'MEDIUM').toUpperCase();
  return DIFFICULTY[k] || DIFFICULTY.MEDIUM;
}

const cardVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function QuizCard({ quiz, index, onStart, isStarting }) {
  const navigate = useNavigate();
  const diff = getDiff(quiz.difficulty);
  const questionCount = quiz.questionCount ?? quiz.questions?.length ?? 0;
  const timeLimit = quiz.timeLimit || 30;
  const completion = Math.min(100, Math.max(0, Math.round(quiz.completionPercent ?? 0)));
  const isCompleted = quiz.isCompleted === true || completion >= 100 || (quiz.myStatus && quiz.myStatus !== 'NOT_STARTED');
  const hasResult = !!quiz.myResult;   // trainer published results → score available
  const isAI = quiz.isAI === true || !!quiz.documentId || !!quiz.document_id
    || quiz.createdBy !== null || quiz.created_by !== null;

  return (
    <motion.article
      variants={cardVariants}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="qz-card group relative flex h-full flex-col"
    >
      {/* ── Top row: pills ── */}
      <div className="qz-card__pills">
        {isAI && (
          <span className="qz-pill qz-pill--ai" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            🤖 AI Quiz
          </span>
        )}
        <span className="qz-pill" style={{ background: diff.bg, borderColor: diff.border, color: diff.text }}>
          {diff.label}
        </span>
      </div>

      {/* ── Title ── */}
      <h3 className="qz-card__title clamp-2" title={quiz.title}>
        {quiz.title}
      </h3>

      {/* ── Inline meta ── */}
      <div className="qz-card__meta">
        <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>
        <span className="qz-card__dot" aria-hidden>·</span>
        <span>{timeLimit} min</span>
      </div>

      {/* ── Extra metadata ── */}
      <div className="qz-card__extra-meta" style={{
        fontSize: '11px', color: '#64748b', marginTop: '6px',
        marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '3px'
      }}>
        {(quiz.training?.title || quiz.course?.title || quiz.training_title) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🏫</span>
            <span style={{ fontWeight: 550, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {quiz.training?.title || quiz.course?.title || quiz.training_title}
            </span>
          </div>
        )}
        {(quiz.created_at || quiz.createdAt) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📅</span>
            <span>Created: {new Date(quiz.created_at || quiz.createdAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* ── Score banner: results published ── */}
      {hasResult && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
            border: '1px solid #86efac', borderRadius: '10px',
            padding: '12px 14px', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}
        >
          <Trophy size={18} color="#16a34a" />
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d', lineHeight: 1 }}>
              {Math.round(quiz.myResult.percentage)}%
            </div>
            <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
              {quiz.myResult.totalScore} / {quiz.myResult.maxScore} pts
            </div>
          </div>
          <div style={{
            marginLeft: 'auto', fontSize: '11px', color: '#166534', fontWeight: '600',
            background: '#bbf7d0', padding: '3px 8px', borderRadius: '20px'
          }}>
            Results Available ✓
          </div>
        </motion.div>
      )}

      {/* ── Awaiting results banner ── */}
      {isCompleted && !hasResult && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: '#92400e', fontWeight: '500'
        }}>
          <span>⏳</span>
          <span>Result Pending - Waiting for Trainer to Publish Results</span>
        </div>
      )}

      {/* ── Progress bar (only for non-completed quizzes) ── */}
      {!isCompleted && (
        <div className="qz-card__progress">
          <div className="qz-card__progress-row">
            <span className="qz-card__progress-label">Your progress</span>
            <span
              className="qz-card__progress-value mono"
              data-active={completion > 0 ? 'true' : 'false'}
              data-done="false"
            >
              {completion}%
            </span>
          </div>
          <div className="qz-card__progress-track">
            <motion.div
              className="qz-card__progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${completion}%` }}
              transition={{ duration: 0.9, delay: index * 0.04 + 0.15, ease: [0.16, 1, 0.3, 1] }}
              data-done="false"
            />
          </div>
        </div>
      )}

      {/* ── CTA button ── */}
      <button
        type="button"
        onClick={() => {
          if (isCompleted) {
            if (hasResult) {
              navigate(`/trainings/${quiz.trainingId || 0}/quizzes/${quiz.id}/result`);
            }
          } else if (!isStarting) {
            onStart(quiz);
          }
        }}
        disabled={isStarting || (isCompleted && !hasResult)}
        className="qz-card__cta"
        data-done={isCompleted ? 'true' : 'false'}
        data-loading={isStarting ? 'true' : 'false'}
        style={(isCompleted && !hasResult) ? { opacity: 0.75, cursor: 'not-allowed' } : { cursor: 'pointer' }}
      >
        <span className="qz-card__cta-label">
          {isStarting ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Starting…
            </>
          ) : isCompleted ? (
            hasResult ? (
              <>
                <Check size={15} strokeWidth={2.5} aria-hidden />
                View Result
              </>
            ) : (
              <>
                Attempted
              </>
            )
          ) : (
            <>
              Start quiz
              <ArrowRight size={15} strokeWidth={2.25} className="qz-card__cta-arrow" aria-hidden />
            </>
          )}
        </span>
      </button>
    </motion.article>
  );
}
