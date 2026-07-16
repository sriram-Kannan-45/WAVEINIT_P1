import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Phone, BookOpen, FileText, Camera, CheckCircle2,
  AlertCircle, Loader2, Brain, ShieldCheck,
  ClipboardCheck, Sparkles, RefreshCw, Clock, GraduationCap, BadgeCheck,
  ChevronRight, ChevronLeft, Upload, X, HelpCircle, Save, Inbox
} from 'lucide-react'
import { API } from '../api/api'

const ease = [0.22, 1, 0.36, 1]

const STEPS = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'contact', label: 'Contact', icon: Phone },
  { key: 'training', label: 'Training', icon: BookOpen },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'review', label: 'Review', icon: CheckCircle2 },
  { key: 'submit', label: 'Submit', icon: Sparkles },
]

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']
const QUALIFICATIONS = ['High School', 'Diploma', "Bachelor's Degree", "Master's Degree", 'PhD', 'Professional Certification', 'Other']
const EXPERIENCE_LEVELS = ['Fresher (0 years)', '0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years']
const STATES_OF_INDIA = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Other',
]

const SUBMIT_STEPS = [
  { label: 'AI validating your application...', icon: Brain },
  { label: 'Creating your application...', icon: ClipboardCheck },
  { label: 'Saving your data securely...', icon: ShieldCheck },
  { label: 'Almost done...', icon: Sparkles },
]

const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease } }

function SectionCard({ icon: Icon, title, subtitle, children, className = '' }) {
  return (
    <motion.div
      className={`reg-section-card ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease }}
    >
      <div className="reg-section-header">
        <div className="reg-section-icon"><Icon size={16} /></div>
        <div>
          <h3 className="reg-section-title">{title}</h3>
          <p className="reg-section-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="reg-section-body">{children}</div>
    </motion.div>
  )
}

function Field({ label, required, children, className = '' }) {
  return (
    <div className={`reg-field-premium ${className}`}>
      <label className="reg-field-label">{label}{required && <span className="reg-field-required">*</span>}</label>
      {children}
    </div>
  )
}

function Input({ ...props }) {
  return <input className="reg-input" {...props} />
}

function Select({ children, ...props }) {
  return <select className="reg-select" {...props}>{children}</select>
}

function RegistrationPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitStep, setSubmitStep] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successData, setSuccessData] = useState(null)
  const [trainings, setTrainings] = useState([])
  const [trainingsLoading, setTrainingsLoading] = useState(true)

  const [resumeFile, setResumeFile] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    gender: '', dob: '', qualification: '', experience: '',
    address: '', city: '', state: '', country: 'India',
    trainingId: '', batch: '', agreeTerms: false,
  })

  const API_BASE = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : 'http://localhost:3001'

  useEffect(() => { fetchTrainings() }, [])

  useEffect(() => {
    const saved = localStorage.getItem('reg_draft')
    if (saved) { try { setForm(f => ({ ...f, ...JSON.parse(saved) })) } catch {} }
  }, [])

  const fetchTrainings = async () => {
    try {
      const r = await fetch(`${API_BASE}/trainings`)
      const d = await r.json()
      if (r.ok) {
        const list = (d.trainings || d || []).filter(t => t.status !== 'DELETED')
        setTrainings(list)
      }
    } catch {}
    finally { setTrainingsLoading(false) }
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const selectedTraining = trainings.find(t => String(t.id) === String(form.trainingId))

  const canNext = () => {
    if (step === 0) return form.firstName.trim() && form.lastName.trim()
    if (step === 1) return form.email.trim() && form.phone.trim()
    if (step === 2) return form.trainingId
    if (step === 3) return true
    if (step === 4) return form.agreeTerms
    return false
  }

  const handlePhotoChange = useCallback((file) => {
    if (file && file.type.startsWith('image/')) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setPhotoPreview(ev.target.result)
      reader.readAsDataURL(file)
    }
  }, [])

  const handleDrop = useCallback((e, type) => {
    e.preventDefault(); setDragOver(null)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (type === 'resume') {
      const ext = file.name.split('.').pop().toLowerCase()
      if (['pdf', 'doc', 'docx'].includes(ext)) setResumeFile(file)
    } else { handlePhotoChange(file) }
  }, [handlePhotoChange])

  const handleSaveDraft = () => {
    localStorage.setItem('reg_draft', JSON.stringify(form))
    alert('Draft saved!')
  }

  const handleSubmit = async () => {
    if (!form.agreeTerms) { setError('You must agree to the terms.'); return }
    setLoading(true); setError(''); setSubmitStep(0)

    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k !== 'agreeTerms' && v) fd.append(k, v)
      })
      if (resumeFile) fd.append('resume', resumeFile)
      if (photoFile) fd.append('profilePhoto', photoFile)

      setSubmitStep(0); await new Promise(r => setTimeout(r, 800))
      setSubmitStep(1); await new Promise(r => setTimeout(r, 600))
      setSubmitStep(2)

      const r = await fetch(API.REGISTRATION.APPLY, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Unable to submit your application. Please try again or contact support.')

      setSubmitStep(3); await new Promise(r => setTimeout(r, 500))
      setSuccessData(d.application || {})
      setSuccess(true)
      localStorage.removeItem('reg_draft')
    } catch (e) {
      const msg = e.name === 'TypeError' && e.message.includes('fetch')
        ? 'Unable to connect to the server. Please check your connection and try again.'
        : (e.message || 'Unable to submit your application. Please try again or contact support.')
      setError(msg)
    } finally { setLoading(false); setSubmitStep(0) }
  }

  // ─── Success Page ──────────────────────────────────────────────
  if (success) {
    return (
      <div className="reg-page-bg">
        <div className="reg-container reg-container--standalone">
          <div className="reg-page-header">
            <div className="reg-logo"><div className="reg-logo-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div><span className="reg-logo-text">Wave Init</span></div>
          </div>
          <motion.div className="reg-success-page" {...fadeUp}>
            <div className="reg-success-icon-wrap">
              <motion.div className="reg-success-check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}>
                <CheckCircle2 size={48} />
              </motion.div>
              <motion.div className="reg-success-ring" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} />
            </div>
            <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>Thank You, {form.firstName}!</motion.h2>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              Your registration application has been submitted successfully. Our team will review it with AI validation and you'll receive an email with your login credentials once approved.
            </motion.p>
            {successData?.applicationNumber && (
              <motion.div className="reg-success-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <div className="reg-success-row"><BadgeCheck size={16} /><span>Application Number</span><strong>{successData.applicationNumber}</strong></div>
                {selectedTraining && <div className="reg-success-row"><GraduationCap size={16} /><span>Training Program</span><strong>{selectedTraining.title}</strong></div>}
                <div className="reg-success-row"><Clock size={16} /><span>Estimated Review</span><strong>2-3 Business Days</strong></div>
                <div className="reg-success-row"><AlertCircle size={16} /><span>Status</span><strong className="text-warning-600">Pending Review</strong></div>
              </motion.div>
            )}
            <motion.button className="reg-btn-submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} onClick={() => navigate('/login')}>
              Go to Login <ChevronRight size={16} />
            </motion.button>
          </motion.div>
        </div>
      </div>
    )
  }

  // ─── Loading Page ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="reg-page-bg">
        <div className="reg-container reg-container--standalone">
          <div className="reg-page-header">
            <div className="reg-logo"><div className="reg-logo-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div><span className="reg-logo-text">Wave Init</span></div>
          </div>
          <motion.div className="reg-loading-page" {...fadeUp}>
            <h2>Submitting Application</h2>
            <p>Please wait while we process your request...</p>
            <div className="reg-submit-steps">
              {SUBMIT_STEPS.map((s, i) => {
                const Icon = s.icon
                return (
                  <motion.div key={i} className={`reg-submit-step ${i === submitStep ? 'active' : ''} ${i < submitStep ? 'done' : ''}`}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                    <div className="reg-submit-step-icon">
                      {i < submitStep ? <CheckCircle2 size={18} /> : i === submitStep ? <Loader2 size={18} className="reg-spin" /> : <Icon size={18} />}
                    </div>
                    <span>{s.label}</span>
                  </motion.div>
                )
              })}
            </div>
            <div className="reg-progress-track">
              <motion.div className="reg-progress-fill" initial={{ width: '0%' }} animate={{ width: `${((submitStep + 1) / SUBMIT_STEPS.length) * 100}%` }} transition={{ duration: 0.4, ease }} />
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // ─── Main Form ─────────────────────────────────────────────────
  return (
    <div className="reg-page-bg">
      <div className="reg-bg-grid" />
      <div className="reg-bg-gradient" />
      <div className="reg-bg-circle reg-bg-circle-1" />
      <div className="reg-bg-circle reg-bg-circle-2" />
      <div className="reg-bg-circle reg-bg-circle-3" />

      <div className="reg-container">
        {/* Fixed Top: Header */}
        <div className="reg-page-header">
          <div className="reg-logo">
            <div className="reg-logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <span className="reg-logo-text">Wave Init</span>
          </div>
          <div className="reg-help-links">
            <a href="#" className="reg-help-link"><HelpCircle size={14} /> Need Help?</a>
            <a href="#" className="reg-help-link">Support</a>
            <a href="#" className="reg-help-link">Documentation</a>
          </div>
        </div>

        {/* Fixed Top: Title + Stepper */}
        <div className="reg-top-section">
          <div className="reg-page-title">
            <h1>Registration Application</h1>
            <p>Complete your application to join the training program.</p>
          </div>
          <div className="reg-stepper">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isDone = i < step
              const isActive = i === step
              return (
                <div key={s.key} className="reg-stepper-item">
                  <div className={`reg-stepper-circle ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                    {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  </div>
                  <span className={`reg-stepper-label ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <div className={`reg-stepper-line ${isDone ? 'done' : ''}`} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Scrollable Middle: Error + Form Content */}
        <div className="reg-form-scroll">
          <AnimatePresence>
            {error && (
              <motion.div className="reg-error-box" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <div className="reg-error-content">
                  <AlertCircle size={16} />
                  <div className="reg-error-text">
                    <strong>Submission Failed</strong>
                    <span>{error}</span>
                  </div>
                </div>
                <button className="reg-error-retry" onClick={handleSubmit}><RefreshCw size={13} /> Try Again</button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease }}>

              {/* ═══ Step 0: Personal ═══ */}
              {step === 0 && (
                <SectionCard icon={User} title="Personal Information" subtitle="Fill your personal details.">
                  <div className="reg-grid-2">
                    <Field label="First Name" required><Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="John" /></Field>
                    <Field label="Last Name" required><Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Doe" /></Field>
                    <Field label="Gender">
                      <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                        <option value="">Select Gender</option>
                        {GENDERS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                      </Select>
                    </Field>
                    <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} /></Field>
                    <Field label="Qualification">
                      <Select value={form.qualification} onChange={e => set('qualification', e.target.value)}>
                        <option value="">Select Qualification</option>
                        {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
                      </Select>
                    </Field>
                    <Field label="Experience">
                      <Select value={form.experience} onChange={e => set('experience', e.target.value)}>
                        <option value="">Select Experience</option>
                        {EXPERIENCE_LEVELS.map(e => <option key={e} value={e}>{e}</option>)}
                      </Select>
                    </Field>
                  </div>
                </SectionCard>
              )}

              {/* ═══ Step 1: Contact ═══ */}
              {step === 1 && (
                <SectionCard icon={Phone} title="Contact Details" subtitle="How can we reach you?">
                  <div className="reg-grid-2">
                    <Field label="Email Address" required><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" /></Field>
                    <Field label="Phone Number" required><Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></Field>
                  </div>
                  <Field label="Address"><Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address" /></Field>
                  <div className="reg-grid-2">
                    <Field label="City"><Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" /></Field>
                    <Field label="State">
                      <Select value={form.state} onChange={e => set('state', e.target.value)}>
                        <option value="">Select State</option>
                        {STATES_OF_INDIA.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                    <Field label="Country"><Input value={form.country} onChange={e => set('country', e.target.value)} placeholder="India" /></Field>
                  </div>
                </SectionCard>
              )}

              {/* ═══ Step 2: Training ═══ */}
              {step === 2 && (
                <SectionCard icon={GraduationCap} title="Training Program" subtitle="Choose your training program.">
                  {trainingsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 size={28} className="text-primary-600 reg-spin" />
                      <p className="text-sm text-gray-500">Loading available programs...</p>
                    </div>
                  ) : trainings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <Inbox size={24} className="text-gray-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700">No training programs available</p>
                      <p className="text-xs text-gray-400 text-center max-w-xs">There are no active training programs at the moment. Please check back later or contact support.</p>
                    </div>
                  ) : (
                    <>
                      <div className="reg-training-grid">
                        {trainings.map(t => (
                          <div key={t.id} className={`reg-training-card ${String(form.trainingId) === String(t.id) ? 'selected' : ''}`}
                            onClick={() => set('trainingId', String(t.id))} role="button" tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && set('trainingId', String(t.id))}>
                            <div className="reg-training-card-top" style={{ background: t.color || '#16A34A' }} />
                            <div className="reg-training-card-body">
                              <h4>{t.title}</h4>
                              {t.desc && <p>{t.desc}</p>}
                              <div className="reg-training-meta">
                                {t.duration && <span><Clock size={11} /> {t.duration}</span>}
                                {t.level && <span><span className="reg-level-dot" style={{ background: t.color || '#16A34A' }} />{t.level}</span>}
                                {t.seats && <span><User size={11} /> {t.seats} seats</span>}
                              </div>
                            </div>
                            {String(form.trainingId) === String(t.id) && <div className="reg-training-check"><CheckCircle2 size={18} /></div>}
                          </div>
                        ))}
                      </div>
                      <div className="reg-grid-2" style={{ marginTop: 10 }}>
                        <Field label="Preferred Batch"><Input value={form.batch} onChange={e => set('batch', e.target.value)} placeholder="e.g., Morning Batch, Batch A" /></Field>
                        <Field label="Learning Mode">
                          <Select defaultValue="">
                            <option value="">Select Mode</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                            <option value="hybrid">Hybrid</option>
                          </Select>
                        </Field>
                      </div>
                    </>
                  )}
                </SectionCard>
              )}

              {/* ═══ Step 3: Documents ═══ */}
              {step === 3 && (
                <SectionCard icon={FileText} title="Documents" subtitle="Upload your resume and profile photo.">
                  <div className="reg-grid-2">
                    <div className={`reg-upload-zone ${dragOver === 'resume' ? 'drag-over' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOver('resume') }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => handleDrop(e, 'resume')}
                      onClick={() => document.getElementById('resume-input').click()}>
                      <input id="resume-input" type="file" accept=".pdf,.doc,.docx" className="hidden"
                        onChange={e => setResumeFile(e.target.files?.[0])} />
                      {resumeFile ? (
                        <div className="reg-upload-file">
                          <FileText size={20} className="text-primary-600" />
                          <div>
                            <p className="font-semibold text-surface-800" style={{ fontSize: 13 }}>{resumeFile.name}</p>
                            <p className="text-xs text-surface-400">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setResumeFile(null) }} className="reg-upload-remove"><X size={13} /></button>
                        </div>
                      ) : (
                        <div className="reg-upload-placeholder">
                          <Upload size={24} className="text-surface-300" />
                          <p className="font-medium text-surface-600" style={{ fontSize: 13 }}>Drop resume or <span className="text-primary-600">browse</span></p>
                          <p className="text-xs text-surface-400">PDF, DOC, DOCX (max 5MB)</p>
                        </div>
                      )}
                    </div>
                    <div className={`reg-upload-zone ${dragOver === 'photo' ? 'drag-over' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOver('photo') }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => handleDrop(e, 'photo')}
                      onClick={() => !photoFile && document.getElementById('photo-input').click()}>
                      <input id="photo-input" type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                        onChange={e => handlePhotoChange(e.target.files?.[0])} />
                      {photoPreview ? (
                        <div className="reg-upload-photo">
                          <img src={photoPreview} alt="Preview" />
                          <button onClick={e => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null) }} className="reg-upload-remove"><X size={13} /></button>
                        </div>
                      ) : (
                        <div className="reg-upload-placeholder">
                          <Camera size={24} className="text-surface-300" />
                          <p className="font-medium text-surface-600" style={{ fontSize: 13 }}>Drop photo or <span className="text-primary-600">browse</span></p>
                          <p className="text-xs text-surface-400">JPG, PNG, WebP (max 5MB)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>
              )}

              {/* ═══ Step 4: Review ═══ */}
              {step === 4 && (
                <div className="reg-review-dashboard">
                  <motion.div className="reg-review-header-section" {...fadeUp}>
                    <div className="reg-review-avatar">
                      {photoPreview ? <img src={photoPreview} alt="Profile" /> : <span>{(form.firstName?.[0] || '') + (form.lastName?.[0] || '')}</span>}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-surface-900">{form.firstName} {form.lastName}</h2>
                      <p className="text-sm text-surface-500">{form.email}</p>
                    </div>
                  </motion.div>
                  <div className="reg-grid-2">
                    <motion.div className="reg-review-card" {...fadeUp}>
                      <div className="reg-review-card-header">
                        <User size={14} /><h4>Personal Details</h4>
                        <button onClick={() => setStep(0)} className="reg-review-edit"><PencilIcon /> Edit</button>
                      </div>
                      <div className="reg-review-card-body">
                        <div className="reg-kv"><span>Full Name</span><strong>{form.firstName} {form.lastName}</strong></div>
                        {form.gender && <div className="reg-kv"><span>Gender</span><strong>{form.gender.replace(/_/g, ' ')}</strong></div>}
                        {form.dob && <div className="reg-kv"><span>DOB</span><strong>{form.dob}</strong></div>}
                        {form.qualification && <div className="reg-kv"><span>Qualification</span><strong>{form.qualification}</strong></div>}
                        {form.experience && <div className="reg-kv"><span>Experience</span><strong>{form.experience}</strong></div>}
                      </div>
                    </motion.div>
                    <motion.div className="reg-review-card" {...fadeUp} transition={{ delay: 0.04 }}>
                      <div className="reg-review-card-header">
                        <Phone size={14} /><h4>Contact Details</h4>
                        <button onClick={() => setStep(1)} className="reg-review-edit"><PencilIcon /> Edit</button>
                      </div>
                      <div className="reg-review-card-body">
                        <div className="reg-kv"><span>Email</span><strong>{form.email}</strong></div>
                        <div className="reg-kv"><span>Phone</span><strong>{form.phone}</strong></div>
                        {(form.address || form.city || form.state) && (
                          <div className="reg-kv"><span>Address</span><strong>{[form.address, form.city, form.state, form.country].filter(Boolean).join(', ')}</strong></div>
                        )}
                      </div>
                    </motion.div>
                    <motion.div className="reg-review-card" {...fadeUp} transition={{ delay: 0.08 }}>
                      <div className="reg-review-card-header">
                        <GraduationCap size={14} /><h4>Training</h4>
                        <button onClick={() => setStep(2)} className="reg-review-edit"><PencilIcon /> Edit</button>
                      </div>
                      <div className="reg-review-card-body">
                        <div className="reg-kv"><span>Program</span><strong>{selectedTraining?.title || 'Not selected'}</strong></div>
                        {form.batch && <div className="reg-kv"><span>Batch</span><strong>{form.batch}</strong></div>}
                      </div>
                    </motion.div>
                    <motion.div className="reg-review-card" {...fadeUp} transition={{ delay: 0.12 }}>
                      <div className="reg-review-card-header">
                        <FileText size={14} /><h4>Documents</h4>
                        <button onClick={() => setStep(3)} className="reg-review-edit"><PencilIcon /> Edit</button>
                      </div>
                      <div className="reg-review-card-body">
                        <div className="reg-kv"><span>Resume</span><strong>{resumeFile ? resumeFile.name : 'Not uploaded'}</strong></div>
                        <div className="reg-kv"><span>Photo</span><strong>{photoFile ? photoFile.name : 'Not uploaded'}</strong></div>
                      </div>
                    </motion.div>
                  </div>
                  <label className="reg-terms-check">
                    <input type="checkbox" checked={form.agreeTerms} onChange={e => set('agreeTerms', e.target.checked)} />
                    <span>I agree to the <button type="button" className="reg-link-inline">Terms of Service</button> and <button type="button" className="reg-link-inline">Privacy Policy</button></span>
                  </label>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Fixed Bottom: Navigation */}
        <div className="reg-nav">
          <div className="reg-nav-left">
            {step > 0 && (
              <button className="reg-btn-back" onClick={() => { setStep(s => s - 1); setError('') }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            {step < 4 && (
              <button className="reg-btn-draft" onClick={handleSaveDraft}>
                <Save size={14} /> Save Draft
              </button>
            )}
          </div>
          <div className="reg-nav-right">
            {step < 4 ? (
              <button className="reg-btn-next" onClick={() => { setStep(s => s + 1); setError('') }} disabled={!canNext()}>
                Next <ChevronRight size={15} />
              </button>
            ) : step === 4 ? (
              <button className="reg-btn-submit" onClick={handleSubmit} disabled={!canNext()}>
                <Sparkles size={15} /> Submit Application
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
    </svg>
  )
}

export default RegistrationPage
