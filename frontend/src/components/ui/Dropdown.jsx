import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, typography, radius, shadows, transitions, zIndex } from '../../theme/tokens'

export default function Dropdown({ trigger, children, align = 'left', className = '', style = {} }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [close])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') close()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }} className={className}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {open && (
        <div
          onClick={close}
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: '8px',
            [align === 'right' ? 'right' : 'left']: 0,
            minWidth: '200px',
            background: colors.surface.primary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.xl,
            boxShadow: shadows.lg,
            zIndex: zIndex.dropdown,
            padding: '6px',
            animation: 'fadeInDown 150ms ease',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, onClick, danger, disabled, icon, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 12px',
        borderRadius: radius.md,
        border: 'none',
        background: 'transparent',
        color: danger ? colors.danger[600] : colors.text.primary,
        fontSize: '0.875rem',
        fontWeight: 500,
        fontFamily: typography.fontFamily,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        transition: `background ${transitions.fast}`,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = colors.surface.tertiary }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon && <span style={{ display: 'flex', color: danger ? colors.danger[500] : colors.text.muted }}>{icon}</span>}
      {children}
    </button>
  )
}
