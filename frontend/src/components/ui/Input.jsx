import { forwardRef } from 'react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

const Input = forwardRef(({ label, error, helperText, icon, className = '', style = {}, ...props }, ref) => {
  const baseStyle = {
    width: '100%',
    padding: icon ? '10px 14px 10px 40px' : '10px 14px',
    borderRadius: radius.lg,
    border: `1px solid ${error ? colors.danger[400] : colors.border.default}`,
    background: colors.surface.primary,
    color: colors.text.primary,
    fontSize: '0.875rem',
    fontFamily: typography.fontFamily,
    outline: 'none',
    transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
    boxSizing: 'border-box',
    ...(error && { boxShadow: `0 0 0 3px ${colors.danger[50]}` }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: colors.text.primary,
          fontFamily: typography.fontFamily,
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: colors.text.muted,
            pointerEvents: 'none',
            display: 'flex',
          }}>
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={className}
          style={{ ...baseStyle, ...style }}
          {...props}
        />
      </div>
      {(error || helperText) && (
        <span style={{
          fontSize: '0.75rem',
          color: error ? colors.danger[600] : colors.text.muted,
          fontFamily: typography.fontFamily,
        }}>
          {error || helperText}
        </span>
      )}
    </div>
  )
})

Input.displayName = 'Input'
export default Input
