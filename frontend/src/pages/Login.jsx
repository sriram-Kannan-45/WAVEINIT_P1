import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Eye, EyeOff, Mail, Lock,
  CheckCircle2, AlertCircle, ArrowRight, Loader2,
  User, Shield, GraduationCap, BookOpen, BarChart3, Award, Sparkles
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { API } from '../api/api'

const roles = [
  { 
    key: 'PARTICIPANT', 
    label: 'Participant', 
    color: '#059669', 
    gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    subtitle: 'Access your courses and track your learning progress',
    placeholder: 'participant_username',
    icon: GraduationCap,
    features: ['Access course materials', 'Track your progress', 'Earn certificates']
  },
  { 
    key: 'TRAINER', 
    label: 'Trainer', 
    color: '#0D9488', 
    gradient: 'linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)',
    subtitle: 'Manage your trainings and engage with learners',
    placeholder: 'trainer_username',
    icon: Shield,
    features: ['Create & manage courses', 'Track student progress', 'Provide feedback']
  },
  { 
    key: 'ADMIN', 
    label: 'Admin', 
    color: '#059669', 
    gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    subtitle: 'Full control over your learning platform',
    placeholder: 'admin_username',
    icon: User,
    features: ['Manage users & roles', 'Analytics & reports', 'Platform settings']
  }
]

const featureIcons = [BookOpen, BarChart3, Award]

const featureBgColors = [
  'rgba(5, 150, 105, 0.08)',
  'rgba(13, 148, 136, 0.08)',
  'rgba(16, 185, 129, 0.08)'
]

const featureColors = ['#059669', '#0D9488', '#10B981']

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0 }
}

const cardVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] } }
}

const socialProviders = [
  {
    name: 'Google',
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    )
  },
  {
    name: 'Microsoft',
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M1 1h10v10H1V1zm12 0h10v10H13V1zM1 13h10v10H1V13zm12 0h10v10H13V13z" fill="#F25022"/>
      </svg>
    )
  },
  {
    name: 'Apple',
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#000000"/>
      </svg>
    )
  }
]

export default function LoginPage({ onLogin, defaultRole }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { success: showSuccess } = useToast()

  const [form, setForm] = useState(() => {
    const lastRole = localStorage.getItem('lastRole') || 'PARTICIPANT'
    const stateRole = location.state?.fromRole
    return {
      email: '',
      password: '',
      role: defaultRole || stateRole || lastRole
    }
  })

  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlHeight = document.documentElement.style.height
    const prevBodyHeight = document.body.style.height
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'

    const remembered = localStorage.getItem('rememberedEmail')
    const remember = localStorage.getItem('rememberMe') === 'true'
    if (remember && remembered) {
      setForm(p => ({ ...p, email: remembered }))
      setRememberMe(true)
    }

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.height = prevHtmlHeight
      document.body.style.height = prevBodyHeight
    }
  }, [])

  useEffect(() => {
    if (defaultRole) {
      setForm(p => ({ ...p, role: defaultRole }))
    } else if (location.state?.fromRole) {
      setForm(p => ({ ...p, role: location.state.fromRole }))
    }
  }, [defaultRole, location.state?.fromRole])

  useEffect(() => {
    if (location.state?.message) {
      showSuccess(location.state.message)
    }
  }, [location.state, showSuccess])

  const activeRoleConfig = roles.find(r => r.key === form.role) || roles[0]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email) {
      setError('Username or Email is required')
      return
    }
    if (!form.password) {
      setError('Password is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(API.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      let data
      try { data = await res.json() } catch { throw new Error('Server error or unavailable. Please try again.') }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      localStorage.setItem('user', JSON.stringify(data))
      localStorage.setItem('lastRole', form.role)
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true')
        localStorage.setItem('rememberedEmail', form.email)
      } else {
        localStorage.removeItem('rememberMe')
        localStorage.removeItem('rememberedEmail')
      }

      onLogin(data)
      const role = data?.role?.toLowerCase()
      if (role === 'admin') navigate('/admin', { replace: true })
      else if (role === 'trainer') navigate('/trainer', { replace: true })
      else if (role === 'participant') navigate('/participant', { replace: true })
      else navigate('/', { replace: true })
    } catch (err) {
      const msg = err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="login-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* ── Left Panel: Marketing ──────────────────────────────── */}
      <div className="login-left">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="login-brand">
            <div className="login-brand__icon">W</div>
            <div>
              <div className="login-brand__name">Wave Init</div>
              <div className="login-brand__sub">Learning Management System</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="login-hero">
            <div className="login-badge">
              <Sparkles size={14} />
              Smart Learning Platform
            </div>
            <h1 className="login-heading">
              Empower Learning.<br />
              <span className="login-heading__gradient">Inspire Growth.</span>
            </h1>
            <p className="login-description">
              Modern learning platform helping individuals, teams and organizations
              build skills, track progress and achieve excellence.
            </p>
          </div>
        </motion.div>

        <motion.div
          className="login-features"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {activeRoleConfig.features.map((feature, idx) => {
            const FeatureIcon = featureIcons[idx] || CheckCircle2
            return (
              <div key={idx} className="login-feature">
                <div
                  className="login-feature__icon"
                  style={{
                    background: featureBgColors[idx],
                    color: featureColors[idx]
                  }}
                >
                  <FeatureIcon size={18} />
                </div>
                <span className="login-feature__text">{feature}</span>
              </div>
            )
          })}
        </motion.div>
      </div>

      {/* ── Right Panel: Login Form ────────────────────────────── */}
      <div className="login-right">
        <motion.div className="login-card" variants={cardVariants}>
          <div className="login-card__header">
            <h2 className="login-card__title">Welcome back</h2>
            <p className="login-card__subtitle">Sign in to continue to your account</p>
          </div>

          <div className="login-roles">
            {roles.map(r => {
              const Icon = r.icon
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setForm(p => ({ ...p, role: r.key }))
                    localStorage.setItem('lastRole', r.key)
                    setError('')
                  }}
                  className={`login-role-btn ${form.role === r.key ? 'active' : ''}`}
                >
                  <Icon size={16} style={{ marginRight: '8px' }} />
                  {r.label}
                </button>
              )
            })}
          </div>

          <div className="login-error" role="alert" aria-live="polite">
            <div className="login-error__msg" data-visible={error ? 'true' : 'false'}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label className="login-field__label" htmlFor="login-email">Username or Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <Mail size={18} />
                </span>
                <input
                  id="login-email"
                  type="text"
                  className="login-input"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder={activeRoleConfig.placeholder}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-field__label" htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="login-input-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="login-forgot"
              >
                Forgot password?
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="login-submit"
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.99 }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="login-spinner" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in as {activeRoleConfig.label}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </motion.button>
          </form>

          <div className="login-divider">
            <div className="login-divider__line" />
            <span className="login-divider__text">or continue with</span>
            <div className="login-divider__line" />
          </div>

          <div className="login-social">
            {socialProviders.map(provider => (
              <button
                key={provider.name}
                type="button"
                className="login-social-btn"
              >
                {provider.svg}
                {provider.name}
              </button>
            ))}
          </div>

          {form.role === 'PARTICIPANT' && (
            <p className="login-register">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="login-register__btn"
              >
                Create Account
              </button>
            </p>
          )}
        </motion.div>

        <p className="login-copyright">
          © {new Date().getFullYear()} Wave Init LMS. All rights reserved.
        </p>
      </div>
    </motion.div>
  )
}
