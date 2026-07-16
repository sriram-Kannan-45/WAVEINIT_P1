import { motion } from 'framer-motion'

const ease = [0.22, 1, 0.36, 1]

export default function FeatureCard({ icon: Icon, title, desc, index = 0 }) {
  return (
    <motion.div
      className="wl-auth-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.6 + index * 0.06, ease }}
    >
      <div className="wl-auth-card-icon"><Icon size={22} /></div>
      <h3 className="wl-auth-card-title">{title}</h3>
      <p className="wl-auth-card-desc">{desc}</p>
    </motion.div>
  )
}
