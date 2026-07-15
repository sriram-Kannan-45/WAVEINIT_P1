import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useAppTheme } from '../../contexts/AppThemeContext'

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useAppTheme()

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={`theme-toggle ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <motion.span
        key={isDark ? 'moon' : 'sun'}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="theme-toggle__icon"
      >
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </motion.span>
    </motion.button>
  )
}
