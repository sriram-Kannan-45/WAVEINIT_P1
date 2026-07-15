import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react'
import { API } from '../api/api'

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
const STRENGTH_COLOR = ['', '#F04438', '#F79009', '#059669', '#12B76A']

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
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
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
            width: '48px',
            height: '56px',
            textAlign: 'center',
            fontSize: '20px',
            fontWeight: 700,
            fontFamily: 'var(--font-primary)',
            border: '1.5px solid var(--neutral-200)',
            borderRadius: 'var(--radius-lg)',
            background: d ? 'var(--neutral-50)' : 'var(--neutral-0)',
            color: 'var(--neutral-900)',
            outline: 'none',
            transition: 'all 150ms ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--brand-admin)'
            e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--neutral-200)'
            e.target.style.boxShadow = 'none'
          }}
        />
      ))}
    </div>
  )
}

/* ── step slide animation ── */
const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.22, ease: 'easeIn' } }
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
      setResetToken(data.resetToken)
      setInfo('')
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
    if (password.length < 8) return setError('Password must be at least 8 characters')
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
    <div className="auth-layout" style={{ background: 'var(--neutral-25)' }}>
      {/* Left Side — Hero */}
      <div className="auth-layout__left">
        <div className="auth-layout__brand">
          <div className="auth-layout__brand-icon">W</div>
          <span className="auth-layout__brand-text">WAVE INIT</span>
        </div>

        <div className="auth-layout__hero">
          <div className="auth-layout__hero-visual" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h1 className="auth-layout__hero-title">
              Reset your<br />
              <span style={{ background: 'linear-gradient(135deg, #0D9488, #2DD4BF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Password
              </span>
            </h1>
            <p className="auth-layout__hero-subtitle">
              Don't worry, it happens to the best of us. 
              We'll help you get back into your account in no time.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Side — Form */}
      <div className="auth-layout__right">
        <motion.div 
          className="auth-card"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Back button */}
          {step < 4 && (
            <button
              onClick={() => step === 1 ? navigate('/login') : setStep(s => s - 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--neutral-500)',
                cursor: 'pointer',
                padding: 0,
                marginBottom: '24px',
              }}
            >
              <ArrowLeft size={16} />
              {step === 1 ? 'Back to Login' : 'Back'}
            </button>
          )}

          {/* Step indicator */}
          {step < 4 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
              {[1, 2, 3].map(s => (
                <div 
                  key={s} 
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    background: step >= s ? 'var(--brand-admin)' : 'var(--neutral-200)',
                    transition: 'background 300ms ease',
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
                  width: '48px', 
                  height: '48px', 
                  borderRadius: 'var(--radius-xl)', 
                  background: 'var(--status-info-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--status-info)',
                  marginBottom: '20px'
                }}>
                  <Mail size={22} />
                </div>
                <div className="auth-card__header">
                  <h2 className="auth-card__title">Forgot Password?</h2>
                  <p className="auth-card__subtitle">Enter your registered email and we'll send you a 6-digit OTP.</p>
                </div>

                {error && (
                  <motion.div className="alert alert--error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </motion.div>
                )}

                <form onSubmit={handleSendOtp}>
                  <div className="field-group">
                    <label className="field-label">Email Address</label>
                    <div className="field-input-wrap">
                      <Mail size={16} className="field-input-icon" />
                      <input
                        className="field-input"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <button className="btn-enterprise btn-enterprise--primary btn-enterprise--full" type="submit" disabled={loading}>
                    {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Sending OTP...</> : 'Send OTP'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: OTP */}
            {step === 2 && (
              <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit">
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: 'var(--radius-xl)', 
                  background: 'var(--status-info-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--status-info)',
                  marginBottom: '20px'
                }}>
                  <ShieldCheck size={22} />
                </div>
                <div className="auth-card__header">
                  <h2 className="auth-card__title">Enter OTP</h2>
                  <p className="auth-card__subtitle">We sent a 6-digit code to <strong>{email}</strong>. It expires in 5 minutes.</p>
                </div>

                {info && (
                  <motion.div className="alert alert--info" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <CheckCircle2 size={16} />
                    <span>{info}</span>
                  </motion.div>
                )}
                {error && (
                  <motion.div className="alert alert--error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </motion.div>
                )}

                <form onSubmit={handleVerifyOtp}>
                  <OtpInput value={otp} onChange={setOtp} />
                  <button className="btn-enterprise btn-enterprise--primary btn-enterprise--full" type="submit" disabled={loading || otp.replace(/\D/g,'').length < 6}>
                    {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Verifying...</> : 'Verify OTP'}
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
                    fontWeight: 600,
                    color: countdown > 0 ? 'var(--neutral-400)' : 'var(--brand-admin)',
                    cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw size={14} />
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                </button>
              </motion.div>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
              <motion.div key="s3" variants={stepVariants} initial="enter" animate="center" exit="exit">
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: 'var(--radius-xl)', 
                  background: 'var(--status-info-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--status-info)',
                  marginBottom: '20px'
                }}>
                  <KeyRound size={22} />
                </div>
                <div className="auth-card__header">
                  <h2 className="auth-card__title">New Password</h2>
                  <p className="auth-card__subtitle">Choose a strong password with at least 8 characters.</p>
                </div>

                {error && (
                  <motion.div className="alert alert--error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </motion.div>
                )}

                <form onSubmit={handleReset}>
                  <div className="field-group">
                    <label className="field-label">New Password</label>
                    <div className="field-input-wrap">
                      <KeyRound size={16} className="field-input-icon" />
                      <input
                        className="field-input"
                        type={showPw ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                      />
                      <button type="button" className="field-input-icon-right" onClick={() => setShowPw(v => !v)}>
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {password.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                        {[1,2,3,4].map(n => (
                          <div key={n} style={{ 
                            flex: 1, 
                            height: '4px', 
                            borderRadius: '2px',
                            background: n <= strength ? STRENGTH_COLOR[strength] : 'var(--neutral-200)',
                            transition: 'background 200ms ease'
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: STRENGTH_COLOR[strength] }}>
                        {STRENGTH_LABEL[strength]}
                      </span>
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label">Confirm Password</label>
                    <div className="field-input-wrap">
                      <KeyRound size={16} className="field-input-icon" />
                      <input
                        className="field-input"
                        type={showCf ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                      />
                      <button type="button" className="field-input-icon-right" onClick={() => setShowCf(v => !v)}>
                        {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {confirm.length > 0 && password !== confirm && (
                    <p style={{ fontSize: '12px', color: 'var(--status-error)', marginTop: '-8px', marginBottom: '16px' }}>
                      Passwords do not match
                    </p>
                  )}

                  <button className="btn-enterprise btn-enterprise--primary btn-enterprise--full" type="submit" disabled={loading || password.length < 8 || password !== confirm}>
                    {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Resetting...</> : 'Reset Password'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 4: Success */}
            {step === 4 && (
              <motion.div key="s4" variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ textAlign: 'center', padding: '24px 0' }}>
                <motion.div
                  style={{ 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: 'var(--radius-2xl)', 
                    background: 'var(--status-success-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--status-success)',
                    margin: '0 auto 20px'
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                >
                  <CheckCircle2 size={28} />
                </motion.div>
                <h2 className="auth-card__title" style={{ marginBottom: '8px' }}>Password Reset!</h2>
                <p className="auth-card__subtitle" style={{ marginBottom: '24px' }}>Your password has been updated successfully. You can now sign in.</p>
                <button 
                  className="btn-enterprise btn-enterprise--primary btn-enterprise--full" 
                  onClick={() => navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } })}
                >
                  Go to Login
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p style={{ marginTop: '32px', fontSize: '12px', color: '#98A2B3' }}>
          © {new Date().getFullYear()} WaveInit LMS. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
