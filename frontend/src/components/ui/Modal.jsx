import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { colors, radius, shadows, typography, zIndex, transitions } from '../../theme/tokens'
import { useEffect, useRef } from 'react'

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.15 } },
}

export default function Modal({ open, onClose, title, children, size = 'md', className = '' }) {
  const widthMap = { sm: 400, md: 500, lg: 640, xl: 800 }
  const maxW = widthMap[size] || 500
  const titleId = `modal-title-${title?.replace(/\s+/g, '-').toLowerCase() || 'default'}`
  const modalRef = useRef(null)

  // Focus trap
  useEffect(() => {
    if (!open) return
    const modal = modalRef.current
    if (!modal) return

    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length > 0) {
      focusable[0].focus()
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={className}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: zIndex.modalBackdrop,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
          }}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            style={{
              width: '100%',
              maxWidth: maxW,
              maxHeight: '85vh',
              overflow: 'auto',
              background: colors.surface.primary,
              borderRadius: radius.xl,
              boxShadow: shadows['2xl'],
              border: `1px solid ${colors.border.default}`,
              fontFamily: typography.fontFamily,
            }}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: `1px solid ${colors.border.light}`,
              }}>
                <h2 id={titleId} style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: colors.text.primary,
                  margin: 0,
                  fontFamily: typography.fontFamily,
                }}>
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.md,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: colors.text.muted,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `background ${transitions.fast}`,
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <div style={{ padding: '16px 24px' }}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
