import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Camera, KeyRound } from 'lucide-react'

import { API_BASE as API, assetUrl } from '../api/api'

/**
 * TrainerForm — full profile form for the TRAINER to fill/update their details.
 * Sends multipart/form-data to PUT /api/trainer/update.
 *
 * Fixes applied:
 *  1. File field renamed  photo  →  profileImage  (matches multer config)
 *  2. DOB normalized to YYYY-MM-DD before sending
 *  3. Client-side validation (phone numeric, DOB valid)
 *  4. Inline success / error messages — NO alert()
 *  5. Button disabled + spinner while saving
 *  6. Image preview on file select
 *  7. Reads standardized { success, message, errors[] } from API
 */
function TrainerForm({ user, onLogout }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    dob: '',
    qualification: '',
    experience: ''
  })

  // ── Image state ──────────────────────────────────────────────────────────
  const [imageFile, setImageFile]       = useState(null)
  const [imagePreview, setImagePreview] = useState(null)   // blob URL for new file
  const [existingImage, setExistingImage] = useState(null) // URL from server
  const fileInputRef = useRef()

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]   = useState(true)   // initial profile load
  const [saving, setSaving]     = useState(false)   // form submit in progress
  const [message, setMessage]   = useState('')      // green success
  const [error, setError]       = useState('')      // red error (string)
  const [fieldErrors, setFieldErrors] = useState({}) // per-field validation

  // ── Password modal state ─────────────────────────────────────────────────
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '', newPassword: '', confirmPassword: ''
  })
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError]       = useState('')
  const [passwordSuccess, setPasswordSuccess]   = useState('')

  const authHeader = () => ({ Authorization: `Bearer ${user.token}` })

  // ── Load profile on mount ────────────────────────────────────────────────
  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    try {
      const r = await fetch(`${API}/trainer/profile`, { headers: authHeader() })
      const d = await r.json()
      const p = d.trainer?.profile

      if (p) {
        setForm(prev => ({
          ...prev,
          name:          d.trainer?.name          || prev.name,
          phone:         p.phone                  || '',
          dob:           p.dob                    || '',
          qualification: p.qualification          || '',
          experience:    p.experience             || ''
        }))

        if (p.imagePath) {
          // Support old base64 blobs and new disk-path URLs
          if (p.imagePath.startsWith('data:')) {
            setExistingImage(p.imagePath)
          } else {
            // p.imagePath is like /uploads/trainer/xxx.jpg
            setExistingImage(assetUrl(p.imagePath))
          }
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Field change handler ─────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    // Clear per-field error on change
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  // ── Image selection ──────────────────────────────────────────────────────
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Client-side type guard
    if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
      setError('Only JPG and PNG images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5 MB.')
      return
    }

    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setError('')
  }

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = () => {
    const errs = {}

    if (form.phone && !/^[\d\s\+\-\(\)]{7,15}$/.test(form.phone.trim())) {
      errs.phone = 'Phone must contain only digits, spaces, +, -, (, )'
    }

    if (form.dob) {
      const parsed = new Date(form.dob)
      if (isNaN(parsed.getTime())) {
        errs.dob = 'Please enter a valid date of birth'
      } else if (parsed > new Date()) {
        errs.dob = 'Date of birth cannot be in the future'
      }
    }

    return errs
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setFieldErrors({})

    // Run client-side validation first
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      if (form.name)          formData.append('name',          form.name.trim())
      if (form.phone)         formData.append('phone',         form.phone.trim())
      if (form.qualification) formData.append('qualification', form.qualification.trim())
      if (form.experience)    formData.append('experience',    form.experience.trim())

      // Normalize DOB to YYYY-MM-DD (HTML date input already gives this, but be explicit)
      if (form.dob) {
        const normalized = new Date(form.dob).toISOString().split('T')[0]
        formData.append('dob', normalized)
      }

      // ✅ CRITICAL FIX: field name must match multer's upload.single('profilePic')
      if (imageFile) {
        formData.append('profilePic', imageFile)
      }

      console.log('📤 Submitting profile update:', {
        name: form.name, phone: form.phone, dob: form.dob,
        qualification: form.qualification, experience: form.experience,
        hasImage: !!imageFile
      })

      const response = await axios.put(`${API}/update-profile`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${user.token}`
        }
      })

      const { data } = response
      setMessage(data.message || 'Profile saved successfully!')

      // Update displayed image to the new server path
      if (data.data?.profile?.imagePath) {
        const imgPath = data.data.profile.imagePath
        setExistingImage(
          imgPath.startsWith('data:') ? imgPath : assetUrl(imgPath)
        )
      }

      // Clear new-file state
      setImageFile(null)
      setImagePreview(null)

      // Refresh full profile to pick up any server-side normalizations
      fetchProfile()

    } catch (err) {
      console.error('Profile update error:', err)

      // ── Structured error reading ───────────────────────────────────────
      const resData = err.response?.data
      if (resData?.errors && Array.isArray(resData.errors)) {
        // Validation errors array from the backend
        setError(resData.errors.join(' • '))
      } else {
        setError(
          resData?.message ||
          err.message      ||
          'Failed to update profile. Please try again.'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Password change ───────────────────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }

    setChangingPassword(true)
    try {
      const r = await fetch(`${API}/trainer/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword
        })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || d.message || 'Failed to change password')
      setPasswordSuccess('Password changed successfully!')
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => setShowPasswordModal(false), 1500)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const displayImage = imagePreview || existingImage
  const initials = (name) =>
    name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="trainer-form-wrap">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p>Loading profile…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="trainer-profile-form" noValidate>

          {/* ── Profile Image ─────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28,
            padding: 20, background: '#f8fafc', borderRadius: 12,
            border: '1px dashed #cbd5e1'
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%', overflow: 'hidden',
                border: '3px solid #e2e8f0', background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {displayImage ? (
                  <img src={displayImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28, fontWeight: 700, color: '#0D9488', fontFamily: "'Poppins', sans-serif" }}>
                    {initials(user.name)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 0, right: 0, width: 32, height: 32,
                  borderRadius: '50%', border: '2px solid #fff', cursor: 'pointer',
                  background: '#0D9488', color: '#fff', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
                title="Change photo"
              >
                <Camera size={14} />
              </button>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{user.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{user.email}</div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  marginTop: 8, padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: '#475569', transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.target.style.borderColor = '#0D9488'}
                onMouseLeave={e => e.target.style.borderColor = '#e2e8f0'}
              >
                {displayImage ? 'Change Photo' : 'Upload Photo'}
              </button>
              {imageFile && (
                <div style={{ fontSize: 12, color: '#22c55e', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>✓</span> {imageFile.name}
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              id="profile-image-input"
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
          </div>

          {/* ── Form Fields ───────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  style={{ paddingLeft: 36 }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>👤</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: 'relative' }}>
                <input
                  className={`form-control${fieldErrors.phone ? ' is-invalid' : ''}`}
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. +91 98765 43210"
                  style={{ paddingLeft: 36 }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>📞</span>
                {fieldErrors.phone && (
                  <span className="field-error" style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>
                    {fieldErrors.phone}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <div style={{ position: 'relative' }}>
                <input
                  className={`form-control${fieldErrors.dob ? ' is-invalid' : ''}`}
                  type="date"
                  name="dob"
                  value={form.dob}
                  onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  style={{ paddingLeft: 36 }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🎂</span>
                {fieldErrors.dob && (
                  <span className="field-error" style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>
                    {fieldErrors.dob}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Qualification <span style={{ color: '#94a3b8', fontSize: 12 }}>(optional)</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type="text"
                  name="qualification"
                  value={form.qualification}
                  onChange={handleChange}
                  placeholder="e.g. M.Tech, Ph.D, MBA"
                  style={{ paddingLeft: 36 }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🎓</span>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">Experience <span style={{ color: '#94a3b8', fontSize: 12 }}>(optional)</span></label>
            <div style={{ position: 'relative' }}>
              <textarea
                className="form-control"
                name="experience"
                value={form.experience}
                onChange={handleChange}
                placeholder="Describe your teaching experience, specializations, achievements…"
                rows={4}
                style={{ paddingLeft: 36 }}
              />
              <span style={{ position: 'absolute', left: 10, top: 12, color: '#94a3b8', fontSize: 14 }}>💼</span>
            </div>
          </div>

          {/* ── Inline feedback ───────────────────────────────────────── */}
          {error && (
            <div
              className="error"
              style={{
                background: 'rgba(229,62,62,0.1)',
                border: '1px solid rgba(229,62,62,0.4)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--danger, #e53e3e)',
                fontSize: 14
              }}
            >
              {error}
            </div>
          )}
          {message && (
            <div
              className="success"
              style={{
                background: 'rgba(56,161,105,0.1)',
                border: '1px solid rgba(56,161,105,0.4)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--success, #38a169)',
                fontSize: 14
              }}
            >
              ✓ {message}
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <button
              type="submit"
              id="save-profile-btn"
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
                borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? '#94a3b8' : '#0D9488', color: '#fff',
                fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving && (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              )}
              {saving ? 'Saving…' : 'Save Profile'}
            </button>

            <button
              type="button"
              id="change-password-btn"
              onClick={() => {
                setPasswordError('')
                setPasswordSuccess('')
                setShowPasswordModal(true)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer',
                background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600
              }}
            >
              <KeyRound size={16} />
              Change Password
            </button>
          </div>
        </form>
      )}

      {/* ── Password Modal ───────────────────────────────────────────────── */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal" onClick={e => e.stopPropagation()}
            style={{ borderRadius: 16, maxWidth: 440 }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: '#fef3c7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <KeyRound size={18} style={{ color: '#d97706' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins', sans-serif" }}>Change Password</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Update your account password</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: '#f1f5f9', color: '#64748b', cursor: 'pointer',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>×</button>
            </div>

            <form onSubmit={handlePasswordChange} style={{ paddingTop: 20 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Current Password</label>
                <input
                  className="form-control"
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, oldPassword: e.target.value }))}
                  placeholder="Enter current password"
                  required
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>New Password</label>
                <input
                  className="form-control"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Confirm New Password</label>
                <input
                  className="form-control"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Re-enter new password"
                  required
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              {passwordError && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 10,
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13
                }}>
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 10,
                  background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontSize: 13
                }}>
                  ✓ {passwordSuccess}
                </div>
              )}

              <div className="modal-footer" style={{
                marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'flex-end', gap: 10
              }}>
                <button type="button" onClick={() => setShowPasswordModal(false)}
                  style={{
                    padding: '8px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
                    background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569'
                  }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-password-btn"
                  disabled={changingPassword}
                  style={{
                    padding: '8px 20px', borderRadius: 10, border: 'none', cursor: changingPassword ? 'not-allowed' : 'pointer',
                    background: changingPassword ? '#94a3b8' : '#0D9488', color: '#fff',
                    fontSize: 13, fontWeight: 600, opacity: changingPassword ? 0.7 : 1
                  }}
                >
                  {changingPassword ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TrainerForm
