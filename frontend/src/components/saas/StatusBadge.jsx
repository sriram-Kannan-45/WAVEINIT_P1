import { colors } from '../../theme/tokens'

export default function StatusBadge({ status = 'DRAFT' }) {
  const label = (status || 'DRAFT').toUpperCase()
  const isPublished = label === 'PUBLISHED'
  return (
    <span
      className="inline-flex items-center rounded-full text-[10px] font-extrabold uppercase tracking-wider"
      style={{
        padding: '4px 10px',
        background: '#ffffff', // Solid white background for high contrast
        color: isPublished ? '#047857' : '#b45309', // Dark green or dark amber text
        border: `1px solid ${isPublished ? '#a7f3d0' : '#fde68a'}`,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {label}
    </span>
  )
}
