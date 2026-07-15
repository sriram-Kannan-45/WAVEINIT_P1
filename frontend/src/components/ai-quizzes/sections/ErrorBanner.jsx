/**
 * ErrorBanner — inline error surface for quiz fetch / network failures.
 * Uses the design tokens defined in design-tokens.css.
 */
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3"
      style={{
        background: 'var(--red-bg)',
        border: '1px solid var(--red-border)',
        color: 'var(--red-text)',
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="flex-1 text-[13px] leading-relaxed">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold transition"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--red-border)',
            color: 'var(--red-text)',
            borderRadius: 8,
          }}
        >
          <RefreshCw size={11} aria-hidden />
          Retry
        </button>
      )}
    </div>
  );
}
