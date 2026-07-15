import { motion } from 'framer-motion';
import {
  Focus,
  CheckCircle2,
  Circle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { formatRemaining } from '../hooks/useExamTimer';

const R = 56;
const CIRC = 2 * Math.PI * R;

export default function QuestionNavigator({
  questions,
  answers,
  flagged,
  currentIndex,
  onJump,
  timeLeft,
  totalSeconds,
  onFocusMode,
}) {
  const total = questions.length;
  const answeredCount = questions.filter(q => hasAnswer(answers.get(q.id))).length;
  const remaining = total - answeredCount;
  const scoreEst = total > 0 ? Math.round((answeredCount / total) * 90 + 10) : 0; // simple heuristic
  const critical = typeof timeLeft === 'number' && timeLeft <= 60;
  const lowWarn = typeof timeLeft === 'number' && timeLeft <= 300 && timeLeft > 60;

  const pct = totalSeconds > 0 && typeof timeLeft === 'number' ? timeLeft / totalSeconds : 1;
  const offset = CIRC * (1 - Math.max(0, Math.min(1, pct)));

  return (
    <div className="eq-sidebar-scroll flex h-full min-h-0 flex-col gap-4 pr-1">

      {/* ── 1. Time Left card ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="eq-card shrink-0 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: 'var(--eq-text)' }}>Time Left</span>
          <button
            type="button"
            onClick={onFocusMode}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition hover:bg-slate-50"
            style={{ borderColor: 'var(--eq-border)', color: 'var(--eq-text-muted)' }}
          >
            <Focus className="h-3 w-3" /> Focus Mode
          </button>
        </div>

        <div className={`relative mx-auto flex items-center justify-center ${critical ? 'eq-timer-critical' : ''}`} style={{ width: 140, height: 140 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={critical ? '#dc2626' : 'var(--eq-accent)'} />
                <stop offset="100%" stopColor={critical ? '#f43f5e' : 'var(--eq-accent-3)'} />
              </linearGradient>
            </defs>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--eq-border)" strokeWidth="6" />
            <motion.circle
              cx="70" cy="70" r={R}
              fill="none"
              stroke="url(#timer-gradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={false}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: 'linear' }}
              className="eq-timer-ring"
              style={{ filter: 'drop-shadow(0 0 8px rgba(124, 58, 237, 0.35))' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span
              className="eq-timer-mono text-2xl font-extrabold leading-none tracking-tight"
              style={{ color: critical ? 'var(--eq-danger)' : 'var(--eq-text)' }}
              aria-live="polite"
            >
              {formatRemaining(timeLeft)}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--eq-text-muted)' }}>
              Remaining
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: 'var(--eq-text-muted)' }}>
          {critical
            ? "Less than a minute — wrap up now."
            : lowWarn
            ? 'Final 5 minutes — stay focused.'
            : "Stay focused! You've got this."}
        </p>
      </motion.div>

      {/* ── 2. Question Navigator card ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06 }}
        className="eq-card shrink-0 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: 'var(--eq-text)' }}>Question Navigator</span>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--eq-text-muted)' }}>
            {answeredCount} of {total} answered
          </span>
        </div>

        {/* Numbered chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {questions.map((q, i) => {
            const isCurrent = i === currentIndex;
            const isAnswered = hasAnswer(answers.get(q.id));
            const isFlagged = flagged.has(q.id);

            return (
              <motion.button
                key={q.id}
                type="button"
                onClick={() => onJump(i)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                style={{
                  background: isCurrent
                    ? 'var(--eq-accent)'
                    : isAnswered
                    ? 'var(--eq-success-soft)'
                    : '#fff',
                  color: isCurrent ? '#fff' : isAnswered ? 'var(--eq-success)' : 'var(--eq-text-muted)',
                  border: isCurrent
                    ? 'none'
                    : isAnswered
                    ? '1.5px solid var(--eq-success)'
                    : '1.5px solid var(--eq-border)',
                  boxShadow: isCurrent ? 'var(--eq-shadow-accent)' : 'none',
                }}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Question ${i + 1}`}
              >
                {i + 1}
                {isFlagged && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
                    style={{ background: 'var(--eq-flag)', border: '1.5px solid #fff' }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--eq-border)' }}>
          <LegendItem dot="var(--eq-accent)" filled label="Current" />
          <LegendItem dot="var(--eq-success)" check label="Answered" />
          <LegendItem dot="var(--eq-border-strong)" label="Unanswered" />
        </div>
      </motion.div>

      {/* ── 3. Live Progress card ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="eq-card shrink-0 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: 'var(--eq-text)' }}>Live Progress</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCell
            icon={<CheckCircle2 className="h-4 w-4" />}
            iconBg="var(--eq-success-soft)"
            iconColor="var(--eq-success)"
            label="Answered"
            value={`${answeredCount} / ${total}`}
            valueColor="var(--eq-text)"
          />
          <StatCell
            icon={<Clock className="h-4 w-4" />}
            iconBg="var(--eq-accent-soft)"
            iconColor="var(--eq-accent)"
            label="Remaining"
            value={remaining}
            valueColor="var(--eq-text)"
          />
          <StatCell
            icon={<TrendingUp className="h-4 w-4" />}
            iconBg="#fef3f9"
            iconColor="var(--eq-accent-3)"
            label="Score (Est.)"
            value={`${scoreEst}%`}
            valueColor="var(--eq-accent)"
          />
        </div>
      </motion.div>

      {/* ── 4. Performance Trend card ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
        className="eq-card shrink-0 p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: 'var(--eq-text)' }}>Performance Trend</span>
          <TrendingUp className="h-4 w-4" style={{ color: 'var(--eq-accent)' }} />
        </div>
        <PerfChart total={total} answeredCount={answeredCount} currentIndex={currentIndex} />
      </motion.div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function LegendItem({ dot, filled, check, label }) {
  return (
    <div className="flex items-center gap-1.5">
      {check ? (
        <span
          className="flex h-3 w-3 items-center justify-center rounded-full"
          style={{ background: 'var(--eq-success-soft)', border: '1px solid var(--eq-success)' }}
        >
          <CheckCircle2 className="h-2 w-2" style={{ color: 'var(--eq-success)' }} />
        </span>
      ) : (
        <span
          className="h-3 w-3 rounded-full"
          style={{
            background: filled ? dot : 'transparent',
            border: filled ? `1px solid ${dot}` : `1.5px solid ${dot}`,
          }}
        />
      )}
      <span className="text-[11px] font-medium" style={{ color: 'var(--eq-text-muted)' }}>{label}</span>
    </div>
  );
}

function StatCell({ icon, iconBg, iconColor, label, value, valueColor }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl px-2 py-3" style={{ background: 'var(--eq-bg-2)' }}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--eq-text-muted)' }}>
        {label}
      </span>
      <span className="text-base font-extrabold tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

function PerfChart({ total, answeredCount, currentIndex }) {
  // Build a small line chart based on cumulative answered ratio
  const points = total > 0 ? Array.from({ length: total }, (_, i) => {
    const x = total === 1 ? 0 : (i / (total - 1)) * 100;
    // Cap by progress: each question contributes equally
    const y = i <= currentIndex ? Math.min(100, (answeredCount / Math.max(1, currentIndex + 1)) * 90 + 10) : 10;
    return { x, y };
  }) : [{ x: 0, y: 10 }, { x: 100, y: 10 }];

  const path = points.map((p, i) => {
    const cy = 100 - p.y; // invert y for SVG
    return `${i === 0 ? 'M' : 'L'} ${p.x} ${cy}`;
  }).join(' ');

  const areaPath = `${path} L 100 100 L 0 100 Z`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative" style={{ height: 90 }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="perf-area" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--eq-accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--eq-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="perf-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--eq-accent)" />
              <stop offset="100%" stopColor="var(--eq-accent-3)" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0, 25, 50, 75].map(y => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--eq-border)" strokeWidth="0.3" strokeDasharray="2,2" />
          ))}
          <path d={areaPath} fill="url(#perf-area)" />
          <path d={path} fill="none" stroke="url(#perf-line)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Y labels */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[8px]" style={{ color: 'var(--eq-text-light)' }}>
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
      </div>
    </div>
  );
}

function hasAnswer(a) {
  if (!a) return false;
  return (
    (a.selectedOption !== null && a.selectedOption !== undefined && a.selectedOption !== '') ||
    (typeof a.answerText === 'string' && a.answerText.trim().length > 0)
  );
}
