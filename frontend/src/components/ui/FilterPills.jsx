import { colors, radius, spacing, typography, transitions } from '../../theme/tokens'

export default function FilterPills({ options = [], active = 'ALL', onChange, labelKey }) {
  return (
    <div style={{
      display: 'flex',
      gap: spacing[1],
      padding: spacing[1],
      background: colors.surface.primary,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.full,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }} role="tablist" aria-label={labelKey || 'Filter'}>
      {options.map((opt) => {
        const isActive = active === opt.value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 16px',
              borderRadius: radius.full,
              border: 'none',
              background: isActive ? colors.primary[600] : 'transparent',
              color: isActive ? colors.text.inverse : colors.text.muted,
              fontSize: '0.75rem',
              fontWeight: 600,
              fontFamily: typography.fontFamily,
              cursor: 'pointer',
              transition: `all ${transitions.fast}`,
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}