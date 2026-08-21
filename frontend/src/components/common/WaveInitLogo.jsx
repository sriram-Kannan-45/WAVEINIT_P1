import React from 'react'

export function WaveInitLogoIcon({ size = 26, color = '#16A34A' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Open Book Outline */}
      <path
        d="M 50 26 C 36 15 20 15 16 17 C 14 18 14 20 14 24 L 14 70 C 14 73 16 75 19 75 C 27 75 40 79 50 86 C 60 79 73 75 81 75 C 84 75 86 73 86 70 L 86 24 C 86 20 86 18 84 17 C 80 15 64 15 50 26 Z"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center Spine */}
      <path
        d="M 50 26 L 50 86"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left Bottom Underline */}
      <path
        d="M 21 82.5 C 27 82.5 35 83.5 39 84"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Right Bottom Underline */}
      <path
        d="M 61 84 C 65 83.5 73 82.5 79 82.5"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function WaveInitLogo({ size = 26, color = '#16A34A', subtitle = 'Portal' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: '#EAF8F0',
          border: '1px solid rgba(22, 163, 74, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <WaveInitLogoIcon size={size} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          WAVE INIT LMS
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, fontWeight: 500, color: '#64748B', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
