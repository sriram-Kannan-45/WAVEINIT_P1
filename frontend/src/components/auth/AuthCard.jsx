import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1]

export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="wl-auth-form">
      <motion.div
        className="wl-auth-formcard"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.75, delay: 0.15, ease }}
      >
        <div className="wl-auth-formcard-head">
          <div className="wl-auth-formcard-logo">
            <div className="wl-auth-formcard-logo-mark">
              <BookOpen size={18} color="#fff" />
            </div>
            <span className="wl-auth-formcard-logo-text">Wave Init</span>
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {children}
        {footer && <div className="wl-auth-foot">{footer}</div>}
      </motion.div>
    </div>
  )
}
