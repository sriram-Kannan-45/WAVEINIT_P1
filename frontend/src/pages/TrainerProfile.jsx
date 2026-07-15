import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, Star, BookOpen, Users, Award, TrendingUp,
  Edit3, ExternalLink, Globe, Mail, Phone, MessageSquare,
  Briefcase, GraduationCap, ChevronRight, Clock, Target, Zap, Link2, X, Plus
} from 'lucide-react'
import { Button, Badge, StatCard, ProgressBar } from '../components/ui'
import { useToast } from '../components/Toast'
import { API, assetUrl } from '../api/api'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
}

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
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [profileRes, trainRes, feedRes] = await Promise.all([
        fetch(API.PROFILE.GET, { headers: auth() }),
        fetch(`${API_BASE}/trainer/trainings`, { headers: auth() }),
        fetch(`${API_BASE}/trainer/feedbacks`, { headers: auth() }),
      ])
      const profileData = await profileRes.json()
      if (profileData.success && profileData.profile) {
        setProfile({ ...profileData.profile.user, ...profileData.profile, id: profileData.profile.userId })
        setExperiences(profileData.experiences || [])
        setEducations(profileData.educations || [])
      } else {
        const meRes = await fetch(`${API_BASE}/auth/me`, { headers: auth() })
        const meData = await meRes.json()
        if (meData.user) setProfile(meData.user)
      }
      const trainData = await trainRes.json()
      const list = trainData.trainings || []
      setTrainings(list)
      const feedData = await feedRes.json()
      const fList = feedData.feedbacks || []
      setFeedbacks(fList)
      setStats({
        totalCourses: list.length,
        totalLearners: list.reduce((s, t) => s + (t.enrolledCount || t.participantCount || 0), 0),
        avgRating: feedData.averageTrainerRating || 0,
        totalFeedback: fList.length,
      })
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const startEdit = () => {
    setEditForm({
      name: profile?.name || '',
      headline: profile?.headline || '',
      about: profile?.about || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      skills: Array.isArray(profile?.skills) ? profile.skills.join(', ') : '',
      certifications: Array.isArray(profile?.certifications) ? profile.certifications.join(', ') : '',
      linkedin: profile?.socialLinks?.linkedin || '',
      github: profile?.socialLinks?.github || '',
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
        skills: editForm.skills ? editForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        certifications: editForm.certifications ? editForm.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],
        socialLinks: {
          linkedin: editForm.linkedin,
          github: editForm.github,
          website: editForm.website,
        },
      }
      const r = await fetch(API.PROFILE.UPDATE, { method: 'PUT', headers: auth(), body: JSON.stringify(payload) })
      const d = await r.json()
      if (d.success) {
        setProfile(prev => ({ ...prev, ...payload, skills: payload.skills, certifications: payload.certifications, socialLinks: payload.socialLinks }))
        setEditing(false)
        success('Profile updated')
      } else showError(d.error || 'Failed to save')
    } catch (e) { showError(e.message) }
  }

  const addExperience = async (exp) => {
    try {
      const r = await fetch(API.PROFILE.ADD_EXPERIENCE, { method: 'POST', headers: auth(), body: JSON.stringify(exp) })
      const d = await r.json()
      if (d.success) { setExperiences(prev => [d.experience, ...prev]); success('Experience added') }
      else showError(d.error)
    } catch (e) { showError(e.message) }
  }

  const deleteExperience = async (id) => {
    try {
      await fetch(API.PROFILE.DELETE_EXPERIENCE(id), { method: 'DELETE', headers: auth() })
      setExperiences(prev => prev.filter(e => e.id !== id))
    } catch (e) { showError(e.message) }
  }

  const addEducation = async (edu) => {
    try {
      const r = await fetch(API.PROFILE.ADD_EDUCATION, { method: 'POST', headers: auth(), body: JSON.stringify(edu) })
      const d = await r.json()
      if (d.success) { setEducations(prev => [d.education, ...prev]); success('Education added') }
      else showError(d.error)
    } catch (e) { showError(e.message) }
  }

  const deleteEducation = async (id) => {
    try {
      await fetch(API.PROFILE.DELETE_EDUCATION(id), { method: 'DELETE', headers: auth() })
      setEducations(prev => prev.filter(e => e.id !== id))
    } catch (e) { showError(e.message) }
  }

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Present'

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Cover + Avatar */}
      <motion.div variants={item} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="h-48 md:h-56 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-700 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZG90cyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZG90cykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-40" />
        </div>
        <div className="px-6 md:px-8 pb-6 -mt-16 relative">
          <div className="flex flex-col md:flex-row items-start gap-5">
            <div className="w-32 h-32 rounded-2xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-lg flex items-center justify-center text-3xl font-bold bg-gradient-to-br from-primary-500 to-primary-400 text-white shrink-0">
              {profile?.imagePath ? (
                <img src={assetUrl(profile.imagePath)} alt="" className="w-full h-full rounded-xl object-cover" />
              ) : initials(profile?.name)}
            </div>
            <div className="flex-1 pt-4 md:pt-10">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{profile?.name || 'Trainer'}</h1>
                  <p className="text-sm text-slate-500 mt-1">{profile?.headline || 'Training Specialist'}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    {profile?.phone && <span className="flex items-center gap-1"><Phone size={11} /> {profile.phone}</span>}
                    {profile?.address && <span className="flex items-center gap-1"><MapPin size={11} /> {profile.address}</span>}
                  </div>
                </div>
                <Button onClick={startEdit} variant="outline" size="sm" icon={Edit3}>Edit Profile</Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, value: stats.totalCourses, label: 'Courses', color: 'text-primary-600 bg-primary-50 dark:bg-primary-950/30' },
          { icon: Users, value: stats.totalLearners, label: 'Learners', color: 'text-primary-600 bg-primary-50 dark:bg-primary-950/30' },
          { icon: Star, value: `${Number(stats.avgRating || 0).toFixed(1)}`, label: 'Avg Rating', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
          { icon: MessageSquare, value: stats.totalFeedback, label: 'Reviews', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 ${s.color}`}><s.icon size={18} /></div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* About */}
      {(profile?.about || editing) && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">About</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
            {profile?.about || 'No bio added yet.'}
          </p>
        </motion.div>
      )}

      {/* Skills */}
      {Array.isArray(profile?.skills) && profile.skills.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((s, i) => (
              <span key={i} className="px-3 py-1.5 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">{s}</span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Experience */}
      <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Experience</h2>
        </div>
        {experiences.length === 0 ? (
          <p className="text-sm text-slate-400">No experience added yet.</p>
        ) : (
          <div className="space-y-4">
            {experiences.map(exp => (
              <div key={exp.id} className="flex gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-400 flex items-center justify-center text-white shrink-0">
                  <Briefcase size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{exp.title}</h3>
                      <p className="text-xs text-slate-500">{exp.company}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(exp.startDate)} — {exp.isCurrent ? 'Present' : fmtDate(exp.endDate)}</p>
                    </div>
                    <button onClick={() => deleteExperience(exp.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"><X size={14} /></button>
                  </div>
                  {exp.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{exp.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Education */}
      <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Education</h2>
        {educations.length === 0 ? (
          <p className="text-sm text-slate-400">No education added yet.</p>
        ) : (
          <div className="space-y-4">
            {educations.map(edu => (
              <div key={edu.id} className="flex gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
                  <GraduationCap size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{edu.degree || edu.school}</h3>
                      <p className="text-xs text-slate-500">{edu.school}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{edu.startYear} — {edu.endYear || 'Present'}</p>
                    </div>
                    <button onClick={() => deleteEducation(edu.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"><X size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Social Links */}
      {profile?.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Social Links</h2>
          <div className="flex flex-wrap gap-3">
            {profile.socialLinks.linkedin && (
              <a href={profile.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-xl text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <Link2 size={14} /> LinkedIn
              </a>
            )}
            {profile.socialLinks.github && (
              <a href={profile.socialLinks.github} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <Globe size={14} /> GitHub
              </a>
            )}
            {profile.socialLinks.website && (
              <a href={profile.socialLinks.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-950/30 text-primary-600 rounded-xl text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                <Globe size={14} /> Website
              </a>
            )}
          </div>
        </motion.div>
      )}

      {/* Recent Courses */}
      {trainings.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Recent Courses</h2>
          <div className="space-y-3">
            {trainings.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-400 flex items-center justify-center text-white"><BookOpen size={16} /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{t.title}</h3>
                  <p className="text-[11px] text-slate-400">{t.enrolledCount || t.participantCount || 0} learners</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Profile</h2>
              <button onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'name', label: 'Full Name', placeholder: 'John Doe' },
                { key: 'headline', label: 'Headline', placeholder: 'Senior Trainer | React & Node.js Expert' },
                { key: 'about', label: 'About', placeholder: 'Tell us about yourself...', multiline: true },
                { key: 'skills', label: 'Skills (comma separated)', placeholder: 'React, Node.js, Python' },
                { key: 'certifications', label: 'Certifications (comma separated)', placeholder: 'AWS Certified, PMP' },
                { key: 'phone', label: 'Phone', placeholder: '+1 234 567 890' },
                { key: 'address', label: 'Location', placeholder: 'New York, NY' },
                { key: 'linkedin', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/...' },
                { key: 'github', label: 'GitHub URL', placeholder: 'https://github.com/...' },
                { key: 'website', label: 'Website URL', placeholder: 'https://...' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
                  {f.multiline ? (
                    <textarea value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} rows={3} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500" />
                  ) : (
                    <input value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500" />
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button onClick={saveProfile}>Save Changes</Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
