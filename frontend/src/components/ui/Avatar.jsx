import { colors, typography, radius } from '../../theme/tokens'
import { getTwoLetterInitials } from '../common/UserAvatar'

const sizeMap = {
  xs: { width: 24, height: 24, fontSize: 10 },
  sm: { width: 32, height: 32, fontSize: 12 },
  md: { width: 40, height: 40, fontSize: 14 },
  lg: { width: 48, height: 48, fontSize: 16 },
  xl: { width: 64, height: 64, fontSize: 20 },
}

export default function Avatar({ src, alt, name, size = 'md', style = {}, className = '' }) {
  const s = sizeMap[size] || sizeMap.md
  const initials = getTwoLetterInitials(name)

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
        background: '#16A34A',
        color: '#FFFFFF',
        fontSize: s.fontSize,
        fontWeight: 700,
        fontFamily: typography.fontFamily,
        flexShrink: 0,
        ...style,
      }}
    >
      {initials}
    </div>
  )
}
