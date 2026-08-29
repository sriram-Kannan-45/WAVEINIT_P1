import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ShieldCheck, KeyRound, RefreshCw, ArrowRight } from 'lucide-react'
import { API } from '../api/api'
import AuthLayout from '../components/auth/AuthLayout'
import AuthCard from '../components/auth/AuthCard'
import { validateEmail, validatePassword } from '../utils/validators'

/* ── password strength ── */
function getStrength(pw) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLOR = ['', '#EF4444', '#F59E0B', '#10B981', '#16A34A']

/* ── OTP digit input ── */
function OtpInput({ value, onChange }) {
  const refs = useRef([])
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6)

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = digits.map((d, idx) => idx === i ? '' : d)
      onChange(next.join(''))
      if (i > 0) refs.current[i - 1]?.focus()
    }
  }

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    const next = digits.map((d, idx) => idx === i ? char : d)
    onChange(next.join(''))
    if (char && i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted.padEnd(6, '').slice(0, 6))
    refs.current[Math.min(pasted.length, 5)]?.focus()
    e.preventDefault()
  }

  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          autoComplete="one-time-code"
          style={{
            width: '46px',
            height: '52px',
            textAlign: 'center',
            fontSize: '20px',
            fontWeight: 700,
            fontFamily: "'Poppins', sans-serif",
            border: '1.5px solid #E2E8F0',
            borderRadius: '10px',
            background: d ? '#F8FAFC' : '#FFFFFF',
            color: '#0F172A',
            outline: 'none',
            transition: 'all 150ms ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#16A34A'
            e.target.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.12)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#E2E8F0'
            e.target.style.boxShadow = 'none'
          }}
        />
      ))}
    </div>
  )
}

/* ── step slide animation ── */
const stepVariants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.18, ease: 'easeIn' } }
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const inFlight = useRef(false)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (!email) return
    const key = `fp_cooldown_${email}`
    if (countdown > 0) {
      localStorage.setItem(key, String(Date.now() + countdown * 1000))
    } else {
      localStorage.removeItem(key)
    }
  }, [countdown, email])

  useEffect(() => {
    if (step !== 2 || !email) return
    const key = `fp_cooldown_${email}`
    const until = parseInt(localStorage.getItem(key) || '0', 10)
    const remaining = Math.max(0, Math.round((until - Date.now()) / 1000))
    if (remaining > 0 && countdown === 0) setCountdown(remaining)
  }, [step, email])

  const post = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    if (inFlight.current) return
    setError('')
    if (!validateEmail(email)) {
      return setError('Enter a valid email address')
    }
    inFlight.current = true
    setLoading(true)
    try {
      await post(API.FORGOT_PASSWORD.SEND_OTP, { email })
      setCountdown(60)
      setInfo("OTP sent! Check your inbox (and spam folder).")
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (inFlight.current) return
    setError('')
    if (otp.replace(/\D/g, '').length < 6) return setError('Enter the 6-digit OTP')
    inFlight.current = true
    setLoading(true)
    try {
      const data = await post(API.FORGOT_PASSWORD.VERIFY_OTP, { email, otp })
      setResetToken(data.resetToken || '')
      setInfo('OTP verified! Choose your new password.')
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  const handleResend = async () => {
    if (countdown > 0 || inFlight.current) return
    setError('')
    setOtp('')
    inFlight.current = true
    setLoading(true)
    try {
      await post(API.FORGOT_PASSWORD.SEND_OTP, { email })
      setCountdown(60)
      setInfo('New OTP sent. Check your inbox or spam folder.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (inFlight.current) return
    setError('')
    if (!validatePassword(password)) {
      return setError('Password must be at least 8 characters long and contain uppercase, lowercase, a number, and a special character')
    }
    if (password !== confirm) return setError('Passwords do not match')
    inFlight.current = true
    setLoading(true)
    try {
      await post(API.FORGOT_PASSWORD.RESET, { email, resetToken, newPassword: password })
      setStep(4)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  const strength = getStrength(password)

  return (
    <div className="auth-page">
      <AuthLayout />

      <AuthCard>
        <div className="auth-card-inner">
          {/* Back button */}
          {step < 4 && (
            <button
              onClick={() => step === 1 ? navigate('/login') : setStep(s => s - 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                fontSize: '13px',
                fontWeight: 500,
                color: '#64748B',
                cursor: 'pointer',
                padding: '0 0 14px 0',
                fontFamily: "'Poppins', sans-serif",
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
            >
              <ArrowLeft size={15} />
              {step === 1 ? 'Back to Login' : 'Back'}
            </button>
          )}

          {/* 3-Step Progress Bar */}
          {step < 4 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '22px' }}>
              {[1, 2, 3].map(s => (
                <div 
                  key={s} 
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    background: step >= s ? '#16A34A' : '#E2E8F0',
                    transition: 'background 250ms ease',
                  }}
                />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* STEP 1: Email */}
            {step === 1 && (
              <motion.div key="s1" variants={stepVariants} initial="enter" animate="center" exit="exit">
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#EAF8F0',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <Mail size={22} />
                </div>

                <div className="auth-card-header" style={{ textAlign: 'left', marginBottom: '18px' }}>
                  <h2 className="auth-card-title">Forgot Password?</h2>
                  <p className="auth-card-subtitle">
                    Enter your registered email and we&apos;ll send you a 6-digit verification OTP.
                  </p>
                </div>

                {error && (
                  <div className="auth-error" role="alert" style={{ marginBottom: '14px' }}>
                    <AlertCircle className="auth-error-icon" size={16} />
                    <span className="auth-error-text">{error}</span>
                  </div>
                )}

                <form onSubmit={handleSendOtp} className="auth-form-body">
                  <div className="auth-form-group">
                    <label className="auth-form-label" htmlFor="forgot-email">Email Address</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="forgot-email"
                        className="auth-form-input auth-form-input--has-icon-right"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        autoFocus
                      />
                      <span className="auth-input-icon" style={{ pointerEvents: 'none' }}>
                        <Mail size={17} />
                      </span>
                    </div>
                  </div>

                  <button
                    className="auth-submit-btn"
                    type="submit"
                    disabled={loading}
                    style={{ marginTop: '8px' }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: OTP */}
            {step === 2 && (
              <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit">
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#EAF8F0',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <ShieldCheck size={22} />
                </div>

                <div className="auth-card-header" style={{ textAlign: 'left', marginBottom: '18px' }}>
                  <h2 className="auth-card-title">Enter Verification Code</h2>
                  <p className="auth-card-subtitle">
                    We sent a 6-digit OTP code to <strong style={{ color: '#0F172A' }}>{email}</strong>. It expires in 5 minutes.
                  </p>
                </div>

                {info && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#15803D',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    marginBottom: '14px',
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    <CheckCircle2 size={16} />
                    <span>{info}</span>
                  </div>
                )}

                {error && (
                  <div className="auth-error" role="alert" style={{ marginBottom: '14px' }}>
                    <AlertCircle className="auth-error-icon" size={16} />
                    <span className="auth-error-text">{error}</span>
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} className="auth-form-body">
                  <OtpInput value={otp} onChange={setOtp} />

                  <button
                    className="auth-submit-btn"
                    type="submit"
                    disabled={loading || otp.replace(/\D/g,'').length < 6}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Continue</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <button 
                  onClick={handleResend} 
                  disabled={countdown > 0 || loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    marginTop: '16px',
                    background: 'none',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: countdown > 0 ? '#94A3B8' : '#16A34A',
                    cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  <RefreshCw size={14} />
                  {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend Verification Code'}
                </button>
              </motion.div>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
              <motion.div key="s3" variants={stepVariants} initial="enter" animate="center" exit="exit">
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#EAF8F0',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <KeyRound size={22} />
                </div>

                <div className="auth-card-header" style={{ textAlign: 'left', marginBottom: '18px' }}>
                  <h2 className="auth-card-title">Set New Password</h2>
                  <p className="auth-card-subtitle">
                    Choose a strong password with at least 8 characters.
                  </p>
                </div>

                {error && (
                  <div className="auth-error" role="alert" style={{ marginBottom: '14px' }}>
                    <AlertCircle className="auth-error-icon" size={16} />
                    <span className="auth-error-text">{error}</span>
                  </div>
                )}

                <form onSubmit={handleReset} className="auth-form-body">
                  <div className="auth-form-group">
                    <label className="auth-form-label" htmlFor="new-pw">New Password</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="new-pw"
                        className="auth-form-input"
                        type={showPw ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {password.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                        {[1, 2, 3, 4].map(n => (
                          <div key={n} style={{ 
                            flex: 1, 
                            height: '4px', 
                            borderRadius: '2px',
                            background: n <= strength ? STRENGTH_COLOR[strength] : '#E2E8F0',
                            transition: 'background 200ms ease'
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: STRENGTH_COLOR[strength], fontFamily: "'Poppins', sans-serif" }}>
                        {STRENGTH_LABEL[strength]}
                      </span>
                    </div>
                  )}

                  <div className="auth-form-group">
                    <label className="auth-form-label" htmlFor="confirm-pw">Confirm New Password</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="confirm-pw"
                        className="auth-form-input"
                        type={showCf ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowCf(v => !v)}
                        aria-label={showCf ? 'Hide password' : 'Show password'}
                      >
                        {showCf ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {confirm.length > 0 && password !== confirm && (
                    <p style={{ fontSize: '12.5px', color: '#EF4444', marginTop: '-4px', marginBottom: '12px', fontFamily: "'Poppins', sans-serif" }}>
                      Passwords do not match
                    </p>
                  )}

                  <button
                    className="auth-submit-btn"
                    type="submit"
                    disabled={loading || password.length < 8 || password !== confirm}
                    style={{ marginTop: '8px' }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Resetting Password...</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 4: Success */}
            {step === 4 && (
              <motion.div
                key="s4"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                style={{ textAlign: 'center', padding: '16px 0 8px' }}
              >
                <motion.div
                  style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '16px', 
                    background: '#EAF8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16A34A',
                    margin: '0 auto 18px'
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                >
                  <CheckCircle2 size={32} />
                </motion.div>
                <h2 className="auth-card-title" style={{ marginBottom: '6px' }}>Password Reset!</h2>
                <p className="auth-card-subtitle" style={{ marginBottom: '22px' }}>
                  Your password has been updated successfully. You can now sign in to your account.
                </p>
                <button 
                  className="auth-submit-btn"
                  onClick={() => navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } })}
                >
                  <span>Go to Login</span>
                  <ArrowRight size={17} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AuthCard>
    </div>
  )
}
