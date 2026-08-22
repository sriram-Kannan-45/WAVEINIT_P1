import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, User, Mail, Phone, Lock, Eye, EyeOff, Sparkles, CheckCircle2, AlertCircle, Loader2, UserPlus
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
  let pwd = ''
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pwd
}

export default function CreateParticipantModal({
  open,
  onClose,
  onParticipantCreated,
  token,
}) {
  const { success: showSuccess, error: showError } = useToast()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    status: 'APPROVED',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  const handleGeneratePassword = () => {
    const gen = generateSecurePassword()
    setForm(prev => ({ ...prev, password: gen }))
    setShowPassword(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (!form.name.trim()) {
      setErrorMsg('Participant name is required')
      return
    }
    if (!form.email.trim()) {
      setErrorMsg('Email address is required')
      return
    }
    if (!form.password || form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(API.ADMIN.PARTICIPANTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          status: form.status,
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add participant')
      }

      showSuccess('Participant Added', `${form.name} was added successfully.`)
      onParticipantCreated?.(data.participant)
      onClose?.()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add participant')
      showError('Error', err.message || 'Failed to add participant')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="reg-modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
        <motion.div
          className="reg-modal"
          style={{ maxWidth: 520, width: '92%', borderRadius: 16, overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="reg-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF6EE', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserPlus size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Add New Participant</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Create a learner account directly</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', padding: 4, borderRadius: 6 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body Form */}
          <form onSubmit={handleSubmit}>
            <div className="reg-modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, color: '#DC2626', fontSize: 12.5 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="reg-field-label" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>
                  Full Name <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    className="reg-input"
                    placeholder="e.g. Rahul Sharma"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    style={{ paddingLeft: 36, width: '100%', height: 40, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="reg-field-label" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>
                  Email Address <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="email"
                    className="reg-input"
                    placeholder="e.g. rahul@example.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    style={{ paddingLeft: 36, width: '100%', height: 40, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    required
                  />
                </div>
              </div>

              {/* Phone & Status Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Phone */}
                <div>
                  <label className="reg-field-label" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>
                    Phone Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type="tel"
                      className="reg-input"
                      placeholder="e.g. 9876543210"
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      style={{ paddingLeft: 36, width: '100%', height: 40, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="reg-field-label" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>
                    Account Status
                  </label>
                  <select
                    className="reg-select"
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, padding: '0 10px', background: '#FFFFFF' }}
                  >
                    <option value="APPROVED">Approved (Active)</option>
                    <option value="PENDING">Pending Approval</option>
                  </select>
                </div>
              </div>

              {/* Password */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <label className="reg-field-label" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', margin: 0 }}>
                    Password <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    style={{ background: 'none', border: 'none', color: '#16A34A', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Sparkles size={12} /> Auto-Generate
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="reg-input"
                    placeholder="Enter password (min 6 chars)"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    style={{ paddingLeft: 36, paddingRight: 36, width: '100%', height: 40, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="reg-modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="reg-admin-btn reg-admin-btn--primary"
                disabled={loading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16A34A', borderColor: '#16A34A' }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="bulk-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Add Participant</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
