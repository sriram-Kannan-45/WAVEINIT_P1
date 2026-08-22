import React from 'react'

/**
 * Returns the first 2 letters of a person's name in uppercase.
 * Rules:
 * - Uses the first 2 letters of the person's name.
 * - Converts them to uppercase.
 * Examples:
 *   Sriram → SR
 *   Arun → AR
 *   Arun Kumar → AR
 *   Mylambikai → MY
 *   Shamiha → SH
 *   John → JO
 */
export function getTwoLetterInitials(name) {
  if (!name || typeof name !== 'string') return 'UN'
  const clean = name.trim().replace(/^[^a-zA-Z0-9]+/, '')
  if (!clean) return 'UN'
  if (clean.length === 1) return (clean + clean).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

export default function UserAvatar({
  name,
  size = 32,
  fontSize = 11,
  className = '',
  style = {}
}) {
  const initials = getTwoLetterInitials(name)

  return (
    <div
      className={`user-green-avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#FFFFFF',
        border: '1.5px solid #16A34A',
        color: '#16A34A',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize || Math.max(10, Math.round(size * 0.38)),
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      title={name || ''}
    >
      {initials}
    </div>
  )
}
