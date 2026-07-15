import { colors, typography, radius, shadows } from '../../theme/tokens'

export default function Tooltip({ children, content, position = 'top', style = {} }) {
  if (!content) return children

  const posStyles = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' },
  }

  return (
    <div className="ds-tooltip-wrap" style={{ position: 'relative', display: 'inline-flex', ...style }}>
      {children}
      <div
        className="ds-tooltip-content"
        style={{
          position: 'absolute',
          ...posStyles[position],
          padding: '6px 12px',
          borderRadius: radius.md,
          background: colors.slate[800],
          color: colors.text.inverse,
          fontSize: '0.75rem',
          fontWeight: 500,
          fontFamily: typography.fontFamily,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          opacity: 0,
          zIndex: zIndex.tooltip,
          transition: 'opacity 150ms ease',
          boxShadow: shadows.md,
        }}
      >
        {content}
      </div>
      <style>{`
        .ds-tooltip-wrap:hover .ds-tooltip-content { opacity: 1; }
      `}</style>
    </div>
  )
}
