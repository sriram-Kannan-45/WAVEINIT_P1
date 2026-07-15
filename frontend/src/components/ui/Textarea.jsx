import { forwardRef } from 'react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

const Textarea = forwardRef(({ label, error, helperText, rows = 4, className = '', style = {}, ...props }, ref) => {
  const baseStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: radius.lg,
    border: `1px solid ${error ? colors.danger[400] : colors.border.default}`,
    background: colors.surface.primary,
    color: colors.text.primary,
    fontSize: '0.875rem',
    fontFamily: typography.fontFamily,
    outline: 'none',
    transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '80px',
    lineHeight: 1.5,
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
      <textarea
        ref={ref}
        rows={rows}
        className={className}
        style={{ ...baseStyle, ...style }}
        {...props}
      />
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

Textarea.displayName = 'Textarea'
export default Textarea
