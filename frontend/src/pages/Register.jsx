import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Mail, Phone, Lock, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { API } from '../api/api'

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.5 } },
  exit: { opacity: 0 }
}

function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  
  const navigate = useNavigate()
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch(API.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      
      setSuccess('Registration successful! Your account is pending admin approval.')
      setForm({ name: '', email: '', password: '', phone: '' })
      
      setTimeout(() => {
        navigate('/login', { state: { message: 'Your account is pending admin approval. You will be notified by email once approved!' } })
      }, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div 
      variants={pageVariants} 
      initial="initial" 
      animate="animate" 
      exit="exit"
      className="auth-layout"
    >
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
              Start your<br />
              <span style={{ background: 'linear-gradient(135deg, #059669, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Learning Journey
              </span>
            </h1>
            <p className="auth-layout__hero-subtitle">
              Join thousands of learners advancing their careers through our comprehensive training platform.
            </p>
          </motion.div>

          <motion.div
            style={{ marginTop: '48px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {[
              'Access 100+ expert-led courses',
              'Earn industry-recognized certificates',
              'Join a global learning community',
              'Track your progress in real-time'
            ].map((feature, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '6px', 
                  background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <CheckCircle2 size={14} color="white" />
                </div>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>{feature}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right Side — Registration Form */}
      <div className="auth-layout__right">
        <motion.div 
          className="auth-card"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="auth-card__header">
            <h2 className="auth-card__title">Create your account</h2>
            <p className="auth-card__subtitle">Join as a participant to start learning</p>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                className="alert alert--error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div 
                className="alert alert--success"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <CheckCircle2 size={16} />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {!success ? (
            <form onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="reg-name" className="field-label">Full Name</label>
                <div className="field-input-wrap">
                  <User size={16} className="field-input-icon" />
                  <input
                    id="reg-name"
                    type="text"
                    className="field-input"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    required
                    placeholder="John Doe"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="reg-email" className="field-label">Email Address</label>
                <div className="field-input-wrap">
                  <Mail size={16} className="field-input-icon" />
                  <input
                    id="reg-email"
                    type="email"
                    className="field-input"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    required
                    placeholder="john@example.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="reg-phone" className="field-label">Phone Number</label>
                <div className="field-input-wrap">
                  <Phone size={16} className="field-input-icon" />
                  <input
                    id="reg-phone"
                    type="tel"
                    className="field-input"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    required
                    placeholder="e.g., 9876543210"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="reg-password" className="field-label">Password</label>
                <div className="field-input-wrap">
                  <Lock size={16} className="field-input-icon" />
                  <input
                    id="reg-password"
                    type="password"
                    className="field-input"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    required
                    placeholder="Minimum 6 characters"
                    minLength={6}
                    disabled={loading}
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                className="btn-enterprise btn-enterprise--primary btn-enterprise--full"
                style={{ marginTop: '8px', background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.01 }}
                whileTap={{ scale: loading ? 1 : 0.99 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </motion.button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: '14px', color: '#667085', lineHeight: 1.6, margin: 0 }}>
                Redirecting to login...
              </p>
            </div>
          )}

          <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: '#667085' }}>
            Already registered?{' '}
            <button
              type="button"
              className="btn-enterprise btn-enterprise--ghost"
              style={{ padding: 0, fontSize: '13px', fontWeight: 700, color: '#059669' }}
              onClick={() => navigate('/login')}
              disabled={loading}
            >
              Sign In
            </button>
          </p>
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
    </motion.div>
  )
}

export default Register
