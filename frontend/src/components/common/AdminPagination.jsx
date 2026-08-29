import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * AdminPagination
 * ─────────────────────────────────────────────────────────────────────────────
 * Modern, accessible pagination bar for Admin Module tables.
 * 
 * Features:
 * - "Showing X–Y of Z records" indicator
 * - Records-per-page dropdown (10, 25, 50, 100)
 * - Jump to First (<<), Previous (<), Next (>), Last (>>)
 * - Page number buttons with smart ellipsis
 * - Responsive flex layout matching the existing design system
 */
export default function AdminPagination({
  page = 1,
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 10,
  onPageChange,
  onLimitChange,
  pageSizeOptions = [10, 25, 50, 100],
  disabled = false,
  className = '',
}) {
  const currentPage = Math.max(1, page);
  const safeTotalPages = Math.max(1, totalPages || Math.ceil(totalItems / itemsPerPage) || 1);

  const startRecord = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(totalItems, currentPage * itemsPerPage);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = () => {
    const pages = [];
    const delta = 1; // number of pages to show on each side of current
    const left = currentPage - delta;
    const right = currentPage + delta + 1;
    let last = 0;

    for (let i = 1; i <= safeTotalPages; i++) {
      if (i === 1 || i === safeTotalPages || (i >= left && i < right)) {
        if (last && i - last === 2) {
          pages.push(last + 1);
        } else if (last && i - last !== 1) {
          pages.push('...');
        }
        pages.push(i);
        last = i;
      }
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`admin-pagination-bar ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '14px 16px',
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        borderBottomLeftRadius: '12px',
        borderBottomRightRadius: '12px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Left: Record Range & Page Size Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
          Showing <strong style={{ color: '#0f172a', fontWeight: 600 }}>{startRecord}</strong>–<strong style={{ color: '#0f172a', fontWeight: 600 }}>{endRecord}</strong> of <strong style={{ color: '#0f172a', fontWeight: 600 }}>{totalItems}</strong> records
        </span>

        {onLimitChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label htmlFor="records-per-page-select" style={{ fontSize: '12px', color: '#64748b' }}>
              Rows per page:
            </label>
            <select
              id="records-per-page-select"
              value={itemsPerPage}
              onChange={(e) => {
                const newLimit = parseInt(e.target.value, 10);
                if (onLimitChange) onLimitChange(newLimit);
              }}
              disabled={disabled}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1.5px solid #cbd5e1',
                background: '#f8fafc',
                cursor: disabled ? 'not-allowed' : 'pointer',
                outline: 'none',
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* First Page (<<) */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={disabled || currentPage <= 1}
          title="First Page"
          aria-label="First Page"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: currentPage <= 1 ? '#cbd5e1' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || currentPage <= 1 ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous Page (<) */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disabled || currentPage <= 1}
          title="Previous Page"
          aria-label="Previous Page"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: currentPage <= 1 ? '#cbd5e1' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || currentPage <= 1 ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Numbered Page Buttons */}
        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span
                key={`ellipsis-${idx}`}
                style={{
                  width: '30px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '13px',
                  fontWeight: 600,
                  userSelect: 'none',
                }}
              >
                …
              </span>
            );
          }

          const isActive = p === currentPage;
          return (
            <button
              key={`page-${p}`}
              type="button"
              onClick={() => onPageChange(p)}
              disabled={disabled || isActive}
              aria-current={isActive ? 'page' : undefined}
              style={{
                minWidth: '32px',
                height: '32px',
                padding: '0 6px',
                borderRadius: '6px',
                border: isActive ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                background: isActive ? '#16a34a' : '#ffffff',
                color: isActive ? '#ffffff' : '#334155',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled || isActive ? 'default' : 'pointer',
                transition: 'all 150ms ease',
                boxShadow: isActive ? '0 2px 4px rgba(22, 163, 74, 0.25)' : 'none',
              }}
            >
              {p}
            </button>
          );
        })}

        {/* Next Page (>) */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disabled || currentPage >= safeTotalPages}
          title="Next Page"
          aria-label="Next Page"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: currentPage >= safeTotalPages ? '#cbd5e1' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || currentPage >= safeTotalPages ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronRight size={16} />
        </button>

        {/* Last Page (>>) */}
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={disabled || currentPage >= safeTotalPages}
          title="Last Page"
          aria-label="Last Page"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: currentPage >= safeTotalPages ? '#cbd5e1' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || currentPage >= safeTotalPages ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
