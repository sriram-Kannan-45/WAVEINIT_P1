import React, { useState, useEffect } from 'react'
import { assetUrl } from '../../api/api'

/**
 * Returns the first 2 letters of a person's name in uppercase.
 * Multi-word: First letter of first word + First letter of last word (e.g. John David -> JD, Arun Kumar -> AK)
 * Single-word: First 2 letters (e.g. Sriram -> SR, John -> JO)
 */
export function getTwoLetterInitials(name) {
  if (!name || typeof name !== 'string') return 'UN'
  const clean = name.trim().replace(/^[^a-zA-Z0-9\s]+/, '')
  if (!clean) return 'UN'
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    const first = words[0][0] || ''
    const last = words[words.length - 1][0] || ''
    if (first && last) return (first + last).toUpperCase()
  }
  if (clean.length === 1) return (clean + clean).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/**
 * Universal UserAvatar Component.
 *
 * Renders actual participant profile image when available.
 * Automatically falls back to a clean, circular initials-based avatar
 * when image is missing or fails to load.
 *
 * @param {Object} props
 * @param {string} [props.src] - Image path or full URL
 * @param {string} [props.avatar] - Alias for src
 * @param {string} [props.profilePic] - Alias for src
 * @param {string} [props.profileImage] - Alias for src
 * @param {string} [props.image] - Alias for src
 * @param {string} [props.name] - User name for initials and alt text
 * @param {number} [props.size=32] - Avatar width & height in px
 * @param {number} [props.fontSize] - Font size in px for fallback initials
 * @param {number} [props.rank] - Optional rank number (1, 2, 3...)
 * @param {boolean} [props.showRankBadge=false] - Whether to render rank number pill
 * @param {string} [props.className] - Extra class name
 * @param {Object} [props.style] - Extra inline styles
 * @param {string} [props.title] - Hover tooltip
 */
export default function UserAvatar({
  src,
  avatar,
  profilePic,
  profileImage,
  image,
  name = '',
  size = 32,
  fontSize,
  rank,
  showRankBadge = false,
  className = '',
  style = {},
  title,
}) {
  const rawPath = src || avatar || profilePic || profileImage || image
  const resolvedUrl = rawPath ? assetUrl(rawPath) : ''

  const [loaded, setLoaded] = useState(false)
  const [hasError, setHasError] = useState(!resolvedUrl)

  useEffect(() => {
    if (!resolvedUrl) {
      setHasError(true)
      setLoaded(false)
    } else {
      setHasError(false)
      setLoaded(false)
    }
  }, [resolvedUrl])

  const initials = getTwoLetterInitials(name)
  const computedFontSize = fontSize || Math.max(10, Math.round(size * 0.38))

  // Rank-based styling for podium highlights
  const getRankBorder = () => {
    if (rank === 1) return '2.5px solid #F59E0B'
    if (rank === 2) return '2px solid #94A3B8'
    if (rank === 3) return '2px solid #EA580C'
    return '1.5px solid #16A34A'
  }

  const getRankShadow = () => {
    if (rank === 1) return '0 4px 14px rgba(245, 158, 11, 0.25)'
    if (rank === 2) return '0 3px 10px rgba(148, 163, 184, 0.2)'
    if (rank === 3) return '0 3px 10px rgba(234, 88, 12, 0.2)'
    return '0 1px 3px rgba(0, 0, 0, 0.04)'
  }

  const getFallbackTheme = () => {
    if (rank === 1) return { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', text: '#B45309', border: '#F59E0B' }
    if (rank === 2) return { bg: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)', text: '#475569', border: '#94A3B8' }
    if (rank === 3) return { bg: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)', text: '#9A3412', border: '#EA580C' }
    return { bg: '#FFFFFF', text: '#16A34A', border: '#16A34A' }
  }

  const fallbackTheme = getFallbackTheme()

  return (
    <div
      className={`user-avatar-root user-green-avatar ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style,
      }}
      title={title || name || ''}
    >
      {/* Loading Shimmer Placeholder while image is downloading */}
      {resolvedUrl && !hasError && !loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)',
            backgroundSize: '200% 100%',
            animation: 'avatarShimmer 1.5s infinite',
            zIndex: 1,
          }}
        />
      )}

      {/* Actual Profile Photo */}
      {resolvedUrl && !hasError ? (
        <img
          src={resolvedUrl}
          alt={name ? `${name}'s profile photo` : 'Participant profile photo'}
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: loaded ? 'block' : 'none',
            border: getRankBorder(),
            boxShadow: getRankShadow(),
            boxSizing: 'border-box',
          }}
        />
      ) : null}

      {/* Fallback Initials Avatar (when no image or image failed to load) */}
      {(!resolvedUrl || hasError) && (
        <div
          className="user-avatar-initials"
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: fallbackTheme.bg,
            border: `1.5px solid ${fallbackTheme.border}`,
            color: fallbackTheme.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: computedFontSize,
            fontWeight: 700,
            lineHeight: 1,
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            boxShadow: getRankShadow(),
            boxSizing: 'border-box',
          }}
        >
          {initials}
        </div>
      )}

      {/* Optional Rank Badge Attached to Avatar */}
      {showRankBadge && rank != null && (
        <span
          style={{
            position: 'absolute',
            bottom: -3,
            right: -3,
            background: rank === 1 ? '#F59E0B' : rank === 2 ? '#64748B' : rank === 3 ? '#EA580C' : '#16A34A',
            color: '#FFFFFF',
            border: '2px solid #FFFFFF',
            borderRadius: 9999,
            minWidth: Math.max(16, Math.round(size * 0.34)),
            height: Math.max(16, Math.round(size * 0.34)),
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(9, Math.round(size * 0.18)),
            fontWeight: 800,
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            zIndex: 2,
          }}
        >
          #{rank}
        </span>
      )}
    </div>
  )
}
