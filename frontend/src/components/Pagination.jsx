import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

/**
 * Pagination - Production-ready, accessible, responsive pagination component.
 * 
 * Supports both compact and full modes with page numbers, smart ellipsis,
 * records-per-page dropdown, and record range info ("Showing 1–10 of 120 records").
 */
export default function Pagination({
  currentPage,
  page,
  totalPages = 1,
  totalItems,
  totalRecords,
  total,
  itemsPerPage,
  pageSize = 10,
  limit,
  onPageChange,
  onPageSizeChange,
  onLimitChange,
  pageSizeOptions = [10, 25, 50, 100],
  siblingCount = 1,
  showPageSize = true,
  showInfo = true,
  recordLabel = 'records',
  disabled = false,
  className = '',
  style = {}
}) {
  // Normalize prop aliases
  const activePage = Math.max(1, parseInt(currentPage ?? page ?? 1, 10))
  const currentLimit = Math.max(1, parseInt(pageSize ?? itemsPerPage ?? limit ?? 10, 10))
  const safeTotalItems = totalItems ?? totalRecords ?? total
  const calculatedTotalPages = safeTotalItems != null
    ? Math.max(1, Math.ceil(safeTotalItems / currentLimit))
    : Math.max(1, parseInt(totalPages || 1, 10))
  const safeTotalPages = Math.max(1, calculatedTotalPages)

  const handlePageChange = (newPage) => {
    if (disabled || newPage < 1 || newPage > safeTotalPages || newPage === activePage) return
    onPageChange?.(newPage)
  }

  const handlePageSizeChange = (e) => {
    const newSize = Number(e.target.value)
    if (onPageSizeChange) onPageSizeChange(newSize)
    else if (onLimitChange) onLimitChange(newSize)
  }

  // Calculate showing X to Y of Z
  const hasItemCount = safeTotalItems != null && safeTotalItems >= 0
  const startRecord = hasItemCount ? (safeTotalItems === 0 ? 0 : (activePage - 1) * currentLimit + 1) : null
  const endRecord = hasItemCount ? Math.min(safeTotalItems, activePage * currentLimit) : null

  // Generate page numbers with smart ellipsis
  const generatePageNumbers = () => {
    const pages = []
    const left = activePage - siblingCount
    const right = activePage + siblingCount + 1
    let last = 0

    for (let i = 1; i <= safeTotalPages; i++) {
      if (i === 1 || i === safeTotalPages || (i >= left && i < right)) {
        if (last && i - last === 2) {
          pages.push(last + 1)
        } else if (last && i - last !== 1) {
          pages.push('...')
        }
        pages.push(i)
        last = i
      }
    }
    return pages
  }

  const pages = generatePageNumbers()
  const hasSizeCallback = Boolean(onPageSizeChange || onLimitChange)

  // If there's only 1 page and no size change option & no item count to show, hide or show minimal
  if (safeTotalPages <= 1 && !hasItemCount && !hasSizeCallback) {
    return null
  }

  return (
    <div
      className={`lms-pagination-container ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--bg-surface, #ffffff)',
        borderTop: '1px solid var(--border-default, #e2e8f0)',
        borderRadius: '0 0 12px 12px',
        fontSize: '13px',
        color: 'var(--text-secondary, #475569)',
        ...style
      }}
    >
      {/* Left: Records Range & Page Size Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        {showInfo && hasItemCount && (
          <span style={{ fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>
            Showing <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{startRecord}</strong> to{' '}
            <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{endRecord}</strong> of{' '}
            <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{safeTotalItems}</strong> {recordLabel}
          </span>
        )}

        {showPageSize && hasSizeCallback && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Per page:</span>
            <select
              value={currentLimit}
              onChange={handlePageSizeChange}
              disabled={disabled}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-default, #cbd5e1)',
                background: 'var(--bg-input, #f8fafc)',
                color: 'var(--text-primary, #1e293b)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                outline: 'none',
              }}
              aria-label="Records per page"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Controls */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {/* First Page */}
        <button
          type="button"
          onClick={() => handlePageChange(1)}
          disabled={disabled || activePage <= 1}
          style={{
            minWidth: '32px',
            height: '32px',
            padding: '0 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-default, #e2e8f0)',
            background: activePage <= 1 ? 'transparent' : 'var(--bg-surface, #ffffff)',
            color: activePage <= 1 ? '#cbd5e1' : 'var(--text-secondary, #475569)',
            cursor: activePage <= 1 || disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => handlePageChange(activePage - 1)}
          disabled={disabled || activePage <= 1}
          style={{
            minWidth: '32px',
            height: '32px',
            padding: '0 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-default, #e2e8f0)',
            background: activePage <= 1 ? 'transparent' : 'var(--bg-surface, #ffffff)',
            color: activePage <= 1 ? '#cbd5e1' : 'var(--text-secondary, #475569)',
            cursor: activePage <= 1 || disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Number Buttons */}
        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span
                key={`ellipsis-${idx}`}
                style={{
                  minWidth: '24px',
                  textAlign: 'center',
                  color: 'var(--text-muted, #94a3b8)',
                  userSelect: 'none',
                  fontSize: '13px',
                }}
              >
                …
              </span>
            )
          }

          const isActive = p === activePage

          return (
            <button
              key={p}
              type="button"
              onClick={() => handlePageChange(p)}
              disabled={disabled}
              style={{
                minWidth: '32px',
                height: '32px',
                padding: '0 8px',
                borderRadius: '6px',
                border: isActive ? '1px solid #2563eb' : '1px solid var(--border-default, #e2e8f0)',
                background: isActive ? '#2563eb' : 'var(--bg-surface, #ffffff)',
                color: isActive ? '#ffffff' : 'var(--text-primary, #334155)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.3)' : 'none',
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Page ${p}`}
            >
              {p}
            </button>
          )
        })}

        {/* Next Page */}
        <button
          type="button"
          onClick={() => handlePageChange(activePage + 1)}
          disabled={disabled || activePage >= safeTotalPages}
          style={{
            minWidth: '32px',
            height: '32px',
            padding: '0 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-default, #e2e8f0)',
            background: activePage >= safeTotalPages ? 'transparent' : 'var(--bg-surface, #ffffff)',
            color: activePage >= safeTotalPages ? '#cbd5e1' : 'var(--text-secondary, #475569)',
            cursor: activePage >= safeTotalPages || disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => handlePageChange(safeTotalPages)}
          disabled={disabled || activePage >= safeTotalPages}
          style={{
            minWidth: '32px',
            height: '32px',
            padding: '0 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-default, #e2e8f0)',
            background: activePage >= safeTotalPages ? 'transparent' : 'var(--bg-surface, #ffffff)',
            color: activePage >= safeTotalPages ? '#cbd5e1' : 'var(--text-secondary, #475569)',
            cursor: activePage >= safeTotalPages || disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  )
}