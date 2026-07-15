import { useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

export default function SearchBar({ value, onChange, placeholder = 'Search...', icon, style = {}, className = '' }) {
  const [focused, setFocused] = useState(false)

  const handleChange = useCallback((e) => {
    onChange?.(e.target.value)
  }, [onChange])

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        flex: 1,
        maxWidth: '450px',
        width: '100%',
        ...style,
      }}
    >
      <span style={{
        position: 'absolute',
        left: '14px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: colors.text.muted,
        pointerEvents: 'none',
        display: 'flex',
        zIndex: 1,
      }}>
        {icon || <Search size={16} />}
      </span>
      <input
        type="text"
        value={value || ''}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: '40px',
          padding: '0 14px 0 40px',
          borderRadius: radius.xl,
          border: `1px solid ${focused ? colors.primary[400] : colors.border.default}`,
          background: colors.surface.primary,
          color: colors.text.primary,
          fontSize: '0.875rem',
          fontFamily: typography.fontFamily,
          outline: 'none',
          transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
          boxSizing: 'border-box',
          boxShadow: focused ? `0 0 0 3px ${colors.primary[50]}` : shadows.xs,
        }}
      />
    </div>
  )
}
