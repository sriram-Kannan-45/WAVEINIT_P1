import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Check, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  // Clear toasts on route change so stale messages don't persist across pages
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      setToasts([])
      prevPath.current = location.pathname
    }
  }, [location.pathname])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const recentToastsRef = useRef(new Map())

  const addToast = useCallback((message, optionsOrDesc = {}) => {
    if (!message) return null
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    let options = {}
    if (typeof optionsOrDesc === 'string') {
      options = { description: optionsOrDesc }
    } else if (typeof optionsOrDesc === 'object' && optionsOrDesc !== null) {
      options = optionsOrDesc
    }

    const {
      type = 'info',
      duration = type === 'error' ? 5000 : type === 'warning' ? 4500 : 3500,
      description = '',
      action = null
    } = options

    // Deduplication check: prevent identical toast (type + message + description) within 2000ms
    const dedupKey = `${type}:${message}:${description}`
    const now = Date.now()
    const lastTime = recentToastsRef.current.get(dedupKey) || 0
    if (now - lastTime < 2000) {
      return null
    }
    recentToastsRef.current.set(dedupKey, now)

    // Clean up stale entries (>10s)
    for (const [k, timestamp] of recentToastsRef.current.entries()) {
      if (now - timestamp > 10000) {
        recentToastsRef.current.delete(k)
      }
    }

    const toast = { id, message, description, type, action, duration }
    setToasts(prev => {
      const updated = [...prev, toast]
      // Maximum 3 visible toasts
      if (updated.length > 3) {
        return updated.slice(updated.length - 3)
      }
      return updated
    })

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }, [removeToast])

  const success = useCallback((message, optionsOrDesc) => {
    const opts = typeof optionsOrDesc === 'string' ? { description: optionsOrDesc } : optionsOrDesc
    return addToast(message, { ...opts, type: 'success' })
  }, [addToast])

  const error = useCallback((message, optionsOrDesc) => {
    const opts = typeof optionsOrDesc === 'string' ? { description: optionsOrDesc } : optionsOrDesc
    return addToast(message, { ...opts, type: 'error' })
  }, [addToast])

  const info = useCallback((message, optionsOrDesc) => {
    const opts = typeof optionsOrDesc === 'string' ? { description: optionsOrDesc } : optionsOrDesc
    return addToast(message, { ...opts, type: 'info' })
  }, [addToast])

  const warning = useCallback((message, optionsOrDesc) => {
    const opts = typeof optionsOrDesc === 'string' ? { description: optionsOrDesc } : optionsOrDesc
    return addToast(message, { ...opts, type: 'warning' })
  }, [addToast])

  const toastFn = useCallback((message, optionsOrDesc) => {
    return addToast(message, optionsOrDesc)
  }, [addToast])

  toastFn.success = success
  toastFn.error = error
  toastFn.info = info
  toastFn.warning = warning

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning, toast: toastFn }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  // Return context directly, but also allow calling as toast.success() or { success, error }
  const result = {
    ...context,
    toast: context.toast || context,
  }
  return result
}

const toastStyles = {
  success: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    iconCircleBg: '#16A34A',
    iconColor: '#FFFFFF',
    titleColor: '#14532D',
    descColor: '#15803D',
    closeColor: '#16A34A',
    progressBar: '#16A34A',
  },
  error: {
    bg: '#FEF2F2',
    border: '#FECACA',
    iconCircleBg: '#DC2626',
    iconColor: '#FFFFFF',
    titleColor: '#7F1D1D',
    descColor: '#991B1B',
    closeColor: '#DC2626',
    progressBar: '#DC2626',
  },
  warning: {
    bg: '#FFFBEB',
    border: '#FDE68A',
    iconCircleBg: '#D97706',
    iconColor: '#FFFFFF',
    titleColor: '#78350F',
    descColor: '#92400E',
    closeColor: '#D97706',
    progressBar: '#D97706',
  },
  info: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    iconCircleBg: '#2563EB',
    iconColor: '#FFFFFF',
    titleColor: '#1E3A8A',
    descColor: '#1D4ED8',
    closeColor: '#2563EB',
    progressBar: '#2563EB',
  },
}

const ToastContainer = ({ toasts, onRemove }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <Check size={14} strokeWidth={3} />
      case 'error':
        return <AlertCircle size={15} strokeWidth={2.5} />
      case 'warning':
        return <AlertTriangle size={14} strokeWidth={2.5} />
      case 'info':
      default:
        return <Info size={15} strokeWidth={2.5} />
    }
  }

  return (
    <div 
      className="fixed bottom-6 right-6 z-[999999] flex flex-col-reverse gap-2.5 pointer-events-none"
      style={{
        maxWidth: '380px',
        width: 'calc(100vw - 32px)',
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const style = toastStyles[toast.type] || toastStyles.info
          const durationSeconds = (toast.duration || 3500) / 1000

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 25, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.94 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto"
            >
              <div 
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.06)',
                  padding: '12px 14px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  {/* Circular icon */}
                  <div 
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: style.iconCircleBg,
                      color: style.iconColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '1px',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }}
                  >
                    {getIcon(toast.type)}
                  </div>

                  {/* Text area */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div 
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: style.titleColor,
                        lineHeight: 1.35,
                        wordBreak: 'break-word'
                      }}
                    >
                      {toast.message}
                    </div>

                    {toast.description && (
                      <div 
                        style={{
                          fontSize: '11.5px',
                          color: style.descColor,
                          marginTop: '2px',
                          lineHeight: 1.35,
                          opacity: 0.9,
                          wordBreak: 'break-word'
                        }}
                      >
                        {toast.description}
                      </div>
                    )}
                  </div>

                  {/* Close button */}
                  <button
                    onClick={() => onRemove(toast.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: style.closeColor,
                      opacity: 0.65,
                      cursor: 'pointer',
                      padding: '2px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'opacity 150ms ease, background 150ms ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.06)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.65'; e.currentTarget.style.background = 'none' }}
                    aria-label="Close notification"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Progress bar line */}
                <motion.div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: '3px',
                    background: style.progressBar,
                    opacity: 0.85
                  }}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: durationSeconds, ease: 'linear' }}
                />
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
