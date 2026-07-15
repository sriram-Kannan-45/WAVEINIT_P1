import { colors, radius, shadows, typography, transitions } from '../theme/tokens'

export default function Toolbar({ children, style = {} }) {
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-4)',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: colors.surface.primary,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.xl,
      padding: 'var(--space-4) var(--space-5)',
      boxShadow: shadows.xs,
      marginBottom: 'var(--space-8)',
      flexWrap: 'wrap',
      ...style,
    }}>
      {children}
    </div>
  )
}
