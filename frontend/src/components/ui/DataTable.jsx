import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { colors, radius, typography, spacing, transitions } from '../../theme/tokens'
import Pagination from './Pagination'

export default function DataTable({
  columns = [],
  data = [],
  onRowClick,
  emptyMessage = 'No data available',
  onSort,
  searchPlaceholder = 'Search...',
  filterOptions = [],
  onFilterChange,
  filterLabel = 'Filter',
  itemsPerPage = 10,
  className = '',
  actions,
}) {
  const [sortKey, setSortKey] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)

  const handleSort = (key) => {
    if (!onSort) return
    const order = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortOrder(order)
    onSort(key, order)
  }

  const filteredData = useMemo(() => {
    let result = data
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((row) =>
        columns.some((col) => {
          const val = row[col.key]
          return val != null && String(val).toLowerCase().includes(q)
        })
      )
    }
    if (onFilterChange && filterOptions.length > 0 && activeFilter !== 'ALL') {
      result = result.filter((row) => row[filterOptions.find((f) => f.value === activeFilter)?.key] === activeFilter)
    }
    return result
  }, [data, search, activeFilter, columns, onFilterChange, filterOptions])

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const pageData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  return (
    <div className={`enterprise-table-wrapper ${className}`}>
      {(searchPlaceholder || filterOptions.length > 0 || actions) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing[3],
          padding: `${spacing[3]} ${spacing[5]}`,
          borderBottom: `1px solid ${colors.border.light}`,
          flexWrap: 'wrap',
        }}>
          {searchPlaceholder && (
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              style={{
                width: '100%',
                maxWidth: 280,
                padding: '8px 12px',
                borderRadius: radius.md,
                border: `1px solid ${colors.border.default}`,
                background: colors.surface.secondary,
                color: colors.text.primary,
                fontSize: '0.8125rem',
                fontFamily: typography.fontFamily,
                outline: 'none',
              }}
            />
          )}
          {filterOptions.length > 0 && (
            <div style={{ display: 'flex', gap: spacing[1] }}>
              {filterOptions.map((opt) => {
                const isActive = activeFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => { setActiveFilter(opt.value); setCurrentPage(1) }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: radius.full,
                      border: 'none',
                      background: isActive ? colors.primary[600] : colors.surface.secondary,
                      color: isActive ? colors.text.inverse : colors.text.muted,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      fontFamily: typography.fontFamily,
                      cursor: 'pointer',
                      transition: `all ${transitions.fast}`,
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
          {actions && <div style={{ marginLeft: 'auto' }}>{actions}</div>}
        </div>
      )}
      <table className="enterprise-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                style={{
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: 'none',
                  ...(col.className ? {} : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{col.header}</span>
                  {col.sortable && (
                    <span style={{ color: colors.text.muted }}>
                      {sortKey !== col.key ? (
                        <ArrowUpDown size={12} />
                      ) : sortOrder === 'asc' ? (
                        <ArrowUp size={12} style={{ color: colors.primary[600] }} />
                      ) : (
                        <ArrowDown size={12} style={{ color: colors.primary[600] }} />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                textAlign: 'center',
                padding: `${spacing[8]} ${spacing[4]}`,
                color: colors.text.muted,
                fontSize: '0.875rem',
              }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            pageData.map((row, rowIdx) => (
              <tr
                key={row.id || rowIdx}
                onClick={() => onRowClick && onRowClick(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{
                    ...(col.className ? {} : {}),
                  }}>
                    {col.render ? col.render(row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ padding: `${spacing[3]} ${spacing[5]}` }}>
          <Pagination
            totalItems={filteredData.length}
            itemsPerPage={itemsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  )
}