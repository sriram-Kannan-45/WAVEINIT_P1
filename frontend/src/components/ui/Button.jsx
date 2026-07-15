import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'btn-enterprise btn-enterprise--primary',
  secondary: 'btn-enterprise btn-enterprise--secondary',
  outline: 'btn-enterprise btn-enterprise--secondary',
  ghost: 'btn-enterprise btn-enterprise--ghost',
  danger: 'btn-enterprise btn-enterprise--danger',
}

const sizes = {
  sm: 'btn-enterprise--sm',
  md: '',
  lg: 'btn-enterprise--lg',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
  'aria-busy': ariaBusy,
  ...props
}) {
  const cls = [
    variants[variant] || variants.primary,
    sizes[size] || sizes.md,
    className,
  ].filter(Boolean).join(' ')

  return (
    <motion.button
      type={type}
      whileHover={!disabled && !loading ? { y: -1 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.98 } : undefined}
      className={cls}
      disabled={disabled || loading}
      onClick={onClick}
      aria-disabled={disabled || loading}
      aria-busy={ariaBusy ?? loading}
      aria-label={ariaLabel}
      {...props}
    >
      {loading && <Loader2 size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} style={{ animation: 'spin 1s linear infinite' }} />}
      {!loading && Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
      {children && <span>{children}</span>}
      {!loading && Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
    </motion.button>
  )
}
