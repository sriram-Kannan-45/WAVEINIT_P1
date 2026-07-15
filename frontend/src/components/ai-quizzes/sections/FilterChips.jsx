/**
 * FilterChips — search + difficulty filter row.
 *
 * 2026-05-28 redesign: borderless search on tinted surface with violet
 * focus ring; ghost pills with solid violet active state. No card chrome
 * — sits inline with the page rhythm (Linear / Vercel style).
 */
import { Search, X } from 'lucide-react';

const FILTER_DEFS = [
  { key: 'ALL',    label: 'All' },
  { key: 'EASY',   label: 'Easy' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'HARD',   label: 'Hard' },
  { key: 'MIXED',  label: 'Mixed' },
];

export default function FilterChips({ filter, onFilterChange, counts, search, onSearchChange }) {
  return (
    <section className="qz-filters" aria-label="Filter assessments">
      {/* Search */}
      <div className="qz-search">
        <Search size={15} className="qz-search__icon" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search assessments…"
          aria-label="Search quizzes"
          className="qz-search__input"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="qz-search__clear"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="qz-pills" role="group" aria-label="Filter by difficulty">
        {FILTER_DEFS.map(({ key, label }) => {
          const count = key === 'ALL' ? counts.ALL : counts[key] || 0;
          if (key !== 'ALL' && count === 0) return null;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              aria-pressed={active}
              className="qz-filter-pill"
              data-active={active ? 'true' : 'false'}
            >
              <span>{label}</span>
              <span className="qz-filter-pill__count mono">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
