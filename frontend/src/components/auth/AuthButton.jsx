import { motion } from 'framer-motion'
import { Loader2, ArrowRight } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1]

export default function AuthButton({ loading, loadingText, children, delay = 0.4 }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      className="wl-auth-cta"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      whileHover={{ scale: loading ? 1 : 1.012 }}
      whileTap={{ scale: loading ? 1 : 0.985 }}
    >
      {loading ? (
        <><Loader2 size={20} className="wl-auth-spin" /><span>{loadingText || 'Loading...'}</span></>
      ) : (
        <>{children}<ArrowRight size={20} /></>
      )}
    </motion.button>
  )
}
