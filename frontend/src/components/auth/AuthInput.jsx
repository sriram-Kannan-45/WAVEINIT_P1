import { motion, AnimatePresence } from 'framer-motion'

export default function AuthInput({
  id, label, icon: Icon, type = 'text', value, onChange,
  placeholder, autoComplete, disabled, focused, onFocus, onBlur,
  endAdornment, validationIcon, spellCheck = false, minLength,
}) {
  return (
    <div className="wl-auth-field">
      {label && <label className="wl-auth-label" htmlFor={id}>{label}</label>}
      <div className="wl-auth-inp-wrap" data-focus={focused ? '1' : '0'}>
        {Icon && <span className="wl-auth-inp-icon"><Icon size={18} /></span>}
        <input
          id={id}
          className="wl-auth-inp"
          type={type}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={spellCheck}
          disabled={disabled}
          minLength={minLength}
        />
        {validationIcon && (
          <motion.span
            className="wl-auth-check-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            {validationIcon}
          </motion.span>
        )}
        {endAdornment}
      </div>
    </div>
  )
}

export function PasswordInput({
  id, label, value, onChange, placeholder, autoComplete,
  disabled, focused, onFocus, onBlur, show, onToggle,
}) {
  return (
    <AuthInput
      id={id}
      label={label}
      icon={Lock}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      disabled={disabled}
      focused={focused}
      onFocus={onFocus}
      onBlur={onBlur}
      endAdornment={
        <motion.button
          type="button"
          tabIndex={-1}
          className="wl-auth-eye"
          onClick={onToggle}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={show ? 'off' : 'on'}
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex' }}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      }
    />
  )
}

import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

export { CheckCircle2 }
