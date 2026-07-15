import { motion } from 'framer-motion'
import { BarChart3, User } from 'lucide-react'
import { colors } from '../../theme/tokens'

export default function HeroBanner({ name, subtitle, onViewReports, onViewProfile }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        height: 100, // Reduced from 160px by ~40%
        background: `linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #7c3aed 100%)`, // Premium gradient
        borderRadius: 20, // 20px border radius
        padding: '0 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#fff',
        marginBottom: 24, // 8px grid aligned
        boxShadow: '0 10px 25px -5px rgba(37,99,235,0.15), 0 8px 10px -6px rgba(124,58,237,0.1)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
      className="flex-row gap-4"
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2, fontFamily: "'Inter', sans-serif" }}>
          Welcome back, {name} 👋
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '4px 0 0', fontFamily: "'Inter', sans-serif" }}>
            {subtitle}
          </p>
        )}
      </div>
      
      {(onViewReports || onViewProfile) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {onViewReports && (
            <button
              onClick={onViewReports}
              style={{
                height: 38,
                padding: '0 16px',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 200ms ease',
                backdropFilter: 'blur(4px)',
                fontFamily: "'Inter', sans-serif",
              }}
              className="hover:bg-white hover:text-[#1e3a8a] hover:scale-102"
            >
              <BarChart3 size={15} /> View Reports
            </button>
          )}
          {onViewProfile && (
            <button
              onClick={onViewProfile}
              style={{
                height: 38,
                padding: '0 16px',
                background: '#fff',
                color: '#1e3a8a',
                border: 'none',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 200ms ease',
                fontFamily: "'Inter', sans-serif",
              }}
              className="hover:bg-slate-50 hover:shadow-md hover:scale-102"
            >
              <User size={15} /> View Profile
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

