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

  const addToast = useCallback((message, options = {}) => {
    const id = Date.now()
    const {
      type = 'info',
      duration = 4000,
      action = null
    } = options

    const toast = { id, message, type, action }
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const success = useCallback((message, options = {}) => {
    addToast(message, { ...options, type: 'success' })
  }, [addToast])

  const error = useCallback((message, options = {}) => {
    addToast(message, { ...options, type: 'error', duration: options.duration ?? 5000 })
  }, [addToast])

  const info = useCallback((message, options = {}) => {
    addToast(message, { ...options, type: 'info' })
  }, [addToast])

  const warning = useCallback((message, options = {}) => {
    addToast(message, { ...options, type: 'warning', duration: options.duration ?? 5000 })
  }, [addToast])

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning }}>
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
  return context
}

const toastStyles = {
  success: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.25)',
    text: '#059669',
    iconBg: 'rgba(16, 185, 129, 0.15)',
    progressBar: '#10b981',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.25)',
    text: '#dc2626',
    iconBg: 'rgba(239, 68, 68, 0.15)',
    progressBar: '#ef4444',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.25)',
    text: '#d97706',
    iconBg: 'rgba(245, 158, 11, 0.15)',
    progressBar: '#f59e0b',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.25)',
    text: '#2563eb',
    iconBg: 'rgba(59, 130, 246, 0.15)',
    progressBar: '#3b82f6',
  },
}

const ToastContainer = ({ toasts, onRemove }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <Check size={16} />
      case 'error':
        return <AlertCircle size={16} />
      case 'warning':
        return <AlertTriangle size={16} />
      case 'info':
      default:
        return <Info size={16} />
    }
  }

  return (
    <div 
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: '420px', width: '100%' }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const style = toastStyles[toast.type] || toastStyles.info
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto"
            >
              <div 
                className="flex items-start gap-3 px-4 py-3.5 rounded-xl font-medium text-sm shadow-lg"
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <div 
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: style.iconBg, color: style.text }}
                >
                  {getIcon(toast.type)}
                </div>
                <div className="flex-1 pt-0.5" style={{ color: style.text }}>
                  {toast.message}
                </div>
                <button
                  onClick={() => onRemove(toast.id)}
                  className="flex-shrink-0 ml-1 p-1 rounded-md hover:bg-black/5 transition-all duration-150"
                  style={{ color: style.text, opacity: 0.6 }}
                >
                  <X size={14} />
                </button>
              </div>
              {/* Progress bar */}
              <motion.div
                className="h-[2px] rounded-b-xl mx-1 -mt-[1px]"
                style={{ background: style.progressBar, opacity: 0.4 }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: toast.type === 'error' || toast.type === 'warning' ? 5 : 4, ease: 'linear' }}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
