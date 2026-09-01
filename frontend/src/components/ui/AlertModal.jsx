import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Trash2, CheckCircle2, AlertTriangle, AlertCircle,
  Info, LogOut, HelpCircle, Loader2, Sparkles, UserPlus, X
} from 'lucide-react'
import './AlertModal.css'

const AlertModalContext = createContext(null)

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 26, stiffness: 320 },
  },
  exit: {
    opacity: 0,
    scale: 0.94,
    y: 12,
    transition: { duration: 0.14, ease: 'easeIn' },
  },
}

export function AlertModalProvider({ children }) {
  const [modalState, setModalState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef(null)
  const confirmBtnRef = useRef(null)
  const resolverRef = useRef(null)

  // Focus input or confirm button when modal opens
  useEffect(() => {
    if (!modalState) return
    const timer = setTimeout(() => {
      if (modalState.isPrompt && inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      } else if (confirmBtnRef.current) {
        confirmBtnRef.current.focus()
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [modalState])

  // Keyboard accessibility: Escape to cancel, Enter to confirm (unless in textarea)
  useEffect(() => {
    if (!modalState) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // If focused on cancel button, let normal click trigger cancel
        if (document.activeElement?.classList?.contains('wam-btn-cancel')) {
          return
        }
        e.preventDefault()
        handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modalState, inputValue, loading])

  const handleCancel = useCallback(() => {
    if (loading) return
    if (resolverRef.current) {
      resolverRef.current(modalState?.isPrompt ? null : false)
    }
    setModalState(null)
    setLoading(false)
  }, [loading, modalState])

  const handleConfirm = useCallback(async () => {
    if (loading) return

    if (modalState?.onConfirm) {
      try {
        setLoading(true)
        const res = await modalState.onConfirm(modalState.isPrompt ? inputValue : true)
        if (resolverRef.current) {
          resolverRef.current(modalState.isPrompt ? inputValue : res !== false)
        }
        setModalState(null)
      } catch (err) {
        console.error('[AlertModal] onConfirm error:', err)
      } finally {
        setLoading(false)
      }
    } else {
      if (resolverRef.current) {
        resolverRef.current(modalState?.isPrompt ? inputValue : true)
      }
      setModalState(null)
    }
  }, [loading, modalState, inputValue])

  /**
   * confirm({ title, message, type, confirmText, cancelText, ... }) -> Promise<boolean>
   */
  const confirm = useCallback((optionsOrMessage, extraOptions = {}) => {
    let opts = {}
    if (typeof optionsOrMessage === 'string') {
      opts = { message: optionsOrMessage, ...extraOptions }
    } else if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
      opts = optionsOrMessage
    }

    const {
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      type = 'confirm',
      confirmText = type === 'publish' ? 'Yes, Publish' : type === 'delete' || type === 'danger' ? 'Delete' : type === 'submit' ? 'Yes, Submit' : 'Continue',
      cancelText = 'Cancel',
      confirmIcon = null,
      onConfirm = null,
    } = opts

    return new Promise((resolve) => {
      resolverRef.current = resolve
      setModalState({
        title,
        message,
        type,
        confirmText,
        cancelText,
        confirmIcon,
        isAlert: false,
        isPrompt: false,
        onConfirm,
      })
    })
  }, [])

  /**
   * alert({ title, message, type, confirmText, ... }) -> Promise<void>
   */
  const alert = useCallback((optionsOrMessage, extraOptions = {}) => {
    let opts = {}
    if (typeof optionsOrMessage === 'string') {
      opts = { message: optionsOrMessage, ...extraOptions }
    } else if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
      opts = optionsOrMessage
    }

    const {
      title = opts.type === 'error' ? 'Error' : opts.type === 'warning' ? 'Warning' : 'Information',
      message = '',
      type = 'info',
      confirmText = 'OK',
    } = opts

    return new Promise((resolve) => {
      resolverRef.current = () => resolve()
      setModalState({
        title,
        message,
        type,
        confirmText,
        cancelText: null,
        confirmIcon: null,
        isAlert: true,
        isPrompt: false,
      })
    })
  }, [])

  /**
   * prompt({ title, message, defaultValue, placeholder, ... }) -> Promise<string|null>
   */
  const prompt = useCallback((optionsOrMessage, defaultVal = '', extraOptions = {}) => {
    let opts = {}
    if (typeof optionsOrMessage === 'string') {
      opts = { message: optionsOrMessage, defaultValue: defaultVal, ...extraOptions }
    } else if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
      opts = optionsOrMessage
    }

    const {
      title = 'Enter Information',
      message = 'Please enter a value:',
      defaultValue = '',
      placeholder = 'Type here...',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      type = 'prompt',
    } = opts

    setInputValue(defaultValue)

    return new Promise((resolve) => {
      resolverRef.current = resolve
      setModalState({
        title,
        message,
        type,
        defaultValue,
        placeholder,
        confirmText,
        cancelText,
        isAlert: false,
        isPrompt: true,
      })
    })
  }, [])

  // Helper to format messages with highlighted quoted text
  const renderFormattedMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return msg

    // Match quoted substrings like "Course Name" or “Quiz Title”
    const parts = msg.split(/(".*?"|“.*?”)/g)
    if (parts.length === 1) return msg

    return parts.map((part, i) => {
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith('“') && part.endsWith('”'))) {
        return (
          <span key={i} className="wam-highlight">
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Render Icon according to theme type
  const renderIcon = (type, customIcon) => {
    if (customIcon) return customIcon

    switch (type) {
      case 'publish':
        return <Send size={32} strokeWidth={2.2} />
      case 'submit':
      case 'success':
      case 'confirm':
        return <CheckCircle2 size={34} strokeWidth={2.2} />
      case 'enroll':
        return <UserPlus size={32} strokeWidth={2.2} />
      case 'delete':
      case 'danger':
      case 'terminate':
        return <Trash2 size={32} strokeWidth={2.2} />
      case 'error':
        return <AlertCircle size={34} strokeWidth={2.2} />
      case 'warning':
      case 'reset':
      case 'close':
        return <AlertTriangle size={32} strokeWidth={2.2} />
      case 'logout':
        return <LogOut size={32} strokeWidth={2.2} />
      case 'info':
      case 'prompt':
      default:
        return <HelpCircle size={34} strokeWidth={2.2} />
    }
  }

  // Button confirm class according to type
  const getConfirmBtnClass = (type) => {
    if (['delete', 'danger', 'terminate', 'error'].includes(type)) {
      return 'wam-btn-confirm wam-btn-confirm--danger'
    }
    if (['warning', 'reset', 'close'].includes(type)) {
      return 'wam-btn-confirm wam-btn-confirm--warning'
    }
    if (['info', 'prompt'].includes(type)) {
      return 'wam-btn-confirm wam-btn-confirm--info'
    }
    if (type === 'logout') {
      return 'wam-btn-confirm wam-btn-confirm--logout'
    }
    return 'wam-btn-confirm'
  }

  return (
    <AlertModalContext.Provider value={{ confirm, alert, prompt }}>
      {children}

      <AnimatePresence>
        {modalState && (
          <motion.div
            className="wam-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleCancel}
          >
            <motion.div
              className={`wam-card wam-theme--${modalState.type || 'confirm'}`}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Icon Badge */}
              <div className="wam-icon-wrapper">
                <Sparkles size={14} className="wam-sparkle wam-sparkle--top-right" />
                <Sparkles size={11} className="wam-sparkle wam-sparkle--top-left" />
                <Sparkles size={12} className="wam-sparkle wam-sparkle--bottom-right" />
                <div className="wam-icon-circle">
                  {renderIcon(modalState.type, modalState.confirmIcon)}
                </div>
              </div>

              {/* Title & Message */}
              <h3 className="wam-title">{modalState.title}</h3>
              <p className="wam-message">
                {renderFormattedMessage(modalState.message)}
              </p>

              {/* Prompt Input */}
              {modalState.isPrompt && (
                <div className="wam-prompt-wrapper">
                  <input
                    ref={inputRef}
                    className="wam-prompt-input"
                    type="text"
                    placeholder={modalState.placeholder}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="wam-actions">
                {!modalState.isAlert && modalState.cancelText && (
                  <button
                    type="button"
                    className="wam-btn wam-btn-cancel"
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    {modalState.cancelText}
                  </button>
                )}

                <button
                  ref={confirmBtnRef}
                  type="button"
                  className={`wam-btn ${getConfirmBtnClass(modalState.type)}`}
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="wam-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>{modalState.confirmText}</span>
                      {modalState.type === 'publish' && <Send size={15} />}
                      {['submit', 'success'].includes(modalState.type) && <CheckCircle2 size={16} />}
                      {['delete', 'danger', 'terminate'].includes(modalState.type) && <Trash2 size={15} />}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AlertModalContext.Provider>
  )
}

export function useAlertModal() {
  const ctx = useContext(AlertModalContext)
  if (!ctx) {
    return {
      confirm: async (optionsOrMessage, extraOptions = {}) => {
        let msg = 'Are you sure you want to proceed?'
        if (typeof optionsOrMessage === 'string') msg = optionsOrMessage
        else if (optionsOrMessage?.message) msg = optionsOrMessage.message
        return window.confirm(msg)
      },
      alert: async (optionsOrMessage) => {
        const msg = typeof optionsOrMessage === 'string' ? optionsOrMessage : (optionsOrMessage?.message || '')
        window.alert(msg)
      },
      prompt: async (optionsOrMessage) => {
        const msg = typeof optionsOrMessage === 'string' ? optionsOrMessage : (optionsOrMessage?.message || '')
        const def = typeof optionsOrMessage === 'object' ? (optionsOrMessage?.defaultValue || '') : ''
        return window.prompt(msg, def)
      },
    }
  }
  return ctx
}

export const useConfirm = () => {
  const { confirm } = useAlertModal()
  return confirm
}

export const useAlert = () => {
  const { alert } = useAlertModal()
  return alert
}

export const usePrompt = () => {
  const { prompt } = useAlertModal()
  return prompt
}
