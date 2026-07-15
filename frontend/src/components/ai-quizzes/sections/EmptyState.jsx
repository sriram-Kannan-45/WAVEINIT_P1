/**
 * EmptyState — shown when no quizzes match the current filter / search,
 * or when there are no quizzes at all.
 *
 * Uses the design tokens defined in design-tokens.css (.quizzes-page scope).
 */
import { Brain, RefreshCw, SearchX } from 'lucide-react';

export default function EmptyState({ onRefresh, filtered = false, title, description }) {
  const displayTitle = title || (filtered ? 'No quizzes match your search' : 'No quizzes available');
  const displayDescription = description || (filtered
    ? 'Try a different search term or difficulty filter.'
    : 'Your trainer has not published any quizzes yet. Check back later.');

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '48px 24px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        aria-hidden
        className="mb-4 flex h-14 w-14 items-center justify-center"
        style={{
          background:
            'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(20,184,166,0.10))',
          border: '1px solid rgba(13,148,136,0.18)',
          borderRadius: 14,
          color: 'var(--indigo)',
        }}
      >
        {filtered ? <SearchX size={24} /> : <Brain size={24} />}
      </div>

      <h3
        className="text-[16px] font-semibold tracking-tight"
        style={{ color: 'var(--text)' }}
      >
        {displayTitle}
      </h3>
      <p
        className="mt-1.5 max-w-sm text-[13px] leading-relaxed"
        style={{ color: 'var(--text-2)' }}
      >
        {displayDescription}
      </p>

      {!filtered && onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold transition"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          <RefreshCw size={13} aria-hidden />
          Refresh
        </button>
      )}
    </div>
  );
}
