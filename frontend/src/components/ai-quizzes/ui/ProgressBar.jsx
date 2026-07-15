import { motion } from 'framer-motion'

export default function ProgressBar({
  value = 0,
  label,
  showValue = true,
  delay = 0,
  className = '',
}) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="ai-quiz-progress__head">
          {label && <span className="ai-quiz-progress__label">{label}</span>}
          {showValue && <span className="ai-quiz-progress__value">{clamped}%</span>}
        </div>
      )}
      <div
        className="ai-quiz-progress__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay }}
          className="ai-quiz-progress__fill"
        />
      </div>
    </div>
  )
}
