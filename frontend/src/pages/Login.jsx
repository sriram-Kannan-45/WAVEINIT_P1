import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, ArrowRight, Eye, EyeOff, GraduationCap,
  Loader2, Lock, Mail, Shield, User, ChevronRight, CheckCircle2,
  Brain, BarChart3, Code, ShieldCheck, ClipboardCheck, Award,
  BookOpen, Bot, Users, ScrollText, BarChart2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API } from '../api/api'
import { useToast } from '../components/Toast'

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

const WHY_CHOOSE = [
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

  const ease = [0.22, 1, 0.36, 1]

  return (
    <div className="wl">
      <style>{css}</style>

      <div className="wl-panel">
        <div className="wl-dots" />
        <div className="wl-mesh" />
        <div className="wl-orb wl-orb-1" />
        <div className="wl-orb wl-orb-2" />
        <div className="wl-orb wl-orb-3" />

        <div className="wl-geo wl-geo-1" />
        <div className="wl-geo wl-geo-2" />
        <div className="wl-geo wl-geo-3" />
        <div className="wl-geo wl-geo-4" />

        <svg className="wl-wave-lines" viewBox="0 0 1400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,100 C200,40 400,160 700,80 C1000,0 1200,140 1400,60" fill="none" stroke="rgba(22,163,74,0.04)" strokeWidth="1.5"/>
          <path d="M0,130 C250,70 450,180 750,100 C1050,20 1250,160 1400,90" fill="none" stroke="rgba(22,163,74,0.03)" strokeWidth="1"/>
          <path d="M0,160 C300,100 500,190 800,120 C1100,50 1300,170 1400,110" fill="none" stroke="rgba(22,163,74,0.025)" strokeWidth="1"/>
        </svg>

        <motion.div className="wl-left-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease }}>

          <motion.div className="wl-top" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease }}>
            <div className="wl-top-logo">
              <div className="wl-top-logo-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </div>
              <span className="wl-top-logo-text">Wave Init</span>
            </div>
            <span className="wl-badge">Enterprise Learning Platform</span>
          </motion.div>

          <motion.div className="wl-heading-wrap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease }}>
            <h1 className="wl-heading">
              <span className="wl-heading-line">Train.</span>
              <span className="wl-heading-line">Assess.</span>
              <span className="wl-heading-line">Certify.</span>
              <span className="wl-heading-line"><span className="wl-heading-green">Scale.</span></span>
            </h1>
            <p className="wl-subtitle">Modern Learning Infrastructure<br />for <span className="wl-subtitle-green">Enterprises</span>.</p>
          </motion.div>

          <motion.p className="wl-desc" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35, ease }}>
            Empower organizations with AI-powered learning, assessments, certifications, coding challenges, analytics and enterprise-grade training management from one secure platform.
          </motion.p>

          <motion.div className="wl-chips" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45, ease }}>
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return <span key={i} className="wl-chip"><Icon size={13} />{f.label}</span>
            })}
          </motion.div>

          <motion.div className="wl-why" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.55, ease }}>
            <h2 className="wl-why-title">Why Choose <span>Wave Init</span>?</h2>
            <div className="wl-features-grid">
              {WHY_CHOOSE.map((f, i) => {
                const Icon = f.icon
                return (
                  <motion.div key={i} className="wl-feature-card"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.6 + i * 0.06, ease }}>
                    <div className="wl-feature-icon"><Icon size={20} /></div>
                    <h3 className="wl-feature-title">{f.title}</h3>
                    <p className="wl-feature-desc">{f.desc}</p>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>

        </motion.div>

        <motion.div className="wl-bottom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.8, ease }}>
          <span className="wl-copyright">&copy; 2026 Wave Init</span>
          <div className="wl-services">
            <span>AI Software Development</span>
            <span className="wl-svc-dot" />
            <span>Web Development</span>
            <span className="wl-svc-dot" />
            <span>GenAI Solutions</span>
          </div>
        </motion.div>

      </div>

      <div className="wl-form">
        <motion.div className="wl-card" initial={{ opacity: 0, y: 32, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.75, delay: 0.15, ease }}>
          <div className="wl-card-head">
            <div className="wl-card-logo">
              <div className="wl-card-logo-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </div>
              <span className="wl-card-logo-text">Wave Init</span>
            </div>
            <h2>Welcome Back</h2>
            <p>Sign in to continue to your workspace</p>
          </div>

          <div className="wl-roles" role="tablist">
            {ROLES.map(r => {
              const Icon = r.icon; const on = form.role === r.key
              return (
                <button key={r.key} role="tab" aria-selected={on} className={`wl-role${on ? ' wl-role-on' : ''}`}
                  onClick={() => { setForm(p => ({ ...p, role: r.key })); localStorage.setItem('lastRole', r.key); setError('') }}>
                  <Icon size={14} />{r.label}
                </button>
              )
            })}
            <div className="wl-role-slider" style={{ left: form.role === 'PARTICIPANT' ? '0%' : form.role === 'TRAINER' ? '33.333%' : '66.666%' }} />
          </div>

          <div className="wl-err-space">
            <AnimatePresence>
              {error && (
                <motion.div className="wl-err" role="alert" initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -6, height: 0 }} transition={{ duration: 0.25 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} /><span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-email">Username or Email</label>
              <div className="wl-inp-wrap" data-focus={focusedField === 'email' ? '1' : '0'}>
                <span className="wl-inp-icon"><Mail size={16} /></span>
                <input id="wl-email" className="wl-inp" type="text" value={form.email}
                  onChange={e => set('email', e.target.value)} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                  placeholder={activeRole.placeholder} autoComplete="username" spellCheck={false} />
                {form.email && (
                  <motion.span className="wl-check-icon" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                    <CheckCircle2 size={15} />
                  </motion.span>
                )}
              </div>
            </div>

            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-pw">Password</label>
              <div className="wl-inp-wrap" data-focus={focusedField === 'password' ? '1' : '0'}>
                <span className="wl-inp-icon"><Lock size={16} /></span>
                <input id="wl-pw" className="wl-inp" type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={e => set('password', e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password" autoComplete="current-password" />
                <motion.button type="button" tabIndex={-1} className="wl-eye" onClick={() => setShowPassword(v => !v)}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <AnimatePresence mode="wait">
                    <motion.span key={showPassword ? 'off' : 'on'} initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>

            <div className="wl-opts">
              <label className="wl-check">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                <span className="wl-checkmark" /><span>Remember me</span>
              </label>
              <button type="button" className="wl-forgot" onClick={() => navigate('/forgot-password')}>Forgot password?</button>
            </div>

            <motion.button type="submit" disabled={loading} className="wl-cta"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4, ease }}
              whileHover={{ scale: loading ? 1 : 1.012 }} whileTap={{ scale: loading ? 1 : 0.985 }}>
              {loading ? (<><Loader2 size={18} className="wl-spin" /><span>Signing in...</span></>)
                : (<><span>Sign in as {activeRole.label}</span><ArrowRight size={18} /></>)}
            </motion.button>
          </form>

          {form.role === 'PARTICIPANT' && (
            <p className="wl-foot">
              Don't have an account?{' '}
              <button type="button" className="wl-foot-link" onClick={() => navigate('/register')}>Create one <ChevronRight size={13} /></button>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  )
}

const css = `
.wl,.wl *::before,.wl *::after{box-sizing:border-box;margin:0;padding:0}
.wl{width:100vw;height:100dvh;display:flex;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;position:relative;background:#fff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

/* ═══ LEFT BRANDING PANEL ═══ */
.wl-panel{flex:0 0 55%;display:flex;flex-direction:column;justify-content:space-between;padding:48px 64px 40px 72px;position:relative;overflow:hidden;background:#fff}
.wl-dots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(22,163,74,.04) .5px,transparent .5px);background-size:28px 28px;pointer-events:none;z-index:0}
.wl-mesh{position:absolute;inset:0;pointer-events:none;z-index:0;background:
  radial-gradient(ellipse at 8% 15%,rgba(22,163,74,.06) 0%,transparent 55%),
  radial-gradient(ellipse at 92% 85%,rgba(22,163,74,.04) 0%,transparent 55%),
  radial-gradient(ellipse at 50% 50%,rgba(22,163,74,.015) 0%,transparent 65%)}
.wl-orb{position:absolute;border-radius:50%;filter:blur(100px);pointer-events:none;opacity:.25;z-index:0}
.wl-orb-1{width:440px;height:440px;top:-100px;left:-80px;background:radial-gradient(circle,rgba(22,163,74,.07) 0%,transparent 70%);animation:wlorb 16s ease-in-out infinite}
.wl-orb-2{width:340px;height:340px;bottom:-60px;right:-40px;background:radial-gradient(circle,rgba(22,163,74,.05) 0%,transparent 70%);animation:wlorb 18s ease-in-out infinite reverse}
.wl-orb-3{width:240px;height:240px;top:45%;left:35%;background:radial-gradient(circle,rgba(22,163,74,.03) 0%,transparent 70%);animation:wlorb 12s ease-in-out infinite 3s}
@keyframes wlorb{0%,100%{transform:scale(1);opacity:.2}50%{transform:scale(1.08);opacity:.35}}
.wl-geo{position:absolute;pointer-events:none;opacity:.35;z-index:0}
.wl-geo-1{top:14%;right:18%;width:20px;height:20px;border:1.5px solid rgba(22,163,74,.1);border-radius:5px;transform:rotate(15deg);animation:wlfGeo 8s ease-in-out infinite}
.wl-geo-2{bottom:20%;left:22%;width:16px;height:16px;border:1.5px solid rgba(22,163,74,.08);border-radius:50%;animation:wlfGeo 10s ease-in-out infinite 2s}
.wl-geo-3{top:35%;left:6%;width:12px;height:12px;border:1.5px solid rgba(22,163,74,.06);border-radius:3px;transform:rotate(45deg);animation:wlfGeo 9s ease-in-out infinite 1s}
.wl-geo-4{bottom:30%;right:12%;width:18px;height:18px;border:1.5px solid rgba(22,163,74,.08);border-radius:4px;transform:rotate(30deg);animation:wlfGeo 11s ease-in-out infinite 4s}
@keyframes wlfGeo{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.wl-wave-lines{position:absolute;bottom:0;left:0;width:100%;height:180px;pointer-events:none;z-index:0}

.wl-left-content{position:relative;z-index:1;display:flex;flex-direction:column;gap:28px;flex:1;justify-content:center}

/* ── Top bar ── */
.wl-top{display:flex;align-items:center;gap:16px}
.wl-top-logo{display:flex;align-items:center;gap:8px}
.wl-top-logo-mark{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 2px 6px rgba(22,163,74,.2)}
.wl-top-logo-text{font-size:15px;font-weight:700;color:#111827;letter-spacing:-.02em}
.wl-badge{padding:4px 12px;border-radius:999px;font-size:11px;font-weight:600;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;letter-spacing:.03em;text-transform:uppercase}

/* ── Heading ── */
.wl-heading-wrap{display:flex;flex-direction:column;gap:16px}
.wl-heading{font-family:'Inter',sans-serif;font-size:52px;font-weight:800;line-height:1.05;letter-spacing:-.04em;color:#111827;margin:0;display:flex;flex-direction:column}
.wl-heading-line{display:block}
.wl-heading-green{color:#16a34a}
.wl-subtitle{font-size:18px;font-weight:500;color:#6b7280;line-height:1.5;margin:0}
.wl-subtitle-green{color:#16a34a;font-weight:600}

/* ── Description ── */
.wl-desc{font-size:16px;line-height:1.7;color:#6b7280;max-width:500px;margin:0}

/* ── Feature chips ── */
.wl-chips{display:flex;gap:8px;flex-wrap:wrap}
.wl-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(22,163,74,.04);border:1px solid rgba(22,163,74,.1);color:#15803d;letter-spacing:.01em;transition:all .2s ease}
.wl-chip:hover{background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.18);transform:translateY(-1px)}
.wl-chip svg{flex-shrink:0;opacity:.8}

/* ── Why Choose ── */
.wl-why{display:flex;flex-direction:column;gap:16px}
.wl-why-title{font-family:'Inter',sans-serif;font-size:18px;font-weight:700;color:#111827;margin:0;letter-spacing:-.02em}
.wl-why-title span{color:#16a34a}
.wl-features-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.wl-feature-card{background:#fff;border:1px solid #f3f4f6;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:10px;transition:all .3s cubic-bezier(.16,1,.3,1);box-shadow:0 1px 3px rgba(0,0,0,.03)}
.wl-feature-card:hover{box-shadow:0 8px 24px rgba(15,23,42,.07);transform:translateY(-3px);border-color:#e5e7eb}
.wl-feature-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#f0fdf4;color:#16a34a;flex-shrink:0}
.wl-feature-title{font-size:14px;font-weight:700;color:#111827;margin:0;letter-spacing:-.01em}
.wl-feature-desc{font-size:13px;line-height:1.55;color:#6b7280;margin:0}

/* ── Bottom ── */
.wl-bottom{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;padding-top:20px;border-top:1px solid #f3f4f6}
.wl-copyright{font-size:12px;color:#9ca3af;font-weight:500}
.wl-services{display:flex;align-items:center;gap:10px}
.wl-services span{font-size:12px;color:#9ca3af;font-weight:500}
.wl-svc-dot{width:3px;height:3px;border-radius:50%;background:#d1d5db;flex-shrink:0}

/* ═══ RIGHT FORM PANEL ═══ */
.wl-form{flex:0 0 45%;display:flex;align-items:center;justify-content:center;padding:40px;position:relative;overflow-y:auto;background:#fff}

/* ═══ LOGIN CARD ═══ */
.wl-card{width:100%;max-width:500px;background:#fff;border:none;border-radius:30px;box-shadow:0 30px 80px rgba(15,23,42,.08);position:relative;z-index:1;padding:48px;transition:box-shadow .45s cubic-bezier(.16,1,.3,1),transform .45s cubic-bezier(.16,1,.3,1)}
.wl-card:hover{box-shadow:0 36px 90px rgba(15,23,42,.11);transform:translateY(-3px)}
.wl-card-head{margin-bottom:32px}
.wl-card-logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.wl-card-logo-mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 12px rgba(22,163,74,.25)}
.wl-card-logo-text{font-size:18px;font-weight:700;color:#111827;letter-spacing:-.02em}
.wl-card-head h2{font-family:'Poppins',sans-serif;font-size:40px;font-weight:700;color:#111827;letter-spacing:-.035em;margin-bottom:8px;line-height:1.1}
.wl-card-head p{font-size:16px;color:#6b7280;margin:0;line-height:1.4}

/* ── Role segmented control ── */
.wl-roles{display:flex;position:relative;padding:4px;background:#f9fafb;border:1px solid #f3f4f6;border-radius:14px;margin-bottom:20px}
.wl-role{flex:1;height:44px;border-radius:11px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;color:#6b7280;transition:color .3s ease;position:relative;z-index:1}
.wl-role svg{width:14px;height:14px}
.wl-role-on{color:#fff}
.wl-role:hover:not(.wl-role-on){color:#374151}
.wl-role-slider{position:absolute;top:4px;left:4px;width:calc(33.333% - 2.67px);height:calc(100% - 8px);background:linear-gradient(135deg,#16a34a,#15803d);border-radius:11px;transition:left .35s cubic-bezier(.16,1,.3,1);box-shadow:0 2px 8px rgba(22,163,74,.25);z-index:0}

/* ── Error ── */
.wl-err-space{min-height:8px;margin-bottom:8px}
.wl-err{display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:13px;font-weight:500}

/* ── Fields ── */
.wl-field{margin-bottom:20px}
.wl-label{display:block;font-size:14px;font-weight:600;color:#374151;margin-bottom:8px;letter-spacing:.01em}
.wl-inp-wrap{position:relative;display:flex;align-items:center;border:1.5px solid #e5e7eb;border-radius:14px;background:#fafafa;transition:border-color .25s,box-shadow .25s,background .25s}
.wl-inp-wrap:hover{border-color:#d1d5db;background:#f9fafb}
.wl-inp-wrap[data-focus="1"]{border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.08);background:#fff}
.wl-inp-icon{position:absolute;left:16px;color:#9ca3af;display:flex;align-items:center;pointer-events:none;transition:color .25s}
.wl-inp-wrap[data-focus="1"] .wl-inp-icon{color:#16a34a}
.wl-inp{width:100%;height:54px;padding:0 48px 0 46px;border:none;font-family:'Inter',sans-serif;font-size:15px;color:#111827;background:transparent;outline:none;border-radius:0}
.wl-inp::placeholder{color:#9ca3af;font-weight:400}
.wl-inp:-webkit-autofill{-webkit-text-fill-color:#111827!important;-webkit-box-shadow:0 0 0 30px #fff inset!important;transition:background-color 5000s ease-in-out 0s}
.wl-check-icon{position:absolute;right:48px;color:#16a34a;display:flex;align-items:center}
.wl-eye{position:absolute;right:12px;background:none;border:none;cursor:pointer;color:#9ca3af;display:flex;align-items:center;padding:8px;border-radius:8px;transition:color .15s,background .15s}
.wl-eye:hover{color:#374151;background:#f3f4f6}

/* ── Options ── */
.wl-opts{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
.wl-check{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:#374151;font-weight:500;user-select:none;position:relative}
.wl-check input[type="checkbox"]{position:absolute;opacity:0;width:0;height:0}
.wl-checkmark{width:18px;height:18px;border:1.5px solid #d1d5db;border-radius:5px;display:flex;align-items:center;justify-content:center;background:#fff;flex-shrink:0;transition:all .2s ease}
.wl-check:hover .wl-checkmark{border-color:#9ca3af}
.wl-check input:checked+.wl-checkmark{background:#16a34a;border-color:#16a34a}
.wl-check input:checked+.wl-checkmark::after{content:'';width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg);margin-top:-1px}
.wl-forgot{background:none;border:none;font-size:14px;font-weight:600;color:#16a34a;cursor:pointer;padding:0;transition:color .15s}
.wl-forgot:hover{text-decoration:underline;color:#15803d}

/* ── CTA Button ── */
.wl-cta{width:100%;height:54px;border-radius:14px;border:none;background:linear-gradient(135deg,#16a34a 0%,#15803d 50%,#166534 100%);background-size:200% 200%;background-position:0% 50%;color:#fff;font-size:16px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background-position .5s,box-shadow .35s,transform .2s;box-shadow:0 4px 14px rgba(22,163,74,.3),0 1px 3px rgba(22,163,74,.15);position:relative;overflow:hidden;letter-spacing:.01em}
.wl-cta::before{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 0%,transparent 35%,rgba(255,255,255,.18) 50%,transparent 65%,transparent 100%);transform:translateX(-100%);transition:transform .6s ease}
.wl-cta:hover:not(:disabled){background-position:100% 50%;box-shadow:0 8px 24px rgba(22,163,74,.35),0 2px 6px rgba(22,163,74,.15);transform:translateY(-1px)}
.wl-cta:hover:not(:disabled)::before{transform:translateX(100%)}
.wl-cta:active:not(:disabled){transform:translateY(0);box-shadow:0 2px 8px rgba(22,163,74,.25)}
.wl-cta:disabled{opacity:.6;cursor:not-allowed}
.wl-cta svg{width:18px;height:18px}
.wl-spin{animation:wlRot .7s linear infinite}
@keyframes wlRot{to{transform:rotate(360deg)}}

/* ── Footer ── */
.wl-foot{margin-top:28px;text-align:center;font-size:14px;color:#9ca3af}
.wl-foot-link{color:#16a34a;font-weight:600;cursor:pointer;background:none;border:none;padding:0;display:inline-flex;align-items:center;gap:2px;transition:color .15s;font-size:14px}
.wl-foot-link:hover{text-decoration:underline;color:#15803d}

/* ═══ RESPONSIVE ═══ */
@media(max-width:1440px){.wl-panel{padding:44px 56px 36px 64px}.wl-heading{font-size:46px}}
@media(max-width:1200px){.wl-panel{padding:40px 48px 32px 56px}.wl-heading{font-size:40px}.wl-desc{font-size:15px}.wl-card{max-width:480px;padding:44px}.wl-card-head h2{font-size:34px}.wl-features-grid{gap:10px}.wl-feature-card{padding:16px}}
@media(max-width:1024px){.wl{flex-direction:column;overflow-y:auto;height:auto;min-height:100dvh}.wl-panel{flex:none;padding:40px 32px 32px;text-align:center;align-items:center;gap:24px}.wl-left-content{align-items:center;gap:24px}.wl-top{justify-content:center}.wl-heading{align-items:center;font-size:36px}.wl-desc{text-align:center}.wl-chips{justify-content:center}.wl-features-grid{max-width:480px;margin:0 auto}.wl-bottom{flex-direction:column;gap:8px;text-align:center}.wl-services{justify-content:center}.wl-form{flex:none;padding:32px 32px 48px;align-items:flex-start}.wl-card{max-width:500px}.wl-card-head h2{font-size:30px}}
@media(max-width:768px){.wl-panel{padding:28px 20px 24px}.wl-heading{font-size:32px}.wl-subtitle{font-size:15px}.wl-desc{font-size:14px}.wl-chip{font-size:11px;padding:5px 10px}.wl-features-grid{gap:8px}.wl-feature-card{padding:14px;gap:8px}.wl-feature-icon{width:34px;height:34px;border-radius:10px}.wl-feature-icon svg{width:17px;height:17px}.wl-feature-title{font-size:13px}.wl-feature-desc{font-size:12px}.wl-form{padding:20px 16px 36px}.wl-card{padding:32px 28px;border-radius:24px}.wl-card-head h2{font-size:26px}.wl-card-head p{font-size:14px}.wl-roles{flex-direction:column;gap:4px}.wl-role{height:42px}.wl-role-slider{display:none}.wl-role-on{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border:none;box-shadow:0 2px 8px rgba(22,163,74,.25)}.wl-inp{height:48px}.wl-cta{height:50px;font-size:15px}}
@media(max-width:480px){.wl-panel{padding:24px 16px 20px}.wl-heading{font-size:28px}.wl-features-grid{grid-template-columns:1fr;max-width:320px;margin:0 auto}.wl-bottom{flex-direction:column;gap:6px}.wl-form{padding:16px 12px 28px}.wl-card{padding:28px 22px;border-radius:20px}.wl-card-head h2{font-size:24px}.wl-opts{flex-direction:column;gap:12px;align-items:flex-start}}
@media(prefers-reduced-motion:reduce){.wl *,.wl *::before,.wl *::after{animation:none!important;transition:none!important}}
`
