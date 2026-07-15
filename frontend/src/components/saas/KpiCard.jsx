import { motion } from 'framer-motion'
import { colors } from '../../theme/tokens'

function Sparkline({ color, points, id }) {
  return (
    <svg width="64" height="28" viewBox="0 0 64 24" style={{ overflow: 'visible', opacity: 0.8 }} aria-hidden="true">
      <defs>
        <linearGradient id={`sparklineGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area under curve */}
      {points && (
        <polygon
          points={`${points} 64,24 0,24`}
          fill={`url(#sparklineGrad-${id})`}
        />
      )}
      <polyline
        points={points || '0,18 8,14 16,16 24,10 32,12 40,6 48,8 56,4 64,2'}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function KpiCard({ icon: Icon, label, value, trendColor, bgIcon, colorIcon, sparkPoints }) {
  const sparklineColor = colorIcon || '#3b82f6'
  const randomId = Math.random().toString(36).substr(2, 9)

  // Determine trend percentage text or default
  let trendText = ""
  if (label.includes("Total Courses")) trendText = "+100% from last month"
  else if (label.includes("Active Learners")) trendText = "+100% from last week"
  else if (label.includes("Average Rating") || label.includes("Avg. Rating")) trendText = "No changes"
  else if (label.includes("Feedback")) trendText = "No feedback yet"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, boxShadow: 'var(--shadow-xl)' }}
      style={{
        padding: '24px', // Required 24px padding
        borderRadius: '20px', // Required 20px border radius
        background: '#fff',
        border: '1px solid #e5e7eb', // Required subtle border
        boxShadow: 'var(--shadow-card)', // Soft shadow
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1), border-color 250ms ease',
        fontFamily: "'Inter', sans-serif",
      }}
      className="hover:border-slate-300 dark:hover:border-slate-700"
    >
      {/* Top row: icon (left) + sparkline (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            background: bgIcon || 'rgba(37,99,235,0.08)',
            color: colorIcon || '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} />
        </div>
        <Sparkline color={sparklineColor} points={sparkPoints} id={randomId} />
      </div>

      {/* Content */}
      <div style={{ marginTop: 'auto' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280', display: 'block', textTransform: 'none', letterSpacing: '-0.01em', marginBottom: 4 }}>
          {label}
        </span>
        <span style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', lineHeight: 1.1, display: 'block', letterSpacing: '-0.03em' }}>
          {value}
        </span>
      </div>

      {/* Trend text at the bottom */}
      {trendText && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ 
            fontSize: 12, 
            fontWeight: 500, 
            color: trendText.includes("+100%") ? '#10b981' : '#6b7280'
          }}>
            {trendText}
          </span>
        </div>
      )}
    </motion.div>
  )
}

