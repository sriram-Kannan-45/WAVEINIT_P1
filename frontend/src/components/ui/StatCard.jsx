import { motion } from 'framer-motion'

const colorMap = {
  primary: { bg: 'rgba(5, 150, 105, 0.08)', color: '#059669', border: 'rgba(5, 150, 105, 0.15)' },
  emerald: { bg: 'rgba(16, 185, 129, 0.08)', color: '#10B981', border: 'rgba(16, 185, 129, 0.15)' },
  amber: { bg: 'rgba(245, 158, 11, 0.08)', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.15)' },
  blue: { bg: 'rgba(13, 148, 136, 0.08)', color: '#0D9488', border: 'rgba(13, 148, 136, 0.15)' },
  violet: { bg: 'rgba(16, 185, 129, 0.06)', color: '#059669', border: 'rgba(16, 185, 129, 0.12)' },
  rose: { bg: 'rgba(244, 63, 94, 0.08)', color: '#F43F5E', border: 'rgba(244, 63, 94, 0.15)' },
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendColor = 'success',
  variant = 'primary',
  className = '',
}) {
  const colors = colorMap[variant] || colorMap.primary

  return (
    <motion.div 
      className={`stat-card ${className}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <span style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: 'var(--neutral-500)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block',
            marginBottom: '8px'
          }}>
            {label}
          </span>
          <span style={{ 
            fontSize: '28px', 
            fontWeight: 800, 
            color: 'var(--neutral-900)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            display: 'block'
          }}>
            {value}
          </span>
          {trend && (
            <span style={{ 
              fontSize: '12px', 
              fontWeight: 600,
              marginTop: '8px',
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: trendColor === 'success' ? 'var(--status-success-bg)' : trendColor === 'danger' ? 'var(--status-error-bg)' : 'var(--status-warning-bg)',
              color: trendColor === 'success' ? 'var(--status-success-dark)' : trendColor === 'danger' ? 'var(--status-error-dark)' : 'var(--status-warning-dark)',
            }}>
              {trend}
            </span>
          )}
        </div>
        {Icon && (
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-lg)',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.color,
            flexShrink: 0,
          }}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </motion.div>
  )
}
