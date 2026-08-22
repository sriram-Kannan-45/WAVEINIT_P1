import { motion } from 'framer-motion'

const colorMap = {
  primary: { bg: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16a34a' },
  emerald: { bg: '#FFFFFF', border: '1.5px solid #10B981', color: '#10B981' },
  amber: { bg: '#FFFFFF', border: '1.5px solid #F59E0B', color: '#F59E0B' },
  blue: { bg: '#FFFFFF', border: '1.5px solid #0D9488', color: '#0D9488' },
  violet: { bg: '#FFFFFF', border: '1.5px solid #9333ea', color: '#9333ea' },
  rose: { bg: '#FFFFFF', border: '1.5px solid #F43F5E', color: '#F43F5E' },
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
      <div className="reg-admin-stat-icon" style={{ background: colors.bg, border: colors.border, color: colors.color }}>
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
