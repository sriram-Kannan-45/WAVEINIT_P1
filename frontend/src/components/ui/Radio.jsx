import { forwardRef } from 'react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

const Radio = forwardRef(({ label, checked, onChange, disabled, name, value, className = '', style = {}, ...props }, ref) => {
  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: typography.fontFamily,
        ...style,
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          ref={ref}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          {...props}
        />
        <div style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: `2px solid ${checked ? colors.primary[600] : colors.border.default}`,
          background: colors.surface.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `all ${transitions.fast}`,
          flexShrink: 0,
        }}>
          {checked && (
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: colors.primary[600],
            }} />
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

Radio.displayName = 'Radio'
export default Radio
