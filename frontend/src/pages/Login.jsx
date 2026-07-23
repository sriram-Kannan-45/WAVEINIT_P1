import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, LogIn, Eye, EyeOff, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '../api/api';
import { useToast } from '../components/Toast';
import AuthLayout from '../components/auth/AuthLayout';
import AuthCard from '../components/auth/AuthCard';
import RoleSelector from '../components/auth/RoleSelector';
import AuthButton from '../components/auth/AuthButton';

const ROLES = [
  { id: 'ADMIN', label: 'Admin', icon: '🛡️', placeholder: 'admin_username' },
  { id: 'TRAINER', label: 'Trainer', icon: '📖', placeholder: 'trainer_username' },
  { id: 'PARTICIPANT', label: 'Learner', icon: '🎓', placeholder: 'learner_username' },
];

export default function Login({ onLogin, defaultRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { success: showSuccess } = useToast();

  const [form, setForm] = useState(() => {
    const lastRole = localStorage.getItem('lastRole') || 'PARTICIPANT';
    const stateRole = location.state?.fromRole;
    return { email: '', password: '', role: defaultRole || stateRole || lastRole };
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const activeRole = ROLES.find(r => r.id === form.role) || ROLES[2];

  useEffect(() => {
    const prev = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const email = localStorage.getItem('rememberedEmail');
    if (localStorage.getItem('rememberMe') === 'true' && email) {
      setForm(p => ({ ...p, email }));
      setRememberMe(true);
    }
    return () => { document.documentElement.style.overflow = prev.html; document.body.style.overflow = prev.body; };
  }, []);

  useEffect(() => {
    if (defaultRole) setForm(p => ({ ...p, role: defaultRole }));
    else if (location.state?.fromRole) setForm(p => ({ ...p, role: location.state.fromRole }));
  }, [defaultRole, location.state?.fromRole]);

  useEffect(() => {
    if (location.state?.message) showSuccess(location.state.message);
  }, [location.state, showSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email) return setError('Username or Email is required');
    if (!form.password) return setError('Password is required');

    setLoading(true);
    try {
      const res = await fetch(API.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('Server error or unavailable. Please try again.'); }
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('user', JSON.stringify(data));
      localStorage.setItem('lastRole', form.role);
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('rememberedEmail', form.email);
      } else {
        localStorage.removeItem('rememberMe');
        localStorage.removeItem('rememberedEmail');
      }
      onLogin(data);

      const role = data?.role?.toLowerCase();
      if (role === 'admin') navigate('/admin', { replace: true });
      else if (role === 'trainer') navigate('/trainer', { replace: true });
      else if (role === 'participant') navigate('/participant', { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthLayout />

      <AuthCard>
        <div className="auth-card-header">
          <motion.h2
            className="auth-card-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            Welcome Back
          </motion.h2>
          <motion.p
            className="auth-card-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Sign in to continue to your workspace
          </motion.p>
        </div>

        <RoleSelector
          roles={ROLES}
          activeRole={form.role}
          onRoleChange={(id) => {
            setForm(p => ({ ...p, role: id }));
            localStorage.setItem('lastRole', id);
            setError('');
          }}
        />

        <AnimatePresence>
          {error && (
            <motion.div className="auth-error" role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <AlertCircle className="auth-error-icon" size={18} />
              <span className="auth-error-text">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="login-email">Username or Email</label>
            <div className="auth-input-wrapper">
              <input
                id="login-email"
                className="auth-form-input"
                type="text"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder={activeRole.placeholder}
                autoComplete="username"
                required
              />
              {form.email && (
                <span className="auth-input-icon" style={{ pointerEvents: 'none' }}>
                  <Mail size={18} />
                </span>
              )}
            </div>
          </div>

          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="login-password">Password</label>
            <div className="auth-input-wrapper">
              <input
                id="login-password"
                className="auth-form-input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-form-options">
            <label className="auth-checkbox-group">
              <input
                type="checkbox"
                className="auth-checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              <span className="auth-checkbox-label">Remember me</span>
            </label>
            <button type="button" className="auth-forgot-link" onClick={() => navigate('/forgot-password')}>
              Forgot password?
            </button>
          </div>

          <AuthButton type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="auth-spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in as {activeRole.label}</span>
                <LogIn size={18} />
              </>
            )}
          </AuthButton>
        </form>

        {form.role === 'PARTICIPANT' && (
          <div className="auth-card-footer">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit' }}
              onClick={() => navigate('/register')}
            >
              Create one
            </button>
          </div>
        )}
      </AuthCard>
    </div>
  );
}
