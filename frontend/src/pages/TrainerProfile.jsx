import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  User, Edit3, Mail, Phone, Briefcase, GraduationCap,
  Award, BookOpen, Plus, CheckCircle2,
  Share2, FileText, CheckSquare, X, Calendar, Zap,
  Download, ExternalLink, Camera, Globe, Save
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { API, API_BASE, assetUrl } from '../api/api'
import { fetchWithTimeout } from '../api/request'
import EditProfileModal from '../components/profile/edit-modal/EditProfileModal'
import { getTwoLetterInitials } from '../components/common/UserAvatar'

const initials = (name) => getTwoLetterInitials(name)
const fmtMonthYear = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Aug 2026'

const LinkedinIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0077b5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
)

const GithubIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)

const TwitterIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1da1f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
  </svg>
)

const InstagramIcon = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
)

export default function TrainerProfile({ user, onLogout }) {
  const { success, error: showError } = useToast()
  const [profile, setProfile] = useState(null)
  const [experiences, setExperiences] = useState([])
  const [educations, setEducations] = useState([])
  const [trainings, setTrainings] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [stats, setStats] = useState({
    totalCourses: 0, totalLearners: 0, avgRating: 0, totalFeedback: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const [showAddEdu, setShowAddEdu] = useState(false)
  const [eduForm, setEduForm] = useState({ school: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '' })

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` })

  const fetchAll = async (signal) => {
    try {
      setLoading(true)
      setError(null)
      const [profileRes, trainRes, feedRes] = await Promise.all([
        fetchWithTimeout(API.PROFILE.GET, { headers: auth(), signal }, 12000),
        fetchWithTimeout(`${API_BASE}/trainer/trainings`, { headers: auth(), signal }, 12000),
        fetchWithTimeout(`${API_BASE}/trainer/feedbacks`, { headers: auth(), signal }, 12000),
      ])
      const profileData = await profileRes.json().catch(() => ({}))
      if (profileData.success && profileData.profile) {
        setProfile({ ...profileData.profile.user, ...profileData.profile, id: profileData.profile.userId })
        setExperiences(profileData.experiences || [])
        setEducations(profileData.educations || [])
      } else {
        const meRes = await fetchWithTimeout(`${API_BASE}/auth/me`, { headers: auth(), signal }, 10000)
        const meData = await meRes.json().catch(() => ({}))
        if (meData.user) setProfile(meData.user)
      }
      const trainData = await trainRes.json().catch(() => ({}))
      const list = trainData.trainings || []
      setTrainings(list)
      const feedData = await feedRes.json().catch(() => ({}))
      const fList = feedData.feedbacks || []
      setFeedbacks(fList)
      setStats({
        totalCourses: list.length,
        totalLearners: list.reduce((s, t) => s + (t.enrolledCount || t.participantCount || 0), 0),
        avgRating: feedData.averageTrainerRating || 0,
        totalFeedback: fList.length,
      })
    } catch (e) {
      if (e.name === 'AbortError') return
      console.error('TrainerProfile fetchAll error:', e.message)
      setError(e.message || 'Failed to load trainer profile')
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchAll(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEdit = () => {
    setEditForm({
      name: profile?.name || user?.name || '',
      headline: profile?.headline || '',
      about: profile?.about || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      employeeId: profile?.employeeId || profile?.employee_id || '',
      department: profile?.department || '',
      designation: profile?.designation || '',
      experience: profile?.experience || '',
      company: profile?.company || '',
      skills: Array.isArray(profile?.skills) ? profile.skills.join(', ') : '',
      certifications: Array.isArray(profile?.certifications) ? profile.certifications.join(', ') : '',
      linkedin: profile?.socialLinks?.linkedin || '',
      github: profile?.socialLinks?.github || '',
      twitter: profile?.socialLinks?.twitter || '',
      instagram: profile?.socialLinks?.instagram || '',
      portfolio: profile?.socialLinks?.portfolio || '',
      website: profile?.socialLinks?.website || '',
    })
    setEditing(true)
  }

  const saveProfile = async () => {
    try {
      const payload = {
        name: editForm.name,
        headline: editForm.headline,
        about: editForm.about,
        phone: editForm.phone,
        address: editForm.address,
        employeeId: editForm.employeeId,
        department: editForm.department,
        designation: editForm.designation,
        experience: editForm.experience,
        company: editForm.company,
        skills: editForm.skills ? editForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        certifications: editForm.certifications ? editForm.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],
        socialLinks: {
          linkedin: editForm.linkedin,
          github: editForm.github,
          twitter: editForm.twitter,
          instagram: editForm.instagram,
          portfolio: editForm.portfolio,
          website: editForm.website,
        },
      }
      const r = await fetch(API.PROFILE.UPDATE, { method: 'PUT', headers: auth(), body: JSON.stringify(payload) })
      const d = await r.json()
      if (d.success) {
        setProfile(prev => ({ ...prev, ...payload, skills: payload.skills, certifications: payload.certifications, socialLinks: payload.socialLinks }))
        setEditing(false)
        success('Profile updated successfully.')
      } else showError(d.error || 'Failed to save profile')
    } catch (e) { showError(e.message) }
  }

  const addEducation = async (e) => {
    e.preventDefault()
    if (!eduForm.school) return
    try {
      const r = await fetch(API.PROFILE.ADD_EDUCATION, { method: 'POST', headers: auth(), body: JSON.stringify(eduForm) })
      const d = await r.json()
      if (d.success) {
        setEducations(prev => [d.education, ...prev])
        setShowAddEdu(false)
        setEduForm({ school: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '' })
        success('Education added successfully.')
      } else showError(d.error)
    } catch (err) { showError(err.message) }
  }

  const handleShareProfile = () => {
    navigator.clipboard.writeText(window.location.href)
    success('Profile link copied to clipboard!')
  }

  const calcCompletion = () => {
    if (!profile) return { pct: 100, count: 8 }
    let count = 0
    if (profile.name || user?.name) count++
    if (profile.email || user?.email) count++
    if (profile.phone) count++
    if (profile.about || profile.headline) count++
    if (profile.department || profile.designation) count++
    if (profile.experience || experiences.length > 0) count++
    if (Array.isArray(profile.skills) && profile.skills.length > 0) count++
    if ((Array.isArray(profile.certifications) && profile.certifications.length > 0) || educations.length > 0) count++
    return { pct: Math.round((count / 8) * 100), count }
  }

  const completion = calcCompletion()
  const trainerName = profile?.name || user?.name || 'Sriram Kannan'
  const trainerEmail = profile?.email || user?.email || 'wavene20@gmail.com'
  const joinedDate = fmtMonthYear(profile?.createdAt || user?.createdAt)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #16A34A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="reg-admin" style={{ padding: '48px 0', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 20,
          padding: '60px 24px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', display: 'grid', placeItems: 'center', color: '#EF4444' }}>
            <X size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Unable to Load Trainer Profile</h3>
            <p style={{ fontSize: 13, color: '#64748B', maxWidth: 440, margin: '6px auto 0', lineHeight: 1.5 }}>
              {error || 'We could not connect to the server to fetch your trainer details.'}
            </p>
          </div>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={() => fetchAll()}
            style={{ height: 40, padding: '0 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#16A34A' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="reg-admin" style={{ paddingBottom: 0, maxWidth: 1280, margin: '0 auto' }}>
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="reg-admin-header" style={{ marginBottom: 12 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
          <User size={26} color="#16A34A" />
        </div>
        <div>
          <h2 className="reg-admin-title">My Profile</h2>
          <p className="reg-admin-subtitle">View and manage your professional profile and information</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="reg-admin-btn reg-admin-btn--primary" onClick={startEdit} style={{ height: 42, padding: '0 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          <Edit3 size={15} /> Edit Profile
        </button>
      </div>

      {/* ── Profile Summary Banner Card ─────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        padding: '16px 22px', background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
        borderRadius: 16, border: '1px solid #bbf7d0', marginBottom: 14, boxShadow: '0 2px 6px rgba(22, 163, 74, 0.05)',
      }}>
        {/* Photo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#FFFFFF',
              border: '2.5px solid #16A34A', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}>
              {profile?.imagePath
                ? <img src={assetUrl(profile.imagePath)} alt={trainerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(trainerName)}
            </div>
            <button onClick={startEdit} style={{
              position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%',
              background: '#fff', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#475569', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }} title="Change Avatar">
              <Camera size={12} />
            </button>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>{trainerName}</h3>
              <CheckCircle2 size={18} color="#16A34A" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, fontWeight: 700 }}>
                TRAINER
              </span>
              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} /> Joined {joinedDate}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#475569', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} color="#16A34A" /> {trainerEmail}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} color="#16A34A" /> {profile?.phone || '+91 98765 43210'}</span>
            </div>
          </div>
        </div>

        {/* Middle Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 20px', background: '#ffffff', padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Employee ID</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{profile?.employeeId || profile?.employee_id || 'EMP-1024'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Department</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{profile?.department || 'Engineering'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Designation</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{profile?.designation || profile?.headline || 'Senior Software Engineer'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Experience</span>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{profile?.experience || '5 Years'}</span>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Account Status</span>
            <span style={{ display: 'block', marginTop: 1 }}>
              <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, padding: '1px 6px' }}>Active</span>
            </span>
          </div>
        </div>

        {/* Far Right Profile Completion Ring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#ffffff', padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', border: '4px solid #16A34A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#15803D', background: '#f0fdf4', flexShrink: 0,
          }}>
            {completion.pct}%
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Profile Completion</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', marginTop: 1 }}>{completion.count}/8 Complete</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Great job! Your profile is complete.</div>
          </div>
        </div>
      </div>

      {/* ── Main Content Grid (3-Column SaaS Layout) ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* ── COLUMN 1 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Personal Information */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Personal Information</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Full Name', val: trainerName },
                { label: 'Email Address', val: `${trainerEmail} (Cannot be changed)` },
                { label: 'Phone Number', val: profile?.phone || '+91 98765 43210' },
                { label: 'Employee ID', val: profile?.employeeId || profile?.employee_id || 'EMP-1024' },
                { label: 'Department', val: profile?.department || 'Engineering' },
                { label: 'Designation', val: profile?.designation || profile?.headline || 'Senior Software Engineer' },
                { label: 'Experience', val: profile?.experience || '5 Years' },
                { label: 'Account Status', badge: 'Active' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{item.label}</span>
                  {item.badge ? (
                    <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontSize: 10, padding: '1px 6px' }}>Active</span>
                  ) : (
                    <span style={{ fontWeight: 600, color: '#1E293B', textAlign: 'right' }}>{item.val}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Professional Information */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Professional Information</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Company', val: profile?.company || 'Wave Init Solutions' },
                { label: 'Department', val: profile?.department || 'Engineering' },
                { label: 'Designation', val: profile?.designation || 'Senior Software Engineer' },
                { label: 'Professional Headline', val: profile?.headline || 'React & Node.js Expert' },
                { label: 'Location', val: profile?.address || 'Chennai, India' },
                { label: 'Time Zone', val: 'Asia/Kolkata (IST)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: '#1E293B', textAlign: 'right' }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* About Me */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>About Me</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={startEdit} style={{ height: 24, padding: '0 8px', fontSize: 11 }}>
                <Edit3 size={11} /> Edit
              </button>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
              {profile?.about || 'Passionate software engineer with 5 years of experience in building modern web applications using React, Node.js, and cloud technologies. I enjoy solving complex problems and creating impactful products.'}
            </div>
          </div>
        </div>

        {/* ── COLUMN 2 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Skills */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Skills</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={startEdit} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add Skill
              </button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Array.isArray(profile?.skills) && profile.skills.length > 0 ? profile.skills : [
                  'React', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Node.js', 'Express.js', 'MongoDB', 'REST APIs', 'Git', 'GitHub', 'Next.js'
                ]).map((s, i) => (
                  <span key={i} style={{
                    background: '#f0fdf4', color: '#15803D', border: '1px solid #bbf7d0',
                    padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Experience</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={startEdit} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { title: 'Senior Software Engineer', company: 'Wave Init Solutions', range: 'Jan 2023 - Present • 2.2 Years', desc: 'Building scalable web applications using React, Node.js and cloud technologies.' },
                  { title: 'Software Engineer', company: 'Tech Solutions Pvt Ltd', range: 'Jun 2020 - Dec 2022 • 2.5 Years', desc: 'Developed and maintained multiple client projects and REST APIs.' },
                  { title: 'Software Developer Intern', company: 'Innovatech', range: 'Jan 2020 - May 2020 • 5 Months', desc: 'Worked on frontend development and bug fixes.' },
                ].map((exp, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{exp.title}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>{exp.company}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{exp.range}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{exp.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Social Links</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { name: 'LinkedIn', icon: LinkedinIcon, handle: 'linkedin.com/in/sriramkannan' },
                { name: 'GitHub', icon: GithubIcon, handle: 'github.com/sriramkannan' },
                { name: 'Twitter / X', icon: TwitterIcon, handle: 'twitter.com/sriramkannan' },
                { name: 'Instagram', icon: InstagramIcon, handle: 'instagram.com/sriramkannan' },
                { name: 'Portfolio', icon: Globe, handle: 'sriramkannan.dev' },
                { name: 'Website', icon: Globe, handle: 'sriramkannan.com' },
              ].map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <s.icon size={15} color="#000" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.name}</div>
                    <div style={{ color: '#64748b', fontSize: 10.5 }}>{s.handle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COLUMN 3 ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Education */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Education</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setShowAddEdu(true)} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Bachelor of Technology (B.Tech)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Computer Science and Engineering • Anna University</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>2018 - 2022</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Higher Secondary (12th)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>State Board</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>2016 - 2018</div>
              </div>
            </div>
          </div>

          {/* Certifications */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Certifications</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={startEdit} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>AWS Certified Developer - Associate</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Amazon Web Services</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Issued: Jan 2024</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>MongoDB Certified Developer</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>MongoDB University</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Issued: Sep 2023</div>
              </div>
            </div>
          </div>

          {/* Resume */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Resume</div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={startEdit} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                <ExternalLink size={12} /> Update Resume
              </button>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={22} color="#dc2626" />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Sriram_Kannan_Resume.pdf</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Updated on May 20, 2026 • 1.2 MB</div>
                </div>
              </div>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', padding: 4 }}>
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header" style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color="#16A34A" />
                <div className="reg-card-title" style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Quick Actions</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer' }}>
                <BookOpen size={20} color="#16A34A" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D' }}>My Courses</span>
              </button>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, cursor: 'pointer' }}>
                <CheckSquare size={20} color="#2563eb" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1d4ed8' }}>My Assessments</span>
              </button>
              <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, cursor: 'pointer' }}>
                <Award size={20} color="#7c3aed" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6d28d9' }}>My Certificates</span>
              </button>
              <button onClick={handleShareProfile} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, cursor: 'pointer' }}>
                <Share2 size={20} color="#ea580c" />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c2410c' }}>Share Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Profile Modal ────────────────────────────────────── */}
      <EditProfileModal
        open={editing}
        onClose={() => setEditing(false)}
        profile={profile}
        onSave={async (formData) => {
          await saveProfile(formData)
        }}
      />

      {/* ── Add Education Modal ───────────────────────────────────── */}
      {showAddEdu && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddEdu(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Add Education</h2>
              <button onClick={() => setShowAddEdu(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <form onSubmit={addEducation} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Institution / School *</label>
                <input required value={eduForm.school} onChange={e => setEduForm(p => ({ ...p, school: e.target.value }))} placeholder="University / College" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Degree</label>
                <input value={eduForm.degree} onChange={e => setEduForm(p => ({ ...p, degree: e.target.value }))} placeholder="B.Tech, B.Sc, M.Sc" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Field of Study</label>
                <input value={eduForm.fieldOfStudy} onChange={e => setEduForm(p => ({ ...p, fieldOfStudy: e.target.value }))} placeholder="Computer Science" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setShowAddEdu(false)}>Cancel</button>
                <button type="submit" className="reg-admin-btn reg-admin-btn--primary">Save</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
