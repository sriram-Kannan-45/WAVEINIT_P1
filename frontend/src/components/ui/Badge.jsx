const colorMap = {
  primary: { bg: 'rgba(13, 148, 136, 0.08)', color: '#0D9488', border: 'rgba(13, 148, 136, 0.15)' },
  success: { bg: 'var(--status-success-bg)', color: 'var(--status-success-dark)', border: 'rgba(18, 183, 106, 0.15)' },
  warning: { bg: 'var(--status-warning-bg)', color: 'var(--status-warning-dark)', border: 'rgba(247, 144, 9, 0.15)' },
  danger: { bg: 'var(--status-error-bg)', color: 'var(--status-error-dark)', border: 'rgba(240, 68, 56, 0.15)' },
  info: { bg: 'var(--status-info-bg)', color: 'var(--status-info-dark)', border: 'rgba(46, 144, 250, 0.15)' },
  neutral: { bg: 'var(--neutral-100)', color: 'var(--neutral-600)', border: 'var(--neutral-200)' },
}

export default function Badge({ children, color = 'primary', className = '', ...props }) {
  const colors = colorMap[color] || colorMap.primary

  return (
    <span 
      className={`badge ${className}`}
      style={{
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
      }}
      {...props}
    >
      {children}
    </span>
  )
}
