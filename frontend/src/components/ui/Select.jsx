import { forwardRef } from 'react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

const Select = forwardRef(({ label, error, helperText, options = [], placeholder, className = '', style = {}, ...props }, ref) => {
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
    appearance: 'none',
    cursor: 'pointer',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '40px',
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
      <select
        ref={ref}
        className={className}
        style={{ ...baseStyle, ...style }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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

Select.displayName = 'Select'
export default Select
