import { motion } from 'framer-motion'

const colorMap = {
  primary: { bg: 'rgba(22, 163, 74, 0.06)', color: '#16a34a' },
  emerald: { bg: 'rgba(16, 185, 129, 0.06)', color: '#10B981' },
  amber: { bg: 'rgba(245, 158, 11, 0.06)', color: '#F59E0B' },
  blue: { bg: 'rgba(13, 148, 136, 0.06)', color: '#0D9488' },
  violet: { bg: 'rgba(147, 51, 234, 0.06)', color: '#9333ea' },
  rose: { bg: 'rgba(244, 63, 94, 0.06)', color: '#F43F5E' },
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
      className={`reg-admin-stat ${className}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className="reg-admin-stat-icon" style={{ background: colors.bg, color: colors.color }}>
        {Icon && <Icon size={20} />}
      </div>
      <div>
        <span style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 500,
          color: '#64748b',
          marginBottom: '2px',
        }}>
          {label}
        </span>
        <span className="reg-admin-stat-num">
          {value}
        </span>
        {trend && (
          <span style={{
            display: 'inline-block',
            marginTop: '6px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '9999px',
            background: trendColor === 'success' ? '#f0fdf4' : trendColor === 'danger' ? '#fef2f2' : '#fffbeb',
            color: trendColor === 'success' ? '#16a34a' : trendColor === 'danger' ? '#ef4444' : '#d97706',
          }}>
            {trend}
          </span>
        )}
      </div>
    </motion.div>
  )
}
