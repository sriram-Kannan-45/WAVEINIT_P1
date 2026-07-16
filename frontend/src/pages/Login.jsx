import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, GraduationCap, Shield, User, ChevronRight,
  Brain, BarChart3, Code, ShieldCheck, ClipboardCheck, Award,
  BookOpen, Bot, Users, ScrollText, BarChart2, Mail, Lock
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API } from '../api/api'
import { useToast } from '../components/Toast'
import { AuthLayout, AuthCard, AuthInput, PasswordInput, RoleSelector, AuthButton } from '../components/auth'

const ease = [0.22, 1, 0.36, 1]

const ROLES = [
  { key: 'PARTICIPANT', label: 'Learner', icon: GraduationCap, placeholder: 'learner_username' },
  { key: 'TRAINER', label: 'Trainer', icon: Shield, placeholder: 'trainer_username' },
  { key: 'ADMIN', label: 'Admin', icon: User, placeholder: 'admin_username' },
]

const FEATURES = [
  { icon: Brain, label: 'AI Powered' },
  { icon: ClipboardCheck, label: 'Live Assessments' },
  { icon: Code, label: 'Coding Platform' },
  { icon: ShieldCheck, label: 'Enterprise Security' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Award, label: 'Certifications' },
]

const CARDS = [
  { icon: BookOpen, title: 'Course Management', desc: 'Create and manage structured learning programs.' },
  { icon: Bot, title: 'AI Assessments', desc: 'Generate quizzes and coding challenges using AI.' },
  { icon: Users, title: 'Trainer Management', desc: 'Assign trainers and monitor learner progress.' },
  { icon: ScrollText, title: 'Certificates', desc: 'Issue secure digital certificates after completion.' },
  { icon: BarChart2, title: 'Analytics Dashboard', desc: 'Track performance, progress, and learning insights.' },
  { icon: Shield, title: 'Enterprise Security', desc: 'Role-based access, secure authentication, and data protection.' },
]

export default function LoginPage({ onLogin, defaultRole }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { success: showSuccess } = useToast()
  const [form, setForm] = useState(() => {
    const lastRole = localStorage.getItem('lastRole') || 'PARTICIPANT'
    const stateRole = location.state?.fromRole
    return { email: '', password: '', role: defaultRole || stateRole || lastRole }
  })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState(null)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const activeRole = ROLES.find(r => r.key === form.role) || ROLES[0]

  useEffect(() => {
    const prev = { html: document.documentElement.style.overflow, body: document.body.style.overflow }
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const email = localStorage.getItem('rememberedEmail')
    if (localStorage.getItem('rememberMe') === 'true' && email) {
      setForm(p => ({ ...p, email }))
      setRememberMe(true)
    }
    return () => { document.documentElement.style.overflow = prev.html; document.body.style.overflow = prev.body }
  }, [])

  useEffect(() => {
    if (defaultRole) setForm(p => ({ ...p, role: defaultRole }))
    else if (location.state?.fromRole) setForm(p => ({ ...p, role: location.state.fromRole }))
  }, [defaultRole, location.state?.fromRole])

  useEffect(() => { if (location.state?.message) showSuccess(location.state.message) }, [location.state, showSuccess])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email) return setError('Username or Email is required')
    if (!form.password) return setError('Password is required')
    setLoading(true)
    try {
      const res = await fetch(API.LOGIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      let data
      try { data = await res.json() } catch { throw new Error('Server error or unavailable. Please try again.') }
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('user', JSON.stringify(data))
      localStorage.setItem('lastRole', form.role)
      if (rememberMe) { localStorage.setItem('rememberMe', 'true'); localStorage.setItem('rememberedEmail', form.email) }
      else { localStorage.removeItem('rememberMe'); localStorage.removeItem('rememberedEmail') }
      onLogin(data)
      const role = data?.role?.toLowerCase()
      if (role === 'admin') navigate('/admin', { replace: true })
      else if (role === 'trainer') navigate('/trainer', { replace: true })
      else if (role === 'participant') navigate('/participant', { replace: true })
      else navigate('/', { replace: true })
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message)
    } finally { setLoading(false) }
  }

  const heading = (
    <h1 className="wl-auth-heading">
      <span className="wl-auth-heading-line">Train.</span>
      <span className="wl-auth-heading-line">Assess.</span>
      <span className="wl-auth-heading-line">Certify.</span>
      <span className="wl-auth-heading-line"><span className="wl-auth-heading-green">Scale.</span></span>
    </h1>
  )

  const subtitle = (
    <p className="wl-auth-subtitle">
      Modern Learning Infrastructure<br />for <span className="wl-auth-subtitle-green">Enterprises</span>.
    </p>
  )

  return (
    <div className="wl-auth">
      <AuthLayout
        heading={heading}
        subtitle={subtitle}
        description="Empower organizations with AI-powered learning, assessments, certifications, coding challenges, analytics and enterprise-grade training management from one secure platform."
        features={FEATURES}
        cards={CARDS}
      />

      <AuthCard
        title="Welcome Back"
        subtitle="Sign in to continue to your workspace"
        footer={
          form.role === 'PARTICIPANT' && (
            <>
              Don't have an account?{' '}
              <button type="button" className="wl-auth-foot-link" onClick={() => navigate('/register')}>
                Create one <ChevronRight size={13} />
              </button>
            </>
          )
        }
      >
        <RoleSelector
          roles={ROLES}
          value={form.role}
          onChange={(key) => { setForm(p => ({ ...p, role: key })); localStorage.setItem('lastRole', key); setError('') }}
        />

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
          </AnimatePresence>
        </div>

        <form onSubmit={handleSubmit}>
          <AuthInput
            id="wl-email"
            label="Username or Email"
            icon={Mail}
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder={activeRole.placeholder}
            autoComplete="username"
            focused={focusedField === 'email'}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            validationIcon={form.email ? <CheckCircle2 size={16} /> : null}
          />

          <PasswordInput
            id="wl-pw"
            label="Password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            focused={focusedField === 'password'}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            show={showPassword}
            onToggle={() => setShowPassword(v => !v)}
          />

          <div className="wl-auth-opts">
            <label className="wl-auth-check">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              <span className="wl-auth-checkmark" /><span>Remember me</span>
            </label>
            <button type="button" className="wl-auth-forgot" onClick={() => navigate('/forgot-password')}>Forgot password?</button>
          </div>

          <AuthButton loading={loading} loadingText="Signing in...">
            Sign in as {activeRole.label}
          </AuthButton>
        </form>
      </AuthCard>
    </div>
  )
}
