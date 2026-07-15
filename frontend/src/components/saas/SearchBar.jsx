import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { colors } from '../../theme/tokens'

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search…',
  width = 500,
  height = 48,
  radius = 14,
  ariaLabel = 'Search',
}) {
  return (
    <div className="relative" style={{ width: '100%', maxWidth: width }}>
      <Search
        size={18}
        style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          pointerEvents: 'none',
          zIndex: 10
        }}
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          height,
          borderRadius: radius,
          paddingLeft: '44px',
          paddingRight: '16px',
          fontFamily: "'Inter', sans-serif",
          boxSizing: 'border-box'
        }}
        className="w-full bg-white border border-slate-200 text-sm shadow-sm outline-none transition-all focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
      />
    </div>
  )
}
