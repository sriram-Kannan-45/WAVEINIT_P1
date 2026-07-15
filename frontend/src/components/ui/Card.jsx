import { colors, radius, shadows, transitions } from '../../theme/tokens'

export default function Card({ children, className = '', padding = true, hover = false, style = {}, ...props }) {
  const baseStyle = {
    background: colors.surface.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.card,
    overflow: 'hidden',
    transition: hover ? `box-shadow ${transitions.normal}, transform ${transitions.normal}` : undefined,
    ...style,
  }

  const hoverStyle = hover ? {
    ':hover': { boxShadow: shadows['card-hover'], transform: 'translateY(-2px)' },
  } : {}

  return (
    <div
      className={`ds-card ${hover ? 'ds-card-hover' : ''} ${padding ? 'ds-card-padding' : ''} ${className}`}
      style={baseStyle}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(0, 0, 0, 0.06)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.boxShadow = shadows.card
        e.currentTarget.style.transform = 'none'
      } : undefined}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', action, style = {} }) {
  return (
    <div className={className} style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${spacing[5]} ${spacing[6]}`,
      borderBottom: `1px solid ${colors.border.light}`,
      ...style,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function CardBody({ children, className = '', style = {} }) {
  return (
    <div className={className} style={{ padding: `${spacing[5]} ${spacing[6]}`, ...style }}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '', style = {} }) {
  return (
    <div className={className} style={{
      padding: `${spacing[4]} ${spacing[6]}`,
      borderTop: `1px solid ${colors.border.light}`,
      ...style,
    }}>
      {children}
    </div>
  )
}
