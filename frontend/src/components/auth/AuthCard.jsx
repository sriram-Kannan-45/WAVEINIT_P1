import { motion } from 'framer-motion';

export default function AuthCard({ children, className = '' }) {
  return (
    <div className="auth-layout--right">
      {/* Decorative Right Contour Wave Lines */}
      <svg className="auth-right-curves" viewBox="0 0 500 800" fill="none" preserveAspectRatio="none" aria-hidden="true">
        <path d="M500,100 C300,250 250,550 500,750" stroke="rgba(18, 124, 52, 0.08)" strokeWidth="1.5" />
        <path d="M500,140 C330,280 280,520 500,700" stroke="rgba(18, 124, 52, 0.07)" strokeWidth="1.5" />
        <path d="M500,180 C360,310 310,490 500,650" stroke="rgba(18, 124, 52, 0.06)" strokeWidth="1.5" />
      </svg>

      {/* Decorative Right Dot Grid */}
      <div className="auth-dot-grid auth-dot-grid--right" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="auth-dot" />
        ))}
      </div>

      <motion.div
        className={`auth-card ${className}`.trim()}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
