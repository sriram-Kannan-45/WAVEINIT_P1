import { colors, typography, radius, shadows, gradients } from '../theme/tokens'

export default function AuthLayout({ children, variant = 'login' }) {
  const bgGradients = {
    login: 'linear-gradient(135deg, #f5f8ff 0%, #eef3ff 50%, #f8faff 100%)',
    register: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #f0fdfa 100%)',
    forgot: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 50%, #fef3c7 100%)',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: bgGradients[variant] || bgGradients.login,
      padding: 'var(--space-6)',
      fontFamily: typography.fontFamily,
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: colors.surface.primary,
        borderRadius: radius['3xl'],
        boxShadow: shadows.xl,
        border: `1px solid ${colors.border.default}`,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}
