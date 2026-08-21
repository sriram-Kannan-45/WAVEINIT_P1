import { useState, useRef, useEffect } from 'react'
import { Camera, Users, UserPlus, ShieldCheck, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useToast } from '../Toast'
import { API_BASE } from '../../api/api'
import { getTwoLetterInitials } from '../common/UserAvatar'

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

function generateNextEmployeeId(trainersList = []) {
  const list = Array.isArray(trainersList) ? trainersList : []
  let maxNumber = 1000

  list.forEach(t => {
    const raw = t.employeeId || t.employee_id || t.profile?.employeeId || t.profile?.employee_id
    if (raw) {
      const match = String(raw).match(/\d+/)
      if (match) {
        const num = parseInt(match[0], 10)
        if (!isNaN(num) && num > maxNumber && num < 99999) {
          maxNumber = num
        }
      }
    }
  })

  // If no numbers above 1000 exist, compute sequentially based on current trainer count
  if (maxNumber === 1000) {
    maxNumber = 1000 + list.length
  }
  return `EMP-${maxNumber + 1}`
}

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

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }

const initials = (name) => getTwoLetterInitials(name)

function StatusBadge({ status }) {
  return status === 'APPROVED'
    ? <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' }}>Active</span>
    : <span className="reg-admin-status" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>Inactive</span>
}

export default function CreateTrainerModule({
  trainers = [],
  token,
  onCreated,
  onBack,
}) {
  const { success, error: showError } = useToast()

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    employeeId: generateNextEmployeeId(trainers),
  }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageError, setImageError] = useState('')

  const nameInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const isActive = form.status === 'APPROVED'

  useEffect(() => {
    if (!form.employeeId || form.employeeId.startsWith('EMP-')) {
      const nextId = generateNextEmployeeId(trainers)
      setForm(prev => ({
        ...prev,
        employeeId: prev.employeeId && !prev.employeeId.startsWith('EMP-') ? prev.employeeId : nextId,
      }))
    }
  }, [trainers])

  const handleRegenerateEmpId = () => {
    const nextId = generateNextEmployeeId(trainers)
    setField('employeeId', nextId)
  }

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

      success('Trainer created successfully')
      setForm({
        ...EMPTY_FORM,
        employeeId: generateNextEmployeeId([...trainers, { employeeId: form.employeeId }]),
      })
      setImagePreview(null)
      setErrors({})
      onCreated?.()
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      employeeId: generateNextEmployeeId(trainers),
    })
    setImagePreview(null)
    setErrors({})
  }

  return (
    <div className="reg-admin" style={{ paddingBottom: 0 }}>
      <div style={{ maxWidth: 920, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div className="reg-admin-header">
          <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
            <ShieldCheck size={26} color="#fff" />
          </div>
          <div>
            <h2 className="reg-admin-title">Create Trainer</h2>
            <p className="reg-admin-subtitle">Set up a new trainer account</p>
          </div>
          <div style={{ flex: 1 }} />
          <button className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack} style={{ height: 42, padding: '0 16px', fontSize: 13, borderRadius: 10 }}>
            <Users size={15} /> Back to Trainers
          </button>
        </div>

        {/* ── Single Centered Form Card ─────────────────────────────────────── */}
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header" style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <div className="reg-card-title" style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>Create Trainer Account</div>
              <div className="reg-card-subtitle" style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>Fill in the trainer details below</div>
            </div>
          </div>
          <div className="reg-card-body" style={{ padding: '16px 22px' }}>
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Profile photo */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
                  background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1',
                }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #16A34A, #15803D)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, overflow: 'hidden',
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
                        position: 'absolute', bottom: -2, right: -2, width: 22, height: 22,
                        borderRadius: '50%', border: '2px solid #fff',
                        background: '#16A34A', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                      }}
                    >
                      <Camera size={11} />
                    </button>
                  </div>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Profile Photo</div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>JPG or PNG, up to 5 MB</div>
                    </div>
                    <button
                      type="button"
                      className="reg-admin-btn reg-admin-btn--secondary"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                    >
                      {imagePreview ? 'Change Photo' : 'Upload Photo'}
                    </button>
                  </div>
                  {imageError && (
                    <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{imageError}</div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    style={{ display: 'none' }}
                    onChange={handleImageChange}
                  />
                </div>

                {/* Row 1: Name & Email */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Full Name<span className="reg-req"> *</span></label>
                    <input ref={nameInputRef} className="reg-input" type="text" placeholder="e.g. Sarah Johnson" value={form.name} onChange={(e) => setField('name', e.target.value)} />
                    {errors.name && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{errors.name}</div>}
                  </div>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Email Address<span className="reg-req"> *</span></label>
                    <input className="reg-input" type="email" placeholder="trainer@company.com" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                    {errors.email && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{errors.email}</div>}
                  </div>
                </div>

                {/* Row 2: Phone & Employee ID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Mobile Number</label>
                    <input className="reg-input" type="tel" placeholder="e.g. +91 98765 43210" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
                    {errors.phone && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{errors.phone}</div>}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label className="reg-field-label" style={{ ...labelStyle, marginBottom: 0 }}>Employee ID</label>
                      <button
                        type="button"
                        onClick={handleRegenerateEmpId}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'none', border: 'none', color: '#16A34A',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
                        }}
                        title="Auto-generate next ID based on trainer count"
                      >
                        <RefreshCw size={11} /> Auto-Generate
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="reg-input"
                        type="text"
                        placeholder="e.g. EMP-1006"
                        value={form.employeeId}
                        onChange={(e) => setField('employeeId', e.target.value)}
                        style={{ paddingRight: 32 }}
                      />
                      <button
                        type="button"
                        onClick={handleRegenerateEmpId}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: '#16A34A', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                        }}
                        title="Refresh Employee ID"
                      >
                        <Sparkles size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      Auto-assigned based on current trainer count ({trainers?.length || 0})
                    </div>
                  </div>
                </div>

                {/* Row 3: Department & Designation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Department</label>
                    <select className="reg-select" value={form.department} onChange={(e) => setField('department', e.target.value)}>
                      <option value="">Select department</option>
                      {DEPARTMENTS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Designation</label>
                    <select className="reg-select" value={form.designation} onChange={(e) => setField('designation', e.target.value)}>
                      <option value="">Select designation</option>
                      {DESIGNATIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 4: Experience & Account Status */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, alignItems: 'center' }}>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Experience</label>
                    <select className="reg-select" value={form.experience} onChange={(e) => setField('experience', e.target.value)}>
                      <option value="">Select experience</option>
                      {EXPERIENCE_LEVELS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Account Status</label>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      height: 40, padding: '0 12px', background: '#f8fafc',
                      borderRadius: 10, border: '1.5px solid #E5E7EB', boxSizing: 'border-box',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                        <ShieldCheck size={14} style={{ color: isActive ? '#16A34A' : '#94a3b8' }} />
                        <span>{isActive ? 'Active Login' : 'Inactive'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusBadge status={form.status} />
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          aria-label="Toggle account status"
                          className={`interview-toggle ${isActive ? 'interview-toggle--active' : ''}`}
                          onClick={() => setField('status', isActive ? 'INACTIVE' : 'APPROVED')}
                          style={{ transform: 'scale(0.88)', flexShrink: 0 }}
                        >
                          <span className="interview-toggle-knob" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 5: Password & Confirm Password */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Password<span className="reg-req"> *</span></label>
                    <input className="reg-input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => setField('password', e.target.value)} />
                    {errors.password && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{errors.password}</div>}
                  </div>
                  <div>
                    <label className="reg-field-label" style={labelStyle}>Confirm Password<span className="reg-req"> *</span></label>
                    <input className="reg-input" type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} />
                    {errors.confirmPassword && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{errors.confirmPassword}</div>}
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={resetForm} disabled={submitting} style={{ height: 38, padding: '0 18px', fontSize: 13 }}>
                    Reset
                  </button>
                  <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={submitting} style={{ height: 38, padding: '0 22px', fontSize: 13, fontWeight: 600 }}>
                    {submitting ? <><Loader2 size={14} className="reg-spin" /> Creating Trainer...</> : <><UserPlus size={14} /> Create Trainer</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
