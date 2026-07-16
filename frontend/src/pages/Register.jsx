import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Mail, Phone, Lock, Eye, EyeOff, ChevronRight, AlertCircle, CheckCircle2, Brain, ClipboardCheck, Code, ShieldCheck, BarChart3, Award } from 'lucide-react'
import { API } from '../api/api'
import { AuthLayout, AuthCard, AuthInput, PasswordInput, AuthButton } from '../components/auth'

const ease = [0.22, 1, 0.36, 1]

const FEATURES = [
  { icon: Brain, label: 'AI Powered' },
  { icon: ClipboardCheck, label: 'Live Assessments' },
  { icon: Code, label: 'Coding Platform' },
  { icon: ShieldCheck, label: 'Enterprise Security' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Award, label: 'Certifications' },
]

function getStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let s = 0
  if (pw.length >= 6) s++
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s <= 1) return { score: 1, label: 'Weak', color: '#dc2626' }
  if (s <= 2) return { score: 2, label: 'Fair', color: '#f59e0b' }
  if (s <= 3) return { score: 3, label: 'Good', color: '#2563eb' }
  return { score: 4, label: 'Strong', color: '#16a34a' }
}

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [agreed, setAgreed] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const prev = { html: document.documentElement.style.overflow, body: document.body.style.overflow }
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = prev.html; document.body.style.overflow = prev.body }
  }, [])

  const strength = useMemo(() => getStrength(form.password), [form.password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!form.name.trim()) return setError('Full name is required')
    if (!form.email.trim()) return setError('Email is required')
    if (!form.phone.trim()) return setError('Phone number is required')
    if (!form.password) return setError('Password is required')
    if (form.password.length < 6) return setError('Password must be at least 6 characters')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match')
    if (!agreed) return setError('You must agree to the terms')

    setLoading(true)
    try {
      const res = await fetch(API.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      setSuccess('Registration successful! Your account is pending admin approval.')
      setForm({ name: '', email: '', password: '', confirmPassword: '', phone: '' })
      setTimeout(() => {
        navigate('/login', { state: { message: 'Your account is pending admin approval. You will be notified by email once approved!' } })
      }, 3000)
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message)
    } finally { setLoading(false) }
  }

  const heading = (
    <h1 className="wl-auth-heading">
      <span className="wl-auth-heading-line">Start Your</span>
      <span className="wl-auth-heading-line"><span className="wl-auth-heading-green">Learning</span></span>
      <span className="wl-auth-heading-line">Journey.</span>
    </h1>
  )

  const subtitle = (
    <p className="wl-auth-subtitle">
      Join thousands of learners advancing<br />their careers with <span className="wl-auth-subtitle-green">Wave Init</span>.
    </p>
  )

  return (
    <div className="wl-auth">
      <AuthLayout
        heading={heading}
        subtitle={subtitle}
        features={FEATURES}
      >
        <motion.div className="wl-auth-chips" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45, ease }}>
          {[
            'Access 100+ expert-led courses',
            'Earn industry-recognized certificates',
            'Join a global learning community',
            'Track your progress in real-time'
          ].map((feature, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </div>
              <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{feature}</span>
            </div>
          ))}
        </motion.div>
      </AuthLayout>

      <AuthCard
        title="Create Account"
        subtitle="Join as a participant to start learning"
        footer={
          <>
            Already have an account?{' '}
            <button type="button" className="wl-auth-foot-link" onClick={() => navigate('/login')}>
              Sign In <ChevronRight size={13} />
            </button>
          </>
        }
      >
        <div className="wl-auth-errspace">
          <AnimatePresence>
            {error && (
              <motion.div className="wl-auth-err" role="alert"
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} /><span>{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div className="wl-auth-err wl-auth-err--ok"
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} /><span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit}>
            <AuthInput
              id="reg-name"
              label="Full Name"
              icon={User}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="John Doe"
              autoComplete="name"
              disabled={loading}
              focused={focusedField === 'name'}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
            />

            <AuthInput
              id="reg-email"
              label="Email Address"
              icon={Mail}
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="john@example.com"
              autoComplete="email"
              disabled={loading}
              focused={focusedField === 'email'}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />

            <AuthInput
              id="reg-phone"
              label="Phone Number"
              icon={Phone}
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="e.g., 9876543210"
              autoComplete="tel"
              disabled={loading}
              focused={focusedField === 'phone'}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => setFocusedField(null)}
            />

            <div className="wl-auth-field">
              <label className="wl-auth-label" htmlFor="reg-pw">Password</label>
              <div className="wl-auth-inp-wrap" data-focus={focusedField === 'password' ? '1' : '0'}>
                <span className="wl-auth-inp-icon"><Lock size={18} /></span>
                <input
                  id="reg-pw"
                  className="wl-auth-inp"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  disabled={loading}
                />
                <motion.button type="button" tabIndex={-1} className="wl-auth-eye" onClick={() => setShowPassword(v => !v)}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <AnimatePresence mode="wait">
                    <motion.span key={showPassword ? 'off' : 'on'} initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
              <AnimatePresence>
                {form.password.length > 0 && (
                  <motion.div className="wl-auth-strength" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                    <div className="wl-auth-strength-bars">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="wl-auth-strength-bar" style={{ background: i <= strength.score ? strength.color : '#E5E7EB' }} />
                      ))}
                    </div>
                    <span className="wl-auth-strength-label" style={{ color: strength.color }}>{strength.label}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="wl-auth-field">
              <label className="wl-auth-label" htmlFor="reg-confirm">Confirm Password</label>
              <div className="wl-auth-inp-wrap" data-focus={focusedField === 'confirm' ? '1' : '0'}>
                <span className="wl-auth-inp-icon"><Lock size={18} /></span>
                <input
                  id="reg-confirm"
                  className="wl-auth-inp"
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <motion.button type="button" tabIndex={-1} className="wl-auth-eye" onClick={() => setShowConfirm(v => !v)}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                  <AnimatePresence mode="wait">
                    <motion.span key={showConfirm ? 'off' : 'on'} initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <motion.p className="wl-auth-field-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Passwords do not match</motion.p>
              )}
              {form.confirmPassword && form.password === form.confirmPassword && form.confirmPassword.length > 0 && (
                <motion.p className="wl-auth-field-success" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><CheckCircle2 size={12} /> Passwords match</motion.p>
              )}
            </div>

            <div className="wl-auth-opts">
              <label className="wl-auth-check">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <span className="wl-auth-checkmark" /><span>I agree to the <button type="button" className="wl-auth-link-inline" onClick={() => {}}>Terms of Service</button></span>
              </label>
            </div>

            <AuthButton loading={loading} loadingText="Creating Account..." delay={0.3}>
              Create Account
            </AuthButton>
          </form>
        ) : (
          <div className="wl-auth-success-msg">
            <p>Redirecting to login...</p>
          </div>
        )}
      </AuthCard>
    </div>
  )
}

export default Register
