import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

/**
 * Pagination - A premium pagination component with smooth animations
 * 
 * @param {number} currentPage - Current active page (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {function} onPageChange - Callback when page changes
 * @param {number} siblingCount - Number of sibling pages to show around current
 * @param {string} className - Additional CSS classes
 */
const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className = ''
}) => {
  if (totalPages <= 1) return null

  const generatePageNumbers = () => {
    const pages = []
    const start = Math.max(1, currentPage - siblingCount)
    const end = Math.min(totalPages, currentPage + siblingCount)

    // Always show first page
    if (start > 1) {
      pages.push(1)
      if (start > 2) pages.push('...')
    }

    // Middle pages
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    // Always show last page
    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...')
      pages.push(totalPages)
    }

    return pages
  }

  const pages = generatePageNumbers()

  return (
    <div className={`pagination ${className}`}>
      {/* Previous Page */}
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>

      {/* First Page Quick Jump */}
      {currentPage > 2 && (
        <button
          className="pagination-btn"
          onClick={() => onPageChange(1)}
          aria-label="Go to first page"
        >
          <ChevronsLeft size={16} />
        </button>
      )}

      {/* Page Numbers */}
      {pages.map((page, idx) => {
        if (page === '...') {
          return (
            <span key={`ellipsis-${idx}`} className="pagination-info">
              ...
            </span>
          )
        }

        return (
          <button
            key={page}
            className={`pagination-btn ${page === currentPage ? 'active' : ''}`}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            aria-label={`Page ${page}`}
          >
            {page}
          </button>
        )
      })}

      {/* Last Page Quick Jump */}
      {currentPage < totalPages - 1 && (
        <button
          className="pagination-btn"
          onClick={() => onPageChange(totalPages)}
          aria-label="Go to last page"
        >
          <ChevronsRight size={16} />
        </button>
      )}

      {/* Next Page */}
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>

      {/* Page Info */}
      <span className="pagination-info">
        {currentPage} of {totalPages}
      </span>
    </div>
  )
}

export default Pagination