import { useState, useRef, useMemo } from 'react'
import {
  Camera, Users, Eye, Trash2, UserPlus, ShieldCheck, Search, Loader2,
} from 'lucide-react'
import { useToast } from '../Toast'
import { API_BASE, assetUrl } from '../../api/api'

const DEPARTMENTS = [
  'Technology', 'Engineering', 'Design', 'Data Science', 'Marketing',
  'Sales', 'Human Resources', 'Finance', 'Operations',
  'Training & Development', 'Other',
]

const DESIGNATIONS = [
  'Senior Trainer', 'Trainer', 'Associate Trainer', 'Lead Trainer',
  'Faculty', 'Subject Matter Expert', 'Technical Instructor',
  'Software Engineer', 'Senior Software Engineer', 'Consultant', 'Other',
]

const EXPERIENCE_LEVELS = [
  'Fresher', '1-3 years', '3-5 years', '5-10 years', '10+ years',
]

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  employeeId: '',
  department: '',
  designation: '',
  experience: '',
  password: '',
  confirmPassword: '',
  status: 'APPROVED',
}

const countPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: '999px',
  background: '#f0fdf4',
  color: '#15803D',
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const initials = (name) => name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'

function StatusBadge({ status }) {
  return status === 'APPROVED'
    ? <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' }}>Active</span>
    : <span className="reg-admin-status" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>Inactive</span>
}

export default function CreateTrainerModule({
  trainers = [],
  initialLoading = false,
  token,
  onCreated,
  onDelete,
  onView,
  onBack,
}) {
  const { success, error: showError } = useToast()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageError, setImageError] = useState('')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const nameInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const listCardRef = useRef(null)

  const isActive = form.status === 'APPROVED'

  const setField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  // ── Photo upload ────────────────────────────────────────────────────────
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
      setImageError('Only JPG and PNG images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be smaller than 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setImageError('')
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Full name is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address'
    if (form.phone && !/^[\d\s+\-()]{7,15}$/.test(form.phone.trim())) errs.phone = 'Enter a valid phone number'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (!form.confirmPassword) errs.confirmPassword = 'Please confirm the password'
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    return errs
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        employeeId: form.employeeId.trim() || undefined,
        department: form.department || undefined,
        designation: form.designation || undefined,
        experience: form.experience || undefined,
        status: form.status,
        profilePic: imagePreview || undefined,
      }
      const r = await fetch(`${API_BASE}/admin/create-trainer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create trainer')

      success('Trainer account created successfully.')
      setForm(EMPTY_FORM)
      setImagePreview(null)
      setErrors({})
      setPage(1)
      onCreated?.()
      setTimeout(() => listCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setImagePreview(null)
    setErrors({})
  }

  // ── List filtering + pagination ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return trainers
    return trainers.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q) ||
      (t.employeeId || '').toLowerCase().includes(q)
    )
  }, [trainers, search])

  const itemsPerPage = 5
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

  const focusForm = () => nameInputRef.current?.focus()

  return (
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
          <ShieldCheck size={22} color="#fff" />
        </div>
        <div>
          <h2 className="reg-admin-title">Create Trainer</h2>
          <p className="reg-admin-subtitle">Set up a new trainer account and manage your trainer roster in one place</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack}>
          <Users size={14} /> Back to Trainers
        </button>
      </div>

      <div className="reg-form-grid" style={{ alignItems: 'start' }}>
        {/* ── Create Trainer Form ───────────────────────────────────────── */}
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <div>
              <div className="reg-card-title">Create Trainer Account</div>
              <div className="reg-card-subtitle">Add a new trainer to the platform</div>
            </div>
          </div>
          <div className="reg-card-body">
            <form onSubmit={handleSubmit} noValidate>
              {/* Profile photo */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
                padding: 16, background: '#f8fafc',
                borderRadius: 12, border: '1px dashed #cbd5e1',
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #16A34A, #15803D)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 700, overflow: 'hidden',
                  }}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials(form.name)}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload profile photo"
                    title="Upload profile photo"
                    style={{
                      position: 'absolute', bottom: 0, right: 0, width: 28, height: 28,
                      borderRadius: '50%', border: '2px solid #fff',
                      background: '#16A34A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    }}
                  >
                    <Camera size={13} />
                  </button>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Profile Photo</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>JPG or PNG, up to 5 MB</div>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--secondary"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginTop: 8, fontSize: 12, padding: '5px 12px' }}
                  >
                    {imagePreview ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {imageError && (
                    <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>{imageError}</div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  style={{ display: 'none' }}
                  onChange={handleImageChange}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="reg-field-label">Full Name<span className="reg-req"> *</span></label>
                  <input ref={nameInputRef} className="reg-input" type="text" placeholder="e.g. Sarah Johnson" value={form.name} onChange={(e) => setField('name', e.target.value)} />
                  {errors.name && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{errors.name}</div>}
                </div>
                <div>
                  <label className="reg-field-label">Email Address<span className="reg-req"> *</span></label>
                  <input className="reg-input" type="email" placeholder="trainer@company.com" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                  {errors.email && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{errors.email}</div>}
                </div>
                <div>
                  <label className="reg-field-label">Mobile Number</label>
                  <input className="reg-input" type="tel" placeholder="e.g. +91 98765 43210" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Optional</div>
                  {errors.phone && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{errors.phone}</div>}
                </div>
                <div>
                  <label className="reg-field-label">Employee ID</label>
                  <input className="reg-input" type="text" placeholder="e.g. EMP-1024" value={form.employeeId} onChange={(e) => setField('employeeId', e.target.value)} />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Optional</div>
                </div>
                <div>
                  <label className="reg-field-label">Department</label>
                  <select className="reg-select" value={form.department} onChange={(e) => setField('department', e.target.value)}>
                    <option value="">Select department</option>
                    {DEPARTMENTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="reg-field-label">Designation</label>
                  <select className="reg-select" value={form.designation} onChange={(e) => setField('designation', e.target.value)}>
                    <option value="">Select designation</option>
                    {DESIGNATIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="reg-field-label">Experience</label>
                  <select className="reg-select" value={form.experience} onChange={(e) => setField('experience', e.target.value)}>
                    <option value="">Select experience</option>
                    {EXPERIENCE_LEVELS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                {/* Status toggle */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, background: '#f8fafc',
                  borderRadius: 12, border: '1px solid #f1f5f9',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      <ShieldCheck size={16} style={{ color: isActive ? '#16A34A' : '#94a3b8' }} />
                      Account Status
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Immediately activate or deactivate login access
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusBadge status={form.status} />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      aria-label="Toggle account status"
                      className={`interview-toggle ${isActive ? 'interview-toggle--active' : ''}`}
                      onClick={() => setField('status', isActive ? 'INACTIVE' : 'APPROVED')}
                    >
                      <span className="interview-toggle-knob" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="reg-field-label">Password<span className="reg-req"> *</span></label>
                  <input className="reg-input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => setField('password', e.target.value)} />
                  {errors.password && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{errors.password}</div>}
                </div>
                <div>
                  <label className="reg-field-label">Confirm Password<span className="reg-req"> *</span></label>
                  <input className="reg-input" type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} />
                  {errors.confirmPassword && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{errors.confirmPassword}</div>}
                </div>
              </div>

              <div className="reg-form-actions">
                <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={submitting} style={{ flex: 1 }}>
                  {submitting ? <><Loader2 size={14} className="reg-spin" /> Creating Trainer...</> : <><UserPlus size={14} /> Create Trainer</>}
                </button>
                <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={resetForm} disabled={submitting}>Reset</button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Trainer List ──────────────────────────────────────────────── */}
        <div ref={listCardRef} className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <div>
              <div className="reg-card-title">All Trainers</div>
              <div className="reg-card-subtitle">View, inspect and manage trainer accounts</div>
            </div>
            <span style={countPillStyle}>{trainers.length} total</span>
          </div>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div className="reg-admin-search">
              <Search size={16} />
              <input
                placeholder="Search by name, email, department or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
          </div>

          {initialLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainers...</p></div>
          ) : filtered.length === 0 ? (
            <div className="reg-admin-empty">
              <Users size={40} />
              <h3>{trainers.length === 0 ? 'No Trainers Yet' : 'No Trainers Found'}</h3>
              <p>
                {trainers.length === 0
                  ? 'Create your first trainer account using the form on the left.'
                  : 'No trainers match your current search. Try a different keyword.'}
              </p>
              {trainers.length === 0 && (
                <button className="reg-admin-btn reg-admin-btn--primary" onClick={focusForm}>+ Add First Trainer</button>
              )}
            </div>
          ) : (
            <table className="reg-admin-table">
              <thead>
                <tr><th>Trainer</th><th>Email</th><th>Department</th><th>Experience</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paged.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="reg-admin-participant">
                        <div className="reg-admin-avatar">
                          {t.profile?.imagePath
                            ? <img src={assetUrl(t.profile.imagePath)} alt={t.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : initials(t.name)}
                        </div>
                        <div>
                          <span className="reg-admin-name">{t.name}</span>
                          <span className="reg-admin-email">{t.employeeId ? `ID · ${t.employeeId}` : t.username}</span>
                        </div>
                      </div>
                    </td>
                    <td className="reg-admin-email">{t.email}</td>
                    <td className="reg-admin-date">{t.department || '—'}</td>
                    <td className="reg-admin-date">{t.profile?.experience || '—'}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>
                      <div className="reg-admin-actions">
                        <button type="button" className="reg-admin-action" title="View Details" aria-label={`View ${t.name}`} onClick={() => onView?.(t)}><Eye size={14} /></button>
                        <button type="button" className="reg-admin-action reg-admin-action--reject" title="Delete Trainer" aria-label={`Delete ${t.name}`} onClick={() => onDelete?.(t.id, t.name)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span className="reg-admin-date">Showing {paged.length} of {filtered.length} trainers</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="reg-admin-btn reg-admin-btn--secondary" style={{ padding: '5px 12px', fontSize: 12 }} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Prev</button>
              <button className="reg-admin-btn reg-admin-btn--secondary" style={{ padding: '5px 12px', fontSize: 12 }} disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
