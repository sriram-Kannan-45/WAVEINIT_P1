import { motion } from 'framer-motion'
import { colors } from '../../theme/tokens'

export default function ActionButton({
  variant = 'primary',
  children,
  icon: Icon,
  iconPosition = 'left',
  onClick,
  height = 46,
  radius = 12,
  fullWidth = false,
  square = false,
  ariaLabel,
  className = '',
}) {
  const variants = {
    primary: { background: colors.brand.blueDark, color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: colors.text.secondary, border: `1px solid ${colors.border.default}` },
    icon: { background: '#fff', color: colors.text.secondary, border: `1px solid ${colors.border.default}` },
  }
  const base = variants[variant] || variants.primary
  return (
    <motion.button
      whileHover={{
        y: -1,
        backgroundColor: variant === 'primary' ? '#1d4ed8' : '#f8fafc'
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${fullWidth ? 'flex-1' : ''} ${className}`}
      style={{
        height,
        width: square ? height : undefined,
        padding: square ? 0 : '0 16px',
        borderRadius: radius,
        cursor: 'pointer',
        outline: 'none',
        ...base,
      }}
    >
      {Icon && iconPosition === 'left' && <Icon size={16} />}
      {children}
      {Icon && iconPosition === 'right' && <Icon size={16} />}
    </motion.button>
  )
}
