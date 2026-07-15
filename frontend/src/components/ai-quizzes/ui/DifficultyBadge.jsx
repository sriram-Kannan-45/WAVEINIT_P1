import { getDifficultyConfig } from '../constants'

export default function DifficultyBadge({ level, className = '' }) {
  const config = getDifficultyConfig(level)

  return (
    <span className={`ai-quiz-badge ${className}`} data-level={(level || 'medium').toLowerCase()}>
      <span className={`ai-quiz-badge__dot ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  )
}
