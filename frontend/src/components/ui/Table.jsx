import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'

export default function Table({
  columns = [],
  data = [],
  onRowClick,
  emptyMessage = 'No data available',
  onSort,
}) {
  const [sortKey, setSortKey] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')

  const handleSort = (key) => {
    if (!onSort) return
    const order = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortOrder(order)
    onSort(key, order)
  }

  return (
    <div className="enterprise-table-wrapper">
      <table className="enterprise-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                style={{
                  cursor: col.sortable ? 'pointer' : 'default',
                  ...(col.className ? { className: col.className } : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{col.header}</span>
                  {col.sortable && (
                    <span style={{ color: 'var(--neutral-400)' }}>
                      {sortKey !== col.key ? (
                        <ArrowUpDown size={12} />
                      ) : sortOrder === 'asc' ? (
                        <ArrowUp size={12} style={{ color: 'var(--brand-admin)' }} />
                      ) : (
                        <ArrowDown size={12} style={{ color: 'var(--brand-admin)' }} />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--neutral-400)', fontSize: '14px' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={row.id || rowIdx}
                onClick={() => onRowClick && onRowClick(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className || ''}>
                    {col.render ? col.render(row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
