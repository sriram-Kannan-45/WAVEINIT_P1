import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User, Lock, ShieldCheck, BookOpen, GraduationCap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { API } from '../api/api';
import { useToast } from '../components/Toast';
import AuthLayout from '../components/auth/AuthLayout';
import AuthCard from '../components/auth/AuthCard';
import RoleSelector from '../components/auth/RoleSelector';
import AuthButton from '../components/auth/AuthButton';

const ROLES = [
  { id: 'ADMIN', label: 'Admin', icon: ShieldCheck, placeholder: 'Enter your email' },
  { id: 'TRAINER', label: 'Trainer', icon: BookOpen, placeholder: 'Enter your email' },
  { id: 'PARTICIPANT', label: 'Learner', icon: GraduationCap, placeholder: 'Enter your email' },
];

export default function Login({ onLogin, defaultRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { success: showSuccess, warning: showWarning, error: showError } = useToast();
  const displayedMessageRef = useRef(null);

  const [form, setForm] = useState(() => {
    const lastRole = localStorage.getItem('lastRole') || 'PARTICIPANT';
    const stateRole = location.state?.fromRole;
    return { email: '', password: '', role: defaultRole || stateRole || lastRole };
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const activeRole = ROLES.find(r => r.id === form.role) || ROLES[2];

  useEffect(() => {
    const prev = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { 
      document.documentElement.style.overflow = prev.html; 
      document.body.style.overflow = prev.body; 
    };
  }, []);

  useEffect(() => {
    if (defaultRole) setForm(p => ({ ...p, role: defaultRole }));
    else if (location.state?.fromRole) setForm(p => ({ ...p, role: location.state.fromRole }));
  }, [defaultRole, location.state?.fromRole]);

  useEffect(() => {
    if (location.state?.message && displayedMessageRef.current !== location.state.message) {
      displayedMessageRef.current = location.state.message;
      showSuccess(location.state.message);
      navigate(location.pathname, { replace: true, state: { ...location.state, message: undefined } });
    }
  }, [location.state, showSuccess, navigate, location.pathname]);

  const isEmailValid = form.email.trim().length > 3 && (form.email.includes('@') || form.email.length >= 4);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email) {
      showError('Username or Email is required');
      return;
    }
    if (!form.password) {
      showError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(API.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      let data;
      try { 
        data = await res.json(); 
      } catch { 
        throw new Error('Server error or unavailable. Please try again.'); 
      }
      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password');
      }

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
      showSuccess('Welcome back!', 'You have signed in successfully.');

      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach(w => showWarning(w));
      }

      const role = data?.role?.toLowerCase();
      if (role === 'admin') navigate('/admin', { replace: true });
      else if (role === 'trainer') navigate('/trainer', { replace: true });
      else if (role === 'participant') navigate('/participant', { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      const errorMsg = err.message === 'Failed to fetch' 
        ? 'Cannot connect to server.' 
        : (err.message || 'Invalid email or password');
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    showWarning('Enterprise SSO', 'Google SSO authentication is configured for enterprise domains.');
  };

  return (
    <div className="auth-page">
      <AuthLayout />

      <AuthCard className="auth-card--login">
        {/* Floating circular book badge at the top of the card */}
        <div className="auth-card-floating-badge">
          <BookOpen size={24} color="#127c34" strokeWidth={2.4} />
        </div>

        <div className="auth-card-inner">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Welcome Back</h2>
            <p className="auth-card-subtitle">Sign in to continue to your workspace</p>
          </div>

          <RoleSelector
            roles={ROLES}
            activeRole={form.role}
            onRoleChange={(id) => {
              setForm(p => ({ ...p, role: id }));
              localStorage.setItem('lastRole', id);
            }}
          />

          <form onSubmit={handleSubmit} autoComplete="on" className="auth-form-body">
            {/* Username or Email */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="login-email">Username or Email</label>
              <div className="auth-input-wrapper">
                <User size={16} className="auth-input-icon-left" />
                <input
                  id="login-email"
                  className="auth-form-input auth-form-input--has-icon-left auth-form-input--has-icon-right"
                  type="text"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="username"
                  required
                />
                {isEmailValid && (
                  <span className="auth-input-icon-valid" title="Valid input">
                    <CheckCircle2 size={16} color="#127c34" />
                  </span>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="login-password">Password</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon-left" />
                <input
                  id="login-password"
                  className="auth-form-input auth-form-input--has-icon-left auth-form-input--has-icon-right"
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
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
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

            {/* Primary Sign In Button */}
            <AuthButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in as {activeRole.label}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </AuthButton>
          </form>

          {/* Enterprise Data Protection Note */}
          <div className="auth-card-security-note">
            <ShieldCheck size={14} color="#127c34" />
            <span>Your data is protected with enterprise-grade security</span>
          </div>
        </div>
      </AuthCard>
    </div>
  );
}
