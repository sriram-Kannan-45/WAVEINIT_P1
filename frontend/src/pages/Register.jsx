import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '../api/api';
import AuthLayout from '../components/auth/AuthLayout';
import AuthCard from '../components/auth/AuthCard';
import AuthButton from '../components/auth/AuthButton';
import {
  validateEmail,
  validatePassword,
  getPasswordValidationDetails,
} from '../utils/validators';

function getStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[@$!%*?&#^()_+\-=[\]{}|;:,.<>~`]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: 'Weak', color: '#dc2626' };
  if (s <= 2) return { score: 2, label: 'Fair', color: '#f59e0b' };
  if (s <= 3) return { score: 3, label: 'Good', color: '#2563eb' };
  return { score: 4, label: 'Strong', color: '#16a34a' };
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const strength = useMemo(() => getStrength(form.password), [form.password]);
  const passwordDetails = useMemo(() => getPasswordValidationDetails(form.password), [form.password]);
  const isEmailValid = useMemo(() => !form.email || validateEmail(form.email), [form.email]);

  useEffect(() => {
    const prev = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev.html; document.body.style.overflow = prev.body; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name.trim()) return setError('Full name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!validateEmail(form.email)) return setError('Please enter a valid email address (e.g., user@example.com)');
    if (!form.phone.trim()) return setError('Phone number is required');
    if (!form.password) return setError('Password is required');
    if (!validatePassword(form.password)) {
      return setError('Password must be at least 8 characters long and contain uppercase, lowercase, a number, and a special character');
    }
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (!agreed) return setError('You must agree to the terms');

    setLoading(true);
    try {
      const res = await fetch(API.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      setSuccess(data.message || 'Your registration has been submitted. Please wait for admin approval.');
      setForm({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
      setAgreed(false);
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            fromRole: 'PARTICIPANT',
            message: 'Registration submitted successfully! Please wait for admin approval before logging in.'
          }
        });
      }, 2500);
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthLayout />

      <AuthCard className="auth-card--register">
        <div className="auth-card-header">
          <div className="auth-card-avatar">
            <User size={18} />
          </div>
          <h2 className="auth-card-title">Create Account</h2>
          <p className="auth-card-subtitle">Join as a participant to start learning</p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              className="auth-error"
              role="alert"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              style={{ marginBottom: 14 }}
            >
              <AlertCircle className="auth-error-icon" size={17} />
              <span className="auth-error-text">{error}</span>
            </motion.div>
          )}
          {success && (
            <motion.div
              className="auth-success"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              style={{ marginBottom: 14 }}
            >
              <CheckCircle2 size={17} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500, lineHeight: 1.45 }}>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {!success ? (
          <form onSubmit={handleSubmit} autoComplete="on">
            {/* Full Name */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="reg-name">Full Name</label>
              <div className="auth-input-wrapper">
                <User size={15} className="auth-input-icon-left" />
                <input
                  id="reg-name"
                  className="auth-form-input auth-form-input--has-icon-left"
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="reg-email">Email Address</label>
              <div className="auth-input-wrapper">
                <Mail size={15} className="auth-input-icon-left" />
                <input
                  id="reg-email"
                  className="auth-form-input auth-form-input--has-icon-left"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="john@example.com"
                  autoComplete="email"
                  disabled={loading}
                  required
                />
              </div>
              {emailTouched && form.email && !isEmailValid && (
                <p style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={12} /> Please enter a valid email address (e.g. user@domain.com)
                </p>
              )}
            </div>

            {/* Phone */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="reg-phone">Phone Number</label>
              <div className="auth-input-wrapper">
                <Phone size={15} className="auth-input-icon-left" />
                <input
                  id="reg-phone"
                  className="auth-form-input auth-form-input--has-icon-left"
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="e.g., 9876543210"
                  autoComplete="tel"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="reg-pw">Password</label>
              <div className="auth-input-wrapper">
                <Lock size={15} className="auth-input-icon-left" />
                <input
                  id="reg-pw"
                  className="auth-form-input auth-form-input--has-icon-left auth-form-input--has-icon-right"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Minimum 8 characters (mixed case, number, symbol)"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Password strength & validation checklist */}
              <AnimatePresence>
                {form.password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ marginTop: 6 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= strength.score ? strength.color : '#e2e8f0' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: strength.color }}>{strength.label}</span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '3px 8px',
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #f1f5f9',
                      fontSize: 11
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: passwordDetails.minLength ? '#16a34a' : '#94a3b8' }}>
                        {passwordDetails.minLength ? <Check size={11} strokeWidth={3} /> : <X size={11} />}
                        <span>At least 8 chars</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: (passwordDetails.hasUpper && passwordDetails.hasLower) ? '#16a34a' : '#94a3b8' }}>
                        {(passwordDetails.hasUpper && passwordDetails.hasLower) ? <Check size={11} strokeWidth={3} /> : <X size={11} />}
                        <span>Upper & lowercase</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: passwordDetails.hasNumber ? '#16a34a' : '#94a3b8' }}>
                        {passwordDetails.hasNumber ? <Check size={11} strokeWidth={3} /> : <X size={11} />}
                        <span>At least 1 number</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: passwordDetails.hasSpecial ? '#16a34a' : '#94a3b8' }}>
                        {passwordDetails.hasSpecial ? <Check size={11} strokeWidth={3} /> : <X size={11} />}
                        <span>Special character (!@#$)</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Confirm Password */}
            <div className="auth-form-group">
              <label className="auth-form-label" htmlFor="reg-confirm">Confirm Password</label>
              <div className="auth-input-wrapper">
                <Lock size={15} className="auth-input-icon-left" />
                <input
                  id="reg-confirm"
                  className="auth-form-input auth-form-input--has-icon-left auth-form-input--has-icon-right"
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <p style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>Passwords do not match</p>
              )}
              {form.confirmPassword && form.password === form.confirmPassword && form.confirmPassword.length > 0 && (
                <p style={{ fontSize: 11.5, color: '#16a34a', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> Passwords match
                </p>
              )}
            </div>

            {/* Terms */}
            <div className="auth-form-options">
              <label className="auth-checkbox-group">
                <input
                  type="checkbox"
                  className="auth-checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                />
                <span className="auth-checkbox-label">
                  I agree to the{' '}
                  <span className="auth-terms-link">
                    Terms of Service
                  </span>
                </span>
              </label>
            </div>

            <AuthButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </AuthButton>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13.5 }}>
            Redirecting to login...
          </div>
        )}

        <div className="auth-card-footer">
          <span>Already have an account?</span>{' '}
          <Link to="/login" className="auth-footer-link">Sign in</Link>
        </div>
      </AuthCard>
    </div>
  );
}
