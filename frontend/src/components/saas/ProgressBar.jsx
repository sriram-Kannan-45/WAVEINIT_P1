import { motion } from 'framer-motion'
import { colors } from '../../theme/tokens'

export default function ProgressBar({ value = 0, color = colors.brand.blueDark, height = 6, animate = true }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  return (
    <div style={{ height, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden', width: '100%' }}>
      <motion.div
        initial={animate ? { width: 0 } : false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ height: '100%', background: color, borderRadius: 9999 }}
      />
    </div>
  )
}
