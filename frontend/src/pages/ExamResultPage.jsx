/**
 * ExamResultPage — post-submit summary at /exam/:sessionId/result.
 *
 * Fetches GET /api/proctor/sessions/:id/result and renders score,
 * percentage, and a per-question breakdown. Classical, calm look —
 * no flashy animations, just clear feedback.
 */
import { useEffect, useState } from 'react';
import { Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, Award } from 'lucide-react';

import '../proctoring/exam/exam.css';
import { proctorApi } from '../proctoring/api';
import useAuthUser from '../proctoring/hooks/useAuthUser';

export default function ExamResultPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuthUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ready || !user?.id) return;
    let alive = true;
    proctorApi.getResult(sessionId)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e.message || 'Failed to load result'); });
    return () => { alive = false; };
  }, [ready, user?.id, sessionId]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" />
      </div>
    );
  }
  if (!user?.id) return <Navigate to="/login" replace />;

  return (
    <div className="exam-shell min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        {error ? (
          <div
            className="border bg-white p-8 text-center"
            style={{ borderColor: '#fee2e2', borderRadius: 8 }}
          >
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              onClick={() => navigate('/participant', { replace: true })}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white"
              style={{ background: '#0D9488', borderRadius: 6 }}
            >
              Back to dashboard <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" />
          </div>
        ) : (
          <ResultBody data={data} onExit={() => navigate('/participant', { replace: true })} />
        )}
      </div>
    </div>
  );
}

function ResultBody({ data, onExit }) {
  const result = data.result;
  const breakdown = data.breakdown || [];
  const correct = breakdown.filter(b => b.isCorrect).length;
  const percentage = result?.percentage ?? 0;
  const passed = percentage >= 50;

  return (
    <>
      {/* Header card */}
      <section
        className="border bg-white p-6 text-center sm:p-10"
        style={{ borderColor: 'var(--exam-border)', borderRadius: 8 }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: passed ? '#ecfdf5' : '#fef2f2', color: passed ? '#10b981' : '#dc2626' }}
        >
          {passed ? <Award className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
        </div>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--exam-text-muted)' }}
        >
          Exam Submitted
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: 'var(--exam-text)' }}>
          {data.quiz?.title || 'Your result'}
        </h1>

        <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-8">
          <Stat
            label="Score"
            value={`${result?.totalScore?.toFixed(0) ?? 0}/${result?.maxScore ?? 0}`}
          />
          <Stat
            label="Percentage"
            value={`${percentage.toFixed(1)}%`}
            big
            color={passed ? '#10b981' : '#dc2626'}
          />
          <Stat
            label="Correct"
            value={`${correct}/${breakdown.length}`}
          />
        </div>

        <button
          onClick={onExit}
          className="mt-8 inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: 'var(--exam-accent)', borderRadius: 6 }}
        >
          Back to dashboard <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>

      {/* Breakdown */}
      {breakdown.length > 0 && (
        <section className="mt-6">
          <h2
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--exam-text-muted)' }}
          >
            Question-by-question
          </h2>
          <div className="space-y-3">
            {breakdown.map((b, i) => (
              <BreakdownRow key={b.questionId} index={i} row={b} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value, big = false, color }) {
  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--exam-text-muted)' }}
      >
        {label}
      </p>
      <p
        className={big ? 'mt-1 text-3xl font-bold tabular-nums sm:text-4xl' : 'mt-1 text-2xl font-bold tabular-nums'}
        style={{ color: color || 'var(--exam-text)' }}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownRow({ index, row }) {
  const ok = row.isCorrect;
  return (
    <div
      className="border bg-white p-4"
      style={{
        borderColor: ok ? '#bbf7d0' : '#fecaca',
        borderRadius: 8,
        background: ok ? '#f0fdf4' : '#fef2f2',
      }}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: ok ? '#047857' : '#b91c1c' }}
          >
            Question {index + 1} · {ok ? 'Correct' : 'Incorrect'} · {Number(row.score).toFixed(0)}/100
          </p>
          <p className="question-text mt-1 text-sm" style={{ color: 'var(--exam-text)' }}>
            {row.questionText}
          </p>
          {row.questionType === 'MCQ' && Array.isArray(row.options) && (
            <ul className="mt-2 space-y-1 text-xs">
              {row.options.map((opt, oi) => {
                const wasSelected = String(row.selectedOption) === String(oi);
                const isCorrect = String(row.correctAnswer) === String(oi);
                return (
                  <li
                    key={oi}
                    className="flex items-start gap-2"
                    style={{
                      color: isCorrect ? '#047857' : wasSelected ? '#b91c1c' : 'var(--exam-text-muted)',
                      fontWeight: wasSelected || isCorrect ? 600 : 400,
                    }}
                  >
                    <span>{String.fromCharCode(65 + oi)}.</span>
                    <span>{opt}</span>
                    {isCorrect && <span className="ml-auto text-[10px] uppercase">correct</span>}
                    {wasSelected && !isCorrect && <span className="ml-auto text-[10px] uppercase">your answer</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {row.questionType !== 'MCQ' && row.answerText && (
            <p className="mt-2 text-xs" style={{ color: 'var(--exam-text-muted)' }}>
              <span className="font-semibold">Your answer:</span> {row.answerText}
            </p>
          )}
          {row.feedback && (
            <p className="mt-2 text-xs italic" style={{ color: 'var(--exam-text-muted)' }}>
              {row.feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
