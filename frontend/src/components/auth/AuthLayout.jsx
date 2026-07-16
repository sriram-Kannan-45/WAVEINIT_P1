import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1]

const FEATURES = [
  { icon: Brain, label: 'AI Powered' },
  { icon: ClipboardCheck, label: 'Live Assessments' },
  { icon: Code, label: 'Coding Platform' },
  { icon: ShieldCheck, label: 'Enterprise Security' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Award, label: 'Certifications' },
]

import { Brain, ClipboardCheck, Code, ShieldCheck, BarChart3, Award } from 'lucide-react'

export default function AuthLayout({ heading, subtitle, description, children, features, cards }) {
  return (
    <div className="wl-auth-panel">
      <div className="wl-auth-dots" />
      <div className="wl-auth-mesh" />
      <div className="wl-auth-grid" />
      <div className="wl-auth-orb wl-auth-orb--1" />
      <div className="wl-auth-orb wl-auth-orb--2" />
      <div className="wl-auth-orb wl-auth-orb--3" />
      <div className="wl-auth-geo wl-auth-geo--1" />
      <div className="wl-auth-geo wl-auth-geo--2" />
      <div className="wl-auth-geo wl-auth-geo--3" />
      <div className="wl-auth-geo wl-auth-geo--4" />

      <svg className="wl-auth-wave" viewBox="0 0 1400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,100 C200,40 400,160 700,80 C1000,0 1200,140 1400,60" fill="none" stroke="rgba(22,163,74,0.04)" strokeWidth="1.5"/>
        <path d="M0,130 C250,70 450,180 750,100 C1050,20 1250,160 1400,90" fill="none" stroke="rgba(22,163,74,0.03)" strokeWidth="1"/>
        <path d="M0,160 C300,100 500,190 800,120 C1100,50 1300,170 1400,110" fill="none" stroke="rgba(22,163,74,0.025)" strokeWidth="1"/>
      </svg>

      <motion.div className="wl-auth-left-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease }}>
        <motion.div className="wl-auth-top" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease }}>
          <div className="wl-auth-logo">
            <div className="wl-auth-logo-mark">
              <BookOpen size={16} color="#fff" />
            </div>
            <span className="wl-auth-logo-text">Wave Init</span>
          </div>
          <span className="wl-auth-badge">Enterprise Learning Platform</span>
        </motion.div>

        <motion.div className="wl-auth-heading-wrap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease }}>
          {heading}
          {subtitle}
        </motion.div>

        {description && (
          <motion.p className="wl-auth-desc" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35, ease }}>
            {description}
          </motion.p>
        )}

        {features && (
          <motion.div className="wl-auth-chips" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45, ease }}>
            {features.map((f, i) => {
              const Icon = f.icon
              return <span key={i} className="wl-auth-chip"><Icon size={14} />{f.label}</span>
            })}
          </motion.div>
        )}

        {cards && (
          <motion.div className="wl-auth-cards" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.55, ease }}>
            {cards.map((c, i) => {
              const Icon = c.icon
              return (
                <motion.div key={i} className="wl-auth-card"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.6 + i * 0.06, ease }}>
                  <div className="wl-auth-card-icon"><Icon size={22} /></div>
                  <h3 className="wl-auth-card-title">{c.title}</h3>
                  <p className="wl-auth-card-desc">{c.desc}</p>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {children}
      </motion.div>

      <motion.div className="wl-auth-bottom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.8, ease }}>
        <span className="wl-auth-copyright">&copy; 2026 Wave Init</span>
        <div className="wl-auth-services">
          <span>AI Software Development</span>
          <span className="wl-auth-svc-dot" />
          <span>Web Development</span>
          <span className="wl-auth-svc-dot" />
          <span>GenAI Solutions</span>
        </div>
      </motion.div>
    </div>
  )
}
