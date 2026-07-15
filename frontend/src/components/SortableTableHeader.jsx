import React from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

/**
 * SortableTableHeader - A premium sortable table header cell
 * 
 * @param {string} children - Header label
 * @param {string} sortKey - Key to sort by
 * @param {string} currentSort - Current sort key
 * @param {string} sortDirection - Current sort direction ('asc' or 'desc')
 * @param {function} onSort - Sort callback
 * @param {boolean} numeric - Whether the column contains numeric data
 * @param {string} className - Additional CSS classes
 */
const SortableTableHeader = ({
  children,
  sortKey,
  currentSort,
  sortDirection,
  onSort,
  numeric = false,
  className = ''
}) => {
  const isActive = currentSort === sortKey
  
  const handleClick = () => {
    if (onSort) {
      onSort(sortKey)
    }
  }

  const getIcon = () => {
    if (!isActive) {
      return <ArrowUpDown size={12} className="sort-icon-inactive" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp size={12} className="sort-icon-active" />
    }
    return <ArrowDown size={12} className="sort-icon-active" />
  }

  if (!sortKey || !onSort) {
    return (
      <th className={className} style={{ textAlign: numeric ? 'right' : 'left' }}>
        {children}
      </th>
    )
  }

  return (
    <th 
      className={`sortable ${isActive ? sortDirection : ''} ${className}`}
      onClick={handleClick}
      style={{ textAlign: numeric ? 'right' : 'left', cursor: 'pointer' }}
      role="columnheader"
      aria-sort={isActive ? sortDirection : 'none'}
      aria-label={`${children}, sortable column`}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {getIcon()}
      </span>
    </th>
  )
}

/**
 * SortIcon - A standalone sort icon component
 */
const SortIcon = ({ active, direction, size = 12 }) => {
  if (!active) {
    return <ArrowUpDown size={size} style={{ opacity: 0.4 }} />
  }
  if (direction === 'asc') {
    return <ArrowUp size={size} />
  }
  return <ArrowDown size={size} />
}

export { SortIcon }
export default SortableTableHeader