/**
 * PageHeader — title block + lightweight stat strip + refresh.
 *
 * 2026-05-28 redesign: cleaner typographic hierarchy, no overly saturated
 * pills. Left side is the title block; right side is a quiet metadata strip
 * with mono numerics, separated by hairline dividers (Linear / Stripe style).
 */
import { RefreshCw } from 'lucide-react';

function StatItem({ value, label }) {
  return (
    <div className="qz-stat">
      <span className="qz-stat__value mono">{value}</span>
      <span className="qz-stat__label">{label}</span>
    </div>
  );
}

export default function PageHeader({ quizCount, totalMinutes, totalQuestions, loading, onRefresh, statusLabel = "Available" }) {
  return (
    <header className="qz-pageheader">
      <div className="qz-pageheader__left">
        <h1 className="qz-pageheader__title">Assessments</h1>
        <p className="qz-pageheader__subtitle">
          AI-generated quizzes from your training materials.
        </p>
      </div>

      <div className="qz-pageheader__right">
        {!loading && (
          <div className="qz-stats" role="list">
            <StatItem value={quizCount} label={statusLabel} />
            <span className="qz-stats__divider" aria-hidden />
            <StatItem value={totalQuestions} label="Questions" />
            <span className="qz-stats__divider" aria-hidden />
            <StatItem value={`${totalMinutes}m`} label="Total time" />
          </div>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="qz-refresh"
            aria-label="Refresh quiz list"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden />
            <span className="qz-refresh__label">Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
