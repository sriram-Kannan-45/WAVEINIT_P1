/**
 * ExamResultPage — post-submit summary at /exam/:sessionId/result.
 *
 * Displays academic score, question-by-question review, and the authoritative
 * Monitoring & Proctoring Integrity report.
 */
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Award,
  Smartphone,
  Shield,
  AlertTriangle,
  Camera,
  Clock,
  Activity,
  Check,
} from 'lucide-react';

import '../proctoring/exam/exam.css';
import { proctorApi } from '../proctoring/api';
import { API_BASE } from '../api/api';
import useAuthUser from '../proctoring/hooks/useAuthUser';

export default function ExamResultPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuthUser();
  const [data, setData] = useState(null);
  const [monitoringReport, setMonitoringReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ready || !user?.id) return;
    let alive = true;

    // Fetch exam result
    proctorApi
      .getResult(sessionId)
      .then((d) => {
        if (alive) {
          setData(d);
          // Fetch unified monitoring report
          fetch(`${API_BASE}/monitoring/sessions/${sessionId}/report`, {
            headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
          })
            .then((r) => r.json())
            .then((rep) => {
              if (alive && rep?.success && rep?.data) {
                setMonitoringReport(rep.data);
              }
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if (alive) setError(e.message || 'Failed to load result');
      });

    return () => {
      alive = false;
    };
  }, [ready, user?.id, user?.token, sessionId]);

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
          <ResultBody
            data={data}
            monitoringReport={monitoringReport}
            onExit={() => navigate('/participant', { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function ResultBody({ data, monitoringReport, onExit }) {
  const result = data.result;
  const breakdown = data.breakdown || [];
  const correct = breakdown.filter((b) => b.isCorrect).length;
  const percentage = result?.percentage ?? 0;
  const passed = percentage >= 50;

  const riskLevel = monitoringReport?.riskLevel || data.session?.riskLevel || 'LOW';
  const riskScore = monitoringReport?.score ?? data.session?.score ?? 0;
  const integrityFlags = monitoringReport?.integrityFlags || data.session?.integrityFlags || [];

  const getRiskBadge = (level) => {
    switch (level) {
      case 'CRITICAL':
        return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
      case 'HIGH':
        return { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' };
      case 'MEDIUM':
        return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      default:
        return { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' };
    }
  };

  const badge = getRiskBadge(riskLevel);

  return (
    <>
      {/* Header card */}
      <section
        className="border bg-white p-6 text-center sm:p-10 shadow-sm"
        style={{ borderColor: 'var(--exam-border)', borderRadius: 12 }}
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
          Assessment Completed
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: 'var(--exam-text)' }}>
          {data.quiz?.title || 'Your Result'}
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
          <Stat label="Correct" value={`${correct}/${breakdown.length}`} />
        </div>

        {/* ── Unified Monitoring & Integrity Card ── */}
        <div
          className="mt-8 border p-5 text-left rounded-xl transition shadow-xs"
          style={{
            borderColor: badge.border,
            background: badge.bg,
          }}
        >
          <div className="flex items-center justify-between border-b pb-3 mb-3" style={{ borderColor: badge.border }}>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" style={{ color: badge.text }} />
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: badge.text }}>
                Monitoring Integrity Summary
              </h3>
            </div>
            <span
              className="px-2.5 py-0.5 text-xs font-bold rounded-full uppercase tracking-wider border"
              style={{ background: '#ffffff', color: badge.text, borderColor: badge.border }}
            >
              Risk: {riskLevel} ({riskScore} pts)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Laptop Feed</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Camera size={12} className="text-emerald-600" />
                {monitoringReport?.laptopStatus || 'ACTIVE'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Mobile Feed</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Smartphone size={12} className="text-emerald-600" />
                {monitoringReport?.mobileStatus || (monitoringReport?.mobileEnabled ? 'PAIRED' : 'DISABLED')}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Events Ingested</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Activity size={12} className="text-slate-600" />
                {monitoringReport?.totalEvents ?? data.session?.totalEvents ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Calibration</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Check size={12} className="text-emerald-600" />
                {monitoringReport?.calibrationPassed ? 'Verified' : 'Bypassed'}
              </span>
            </div>
          </div>

          {integrityFlags.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-bold">Integrity Flags Recorded:</p>
                <ul className="list-disc list-inside mt-0.5 text-[11px] space-y-0.5">
                  {integrityFlags.map((flag, idx) => (
                    <li key={idx}>{flag.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onExit}
          className="mt-8 inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition"
          style={{ background: 'var(--exam-accent)', borderRadius: 8 }}
        >
          Back to Dashboard <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>

      {/* Question-by-question Breakdown */}
      {breakdown.length > 0 && (
        <section className="mt-8">
          <h2
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--exam-text-muted)' }}
          >
            Question-by-question Review
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
          <p className="question-text mt-1 text-sm font-medium" style={{ color: 'var(--exam-text)' }}>
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
                    {isCorrect && <span className="ml-auto text-[10px] uppercase font-bold text-emerald-700">correct</span>}
                    {wasSelected && !isCorrect && <span className="ml-auto text-[10px] uppercase font-bold text-rose-700">your answer</span>}
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
