import { forwardRef } from 'react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

const Checkbox = forwardRef(({ label, checked, onChange, disabled, error, className = '', style = {}, ...props }, ref) => {
  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? opacity.disabled : 1,
        fontFamily: typography.fontFamily,
        ...style,
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          {...props}
        />
        <div style={{
          width: '18px',
          height: '18px',
          borderRadius: radius.sm,
          border: `2px solid ${error ? colors.danger[400] : checked ? colors.primary[600] : colors.border.default}`,
          background: checked ? colors.primary[600] : colors.surface.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `all ${transitions.fast}`,
          flexShrink: 0,
        }}>
          {checked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
      {label && (
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: disabled ? colors.text.muted : colors.text.primary,
          lineHeight: 1.4,
        }}>
          {label}
        </span>
      )}
    </label>
  )
})

Checkbox.displayName = 'Checkbox'
export default Checkbox
