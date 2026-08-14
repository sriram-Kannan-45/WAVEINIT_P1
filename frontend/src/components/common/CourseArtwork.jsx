import React from 'react'

/**
 * Universal Course Artwork Component
 * Handles Python, React, JS, TS, Java, Node, AI/ML, Cloud, DevOps, Database,
 * and ANY arbitrary future course title with deterministic rich vector graphics.
 */

// Simple deterministic hash to pick gradients for arbitrary course titles
function hashString(str = '') {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const FALLBACK_PALETTES = [
  { bg: '#0A1128', g1: '#1E1B4B', g2: '#312E81', accent: '#818CF8', secondary: '#C7D2FE', label: 'LMS' },
  { bg: '#06201B', g1: '#064E3B', g2: '#047857', accent: '#34D399', secondary: '#A7F3D0', label: 'DEV' },
  { bg: '#1C1917', g1: '#44403C', g2: '#292524', accent: '#F59E0B', secondary: '#FDE68A', label: 'TECH' },
  { bg: '#172554', g1: '#1E40AF', g2: '#1D4ED8', accent: '#38BDF8', secondary: '#93C5FD', label: 'CLOUD' },
  { bg: '#2E1065', g1: '#581C87', g2: '#7E22CE', accent: '#C084FC', secondary: '#E9D5FF', label: 'CORE' },
  { bg: '#1E1B4B', g1: '#4338CA', g2: '#3730A3', accent: '#6366F1', secondary: '#A5B4FC', label: 'PRO' },
  { bg: '#18181B', g1: '#3F3F46', g2: '#27272A', accent: '#10B981', secondary: '#6EE7B7', label: 'CODE' },
]

export default function CourseArtwork({ title = '', category = '', className = '', style = {} }) {
  const norm = `${title} ${category}`.toLowerCase()

  // 1. PYTHON
  if (norm.includes('python') || norm.includes('django') || norm.includes('flask') || norm.includes('py ')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <linearGradient id="py-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="50%" stopColor="#1C2541" />
            <stop offset="100%" stopColor="#0A1128" />
          </linearGradient>
          <linearGradient id="py-blue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4B8BBE" />
            <stop offset="100%" stopColor="#306998" />
          </linearGradient>
          <linearGradient id="py-yellow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD43B" />
            <stop offset="100%" stopColor="#FFE873" />
          </linearGradient>
          <radialGradient id="py-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4B8BBE" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0B132B" stopOpacity="0" />
          </radialGradient>
          <filter id="py-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="160" height="100" fill="url(#py-bg)" rx="8" />
        <rect width="160" height="100" fill="url(#py-glow)" rx="8" />

        {/* Ambient Grid / Code lines */}
        <line x1="20" y1="20" x2="140" y2="20" stroke="#306998" strokeWidth="0.5" opacity="0.2" />
        <line x1="20" y1="80" x2="140" y2="80" stroke="#306998" strokeWidth="0.5" opacity="0.2" />
        <circle cx="80" cy="50" r="38" fill="none" stroke="#FFD43B" strokeWidth="0.7" opacity="0.15" strokeDasharray="3 3" />
        
        {/* Python Top Snake (Blue) */}
        <g transform="translate(62, 32)">
          <path
            d="M 17.5 0 C 8.2 0 8.7 4 8.7 4 L 8.7 8.2 L 17.8 8.2 L 17.8 9.5 L 4.4 9.5 C 4.4 9.5 0 9 0 18.2 C 0 27.4 3.8 26.9 3.8 26.9 L 6.4 26.9 L 6.4 23.1 C 6.4 23.1 6.3 18.5 10.9 18.5 L 20 18.5 C 20 18.5 24.3 18.6 24.3 14.3 L 24.3 4.2 C 24.3 4.2 24.7 0 17.5 0 Z"
            fill="url(#py-blue)"
            filter="url(#py-blur)"
          />
          <circle cx="12.5" cy="4" r="1.5" fill="#FFFFFF" opacity="0.9" />
        </g>

        {/* Python Bottom Snake (Yellow) */}
        <g transform="translate(62, 32)">
          <path
            d="M 18.5 36 C 27.8 36 27.3 32 27.3 32 L 27.3 27.8 L 18.2 27.8 L 18.2 26.5 L 31.6 26.5 C 31.6 26.5 36 27 36 17.8 C 36 8.6 32.2 9.1 32.2 9.1 L 29.6 9.1 L 29.6 12.9 C 29.6 12.9 29.7 17.5 25.1 17.5 L 16 17.5 C 16 17.5 11.7 17.4 11.7 21.7 L 11.7 31.8 C 11.7 31.8 11.3 36 18.5 36 Z"
            fill="url(#py-yellow)"
            filter="url(#py-blur)"
          />
          <circle cx="23.5" cy="32" r="1.5" fill="#0A1128" opacity="0.9" />
        </g>

        {/* Floating tech badges */}
        <g opacity="0.7">
          <text x="80" y="88" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="700" letterSpacing="0.1em">PYTHON 3</text>
        </g>
      </svg>
    )
  }

  // 2. REACT
  if (norm.includes('react')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="rc-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D8FF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0A1128" stopOpacity="0" />
          </radialGradient>
          <filter id="rc-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="160" height="100" fill="#0A1128" rx="8" />
        <rect width="160" height="100" fill="url(#rc-glow)" rx="8" />
        <g transform="translate(80, 50)" filter="url(#rc-blur)">
          <ellipse cx="0" cy="0" rx="36" ry="13" fill="none" stroke="#00D8FF" strokeWidth="1.6" opacity="0.9" />
          <ellipse cx="0" cy="0" rx="36" ry="13" fill="none" stroke="#00D8FF" strokeWidth="1.6" opacity="0.9" transform="rotate(60)" />
          <ellipse cx="0" cy="0" rx="36" ry="13" fill="none" stroke="#00D8FF" strokeWidth="1.6" opacity="0.9" transform="rotate(120)" />
          <circle cx="0" cy="0" r="5.5" fill="#00D8FF" opacity="0.95" />
          <circle cx="0" cy="0" r="2.5" fill="#FFFFFF" />
        </g>
        <text x="80" y="88" textAnchor="middle" fill="#38BDF8" fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.7">REACT</text>
      </svg>
    )
  }

  // 3. JAVASCRIPT / TYPESCRIPT / NODE
  if (norm.includes('javascript') || norm.includes(' js') || norm.includes('typescript') || norm.includes('node') || norm.includes('express')) {
    const isTS = norm.includes('typescript') || norm.includes('ts')
    const isNode = norm.includes('node') || norm.includes('express')
    const badgeBg = isTS ? '#3178C6' : isNode ? '#68A063' : '#F7DF1E'
    const badgeText = isTS ? '#FFFFFF' : isNode ? '#FFFFFF' : '#000000'
    const tag = isTS ? 'TS' : isNode ? 'NODE' : 'JS'
    const sub = isTS ? 'TYPESCRIPT' : isNode ? 'NODE.JS' : 'JAVASCRIPT'

    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="js-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={badgeBg} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0B0F19" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill="#0B0F19" rx="8" />
        <rect width="160" height="100" fill="url(#js-glow)" rx="8" />
        
        {/* Hexagon / Square Badge */}
        {isNode ? (
          <polygon points="80,24 106,39 106,69 80,84 54,69 54,39" fill="none" stroke="#68A063" strokeWidth="2.5" opacity="0.85" />
        ) : (
          <rect x="58" y="28" width="44" height="44" rx="8" fill={badgeBg} />
        )}
        
        <text x="80" y={isNode ? "59" : "60"} textAnchor="middle" fill={badgeText} fontSize={isNode ? "16" : "22"} fontWeight="900" fontFamily="sans-serif">
          {tag}
        </text>
        <text x="80" y="88" textAnchor="middle" fill={badgeBg} fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.85">
          {sub}
        </text>
      </svg>
    )
  }

  // 4. JAVA / SPRING
  if (norm.includes('java') || norm.includes('spring') || norm.includes('springboot')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="jv-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill="#0F172A" rx="8" />
        <rect width="160" height="100" fill="url(#jv-glow)" rx="8" />
        
        {/* Steaming Coffee Cup */}
        <g transform="translate(68, 30)">
          <path d="M4 22 C4 32 20 32 20 22 Z" fill="#F97316" opacity="0.8" />
          <path d="M20 23 Q25 23 25 26 Q25 29 20 29" fill="none" stroke="#F97316" strokeWidth="2" />
          <path d="M7 16 Q9 12 7 8" fill="none" stroke="#FDBA74" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M12 16 Q14 10 12 6" fill="none" stroke="#FDBA74" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M17 16 Q19 12 17 8" fill="none" stroke="#FDBA74" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <ellipse cx="12" cy="22" rx="8" ry="2" fill="#7C2D12" />
        </g>
        <text x="80" y="88" textAnchor="middle" fill="#FB923C" fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.85">JAVA</text>
      </svg>
    )
  }

  // 5. DATA SCIENCE / AI / MACHINE LEARNING
  if (norm.includes('ai') || norm.includes('data') || norm.includes('machine learning') || norm.includes('deep learning') || norm.includes('neural')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="ai-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0B0F19" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill="#0B0F19" rx="8" />
        <rect width="160" height="100" fill="url(#ai-glow)" rx="8" />
        
        {/* Neural Network Graph */}
        <g transform="translate(52, 28)">
          <line x1="10" y1="12" x2="30" y2="8" stroke="#C084FC" strokeWidth="1" opacity="0.6" />
          <line x1="10" y1="12" x2="30" y2="24" stroke="#C084FC" strokeWidth="1" opacity="0.6" />
          <line x1="10" y1="28" x2="30" y2="24" stroke="#C084FC" strokeWidth="1" opacity="0.6" />
          <line x1="10" y1="28" x2="30" y2="38" stroke="#C084FC" strokeWidth="1" opacity="0.6" />
          
          <line x1="30" y1="8" x2="48" y2="18" stroke="#A855F7" strokeWidth="1.2" opacity="0.8" />
          <line x1="30" y1="24" x2="48" y2="18" stroke="#A855F7" strokeWidth="1.2" opacity="0.8" />
          <line x1="30" y1="38" x2="48" y2="18" stroke="#A855F7" strokeWidth="1.2" opacity="0.8" />

          <circle cx="10" cy="12" r="3.5" fill="#C084FC" />
          <circle cx="10" cy="28" r="3.5" fill="#C084FC" />
          <circle cx="30" cy="8" r="4" fill="#E9D5FF" />
          <circle cx="30" cy="24" r="4" fill="#E9D5FF" />
          <circle cx="30" cy="38" r="4" fill="#E9D5FF" />
          <circle cx="48" cy="18" r="5" fill="#A855F7" />
          <circle cx="48" cy="18" r="2.5" fill="#FFFFFF" />
        </g>
        <text x="80" y="88" textAnchor="middle" fill="#C084FC" fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.85">AI &amp; DATA</text>
      </svg>
    )
  }

  // 6. SQL / DATABASE / MONGO
  if (norm.includes('sql') || norm.includes('database') || norm.includes('mongo') || norm.includes('postgres') || norm.includes('db')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="db-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill="#0F172A" rx="8" />
        <rect width="160" height="100" fill="url(#db-glow)" rx="8" />
        
        {/* Database Cylinders */}
        <g transform="translate(62, 26)">
          <ellipse cx="18" cy="8" rx="18" ry="6" fill="#0891B2" opacity="0.9" />
          <path d="M0 8 L0 20 C0 24 36 24 36 20 L36 8" fill="none" stroke="#22D3EE" strokeWidth="1.5" />
          <path d="M0 20 L0 32 C0 36 36 36 36 32 L36 20" fill="none" stroke="#22D3EE" strokeWidth="1.5" />
          <ellipse cx="18" cy="8" rx="18" ry="6" fill="none" stroke="#67E8F9" strokeWidth="1.5" />
        </g>
        <text x="80" y="88" textAnchor="middle" fill="#22D3EE" fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.85">DATABASE</text>
      </svg>
    )
  }

  // 7. CLOUD / DEVOPS / DOCKER / AWS
  if (norm.includes('cloud') || norm.includes('aws') || norm.includes('azure') || norm.includes('docker') || norm.includes('devops') || norm.includes('k8s')) {
    return (
      <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
        <defs>
          <radialGradient id="cld-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0B132B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill="#0B132B" rx="8" />
        <rect width="160" height="100" fill="url(#cld-glow)" rx="8" />
        
        {/* Cloud Graphic */}
        <g transform="translate(60, 32)">
          <path
            d="M8 24 A8 8 0 0 1 18 12 A14 14 0 0 1 36 14 A10 10 0 0 1 42 24 Z"
            fill="#1D4ED8"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.9"
          />
          <circle cx="25" cy="20" r="2.5" fill="#93C5FD" />
        </g>
        <text x="80" y="88" textAnchor="middle" fill="#60A5FA" fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.85">CLOUD &amp; DEVOPS</text>
      </svg>
    )
  }

  // 8. UNIVERSAL FALLBACK FOR ANY FUTURE COURSE (Deterministic Sleek SaaS Artwork)
  const paletteIndex = hashString(title || category || 'course') % FALLBACK_PALETTES.length
  const pal = FALLBACK_PALETTES[paletteIndex]
  
  // Extract up to 2 uppercase letters for monogram or default to first chars
  const words = (title || category || 'LMS').trim().split(/\s+/)
  const initials = words.length >= 2 
    ? `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
    : (title || 'CR').slice(0, 2).toUpperCase()

  const displayTag = (category || words[0] || 'TRAINING').slice(0, 14).toUpperCase()

  return (
    <svg viewBox="0 0 160 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', ...style }} className={className}>
      <defs>
        <linearGradient id={`dyn-bg-${paletteIndex}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={pal.bg} />
          <stop offset="50%" stopColor={pal.g1} />
          <stop offset="100%" stopColor={pal.g2} />
        </linearGradient>
        <radialGradient id={`dyn-glow-${paletteIndex}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={pal.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={pal.bg} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#dyn-bg-${paletteIndex})`} rx="8" />
      <rect width="160" height="100" fill={`url(#dyn-glow-${paletteIndex})`} rx="8" />

      {/* Modern Concentric Tech Ring */}
      <circle cx="80" cy="46" r="28" fill="none" stroke={pal.accent} strokeWidth="1" opacity="0.25" strokeDasharray="4 2" />
      <circle cx="80" cy="46" r="22" fill={pal.bg} stroke={pal.accent} strokeWidth="1.5" opacity="0.9" />

      {/* Monogram / Icon text */}
      <text x="80" y="52" textAnchor="middle" fill={pal.accent} fontSize="14" fontWeight="800" fontFamily="sans-serif">
        {initials}
      </text>

      {/* Bottom Category Tag */}
      <text x="80" y="88" textAnchor="middle" fill={pal.secondary} fontSize="8" fontWeight="700" letterSpacing="0.1em" opacity="0.8">
        {displayTag}
      </text>
    </svg>
  )
}
