export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="skeleton-card glass-surface glass-surface--padded">
      <Skeleton className="skeleton-card__icon" />
      <Skeleton className="skeleton-card__title" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="skeleton-card__line" style={{ width: `${90 - i * 15}%` }} />
      ))}
      <Skeleton className="skeleton-card__btn" />
    </div>
  )
}

export function SkeletonStatGrid({ count = 4 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card skeleton-stat">
          <Skeleton className="skeleton-stat__label" />
          <Skeleton className="skeleton-stat__value" />
        </div>
      ))}
    </div>
  )
}

export default Skeleton
