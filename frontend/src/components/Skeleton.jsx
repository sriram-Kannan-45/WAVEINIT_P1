import { motion } from 'framer-motion'

const Skeleton = ({ className = '', style = {} }) => (
  <motion.div
    className={`skeleton ${className}`}
    style={style}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
  />
)

export const SkeletonCard = () => (
  <div className="card" style={{ padding: 'var(--space-3)' }}>
    <Skeleton className="skeleton-title" />
    <Skeleton className="skeleton-text" style={{ width: '80%' }} />
    <Skeleton className="skeleton-text" style={{ width: '60%' }} />
    <Skeleton className="skeleton-text" style={{ width: '70%' }} />
  </div>
)

export const SkeletonTable = ({ rows = 5 }) => (
  <div className="table-wrapper">
    <table className="table">
      <thead>
        <tr>
          {[1, 2, 3, 4, 5].map(i => (
            <th key={i}><Skeleton style={{ width: 80, height: 12 }} /></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array(rows).fill(0).map((_, i) => (
          <tr key={i}>
            {[1, 2, 3, 4, 5].map(j => (
              <td key={j}><Skeleton style={{ width: '60%', height: 14 }} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const SkeletonStats = () => (
  <div className="stats-grid">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="stat-card skeleton-card">
        <Skeleton className="skeleton-text" style={{ width: 60, height: 12, marginBottom: 8 }} />
        <Skeleton className="skeleton-title" style={{ width: 80, height: 28 }} />
      </div>
    ))}
  </div>
)

export default Skeleton
