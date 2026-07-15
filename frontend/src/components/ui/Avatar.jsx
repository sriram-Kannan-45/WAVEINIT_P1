import { colors, typography, radius } from '../../theme/tokens'

const sizeMap = {
  xs: { width: 24, height: 24, fontSize: 10 },
  sm: { width: 32, height: 32, fontSize: 12 },
  md: { width: 40, height: 40, fontSize: 14 },
  lg: { width: 48, height: 48, fontSize: 16 },
  xl: { width: 64, height: 64, fontSize: 20 },
}

export default function Avatar({ src, alt, name, size = 'md', style = {}, className = '' }) {
  const s = sizeMap[size] || sizeMap.md
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

  return (
    <div
      className={className}
      style={{
        width: s.width,
        height: s.height,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.primary[100],
        color: colors.primary[700],
        fontSize: s.fontSize,
        fontWeight: 700,
        fontFamily: typography.fontFamily,
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img src={src} alt={alt || name || 'Avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials
      )}
    </div>
  )
}
