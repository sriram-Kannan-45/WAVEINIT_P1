import { ChevronLeft, ChevronRight } from 'lucide-react'
import { colors, typography, radius, transitions } from '../../theme/tokens'

export default function Pagination({ totalItems, itemsPerPage = 10, currentPage = 1, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  if (totalPages <= 1) return null

  const start = (currentPage - 1) * itemsPerPage + 1
  const end = Math.min(currentPage * itemsPerPage, totalItems)

  const btnStyle = (active = false, disabled = false) => ({
    width: '36px',
    height: '36px',
    borderRadius: radius.md,
    border: active ? 'none' : `1px solid ${colors.border.default}`,
    background: active ? colors.primary[600] : colors.surface.primary,
    color: active ? colors.text.inverse : disabled ? colors.text.muted : colors.text.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.875rem',
    fontWeight: active ? 700 : 500,
    fontFamily: typography.fontFamily,
    transition: `all ${transitions.fast}`,
  })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '24px',
      fontFamily: typography.fontFamily,
      fontSize: '0.875rem',
      color: colors.text.muted,
    }}>
      <span>Showing {start}–{end} of {totalItems}</span>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          style={btnStyle(false, currentPage <= 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => onPageChange?.(page)}
            style={btnStyle(page === currentPage)}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={btnStyle(false, currentPage >= totalPages)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
