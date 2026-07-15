import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, Star, BookOpen, Users, Award, TrendingUp,
  ArrowLeft, Mail, Phone, Link2, Globe, Briefcase, GraduationCap
} from 'lucide-react'
import { API, assetUrl } from '../api/api'
import { useToast } from '../components/Toast'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }

export default function AdminTrainerProfile({ user }) {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { error: showError } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchProfile() }, [userId])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.PROFILE.PUBLIC(userId), {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      })
      const d = await r.json()
      if (d.success) setData(d)
      else showError(d.error || 'Failed to load profile')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Present'

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const profile = data?.profile
  const experiences = data?.experiences || []
  const educations = data?.educations || []
  const stats = data?.stats || { courseCount: 0, enrolledCount: 0 }

  if (!profile) return (
    <div className="max-w-5xl mx-auto text-center py-20 text-slate-400">
      <p>Trainer profile not found.</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-primary-600 text-sm font-medium hover:underline">Go back</button>
    </div>
  )

  const skills = Array.isArray(profile.skills) ? profile.skills : []
  const certs = Array.isArray(profile.certifications) ? profile.certifications : []
  const social = profile.socialLinks || {}

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Back */}
      <motion.div variants={item}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft size={16} /> Back to trainers
        </button>
      </motion.div>

      {/* Cover + Avatar */}
      <motion.div variants={item} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="h-48 md:h-56 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-600 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZG90cyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZG90cykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-40" />
        </div>
        <div className="px-6 md:px-8 pb-6 -mt-16 relative">
          <div className="flex flex-col md:flex-row items-start gap-5">
            <div className="w-32 h-32 rounded-2xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-lg flex items-center justify-center text-3xl font-bold bg-gradient-to-br from-primary-500 to-primary-400 text-white shrink-0">
              {profile.imagePath ? (
                <img src={assetUrl(profile.imagePath)} alt="" className="w-full h-full rounded-xl object-cover" />
              ) : initials(profile.user?.name)}
            </div>
            <div className="flex-1 pt-4 md:pt-10">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{profile.user?.name || 'Trainer'}</h1>
              <p className="text-sm text-slate-500 mt-1">{profile.headline || 'Trainer'}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                {profile.user?.email && <span className="flex items-center gap-1"><Mail size={11} /> {profile.user.email}</span>}
                {profile.phone && <span className="flex items-center gap-1"><Phone size={11} /> {profile.phone}</span>}
                {profile.address && <span className="flex items-center gap-1"><MapPin size={11} /> {profile.address}</span>}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { icon: BookOpen, value: stats.courseCount, label: 'Courses', color: 'text-primary-600 bg-primary-50 dark:bg-primary-950/30' },
          { icon: Users, value: stats.enrolledCount, label: 'Total Learners', color: 'text-primary-700 bg-primary-100 dark:bg-primary-950/30' },
          { icon: Award, value: certs.length, label: 'Certifications', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 ${s.color}`}><s.icon size={18} /></div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* About */}
      {profile.about && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">About</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">{profile.about}</p>
        </motion.div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={i} className="px-3 py-1.5 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">{s}</span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Experience */}
      {experiences.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Experience</h2>
          <div className="space-y-4">
            {experiences.map(exp => (
              <div key={exp.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-400 flex items-center justify-center text-white shrink-0"><Briefcase size={16} /></div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{exp.title}</h3>
                  <p className="text-xs text-slate-500">{exp.company}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(exp.startDate)} — {exp.isCurrent ? 'Present' : fmtDate(exp.endDate)}</p>
                  {exp.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{exp.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Education */}
      {educations.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Education</h2>
          <div className="space-y-4">
            {educations.map(edu => (
              <div key={edu.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0"><GraduationCap size={16} /></div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{edu.degree || edu.school}</h3>
                  <p className="text-xs text-slate-500">{edu.school}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{edu.startYear} — {edu.endYear || 'Present'}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Certifications */}
      {certs.length > 0 && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Certifications</h2>
          <div className="space-y-2">
            {certs.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Award size={14} className="text-amber-500 shrink-0" /> {c}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Social Links */}
      {Object.values(social).some(Boolean) && (
        <motion.div variants={item} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Social Links</h2>
          <div className="flex flex-wrap gap-3">
            {social.linkedin && (
              <a href={social.linkedin} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-xl text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <Link2 size={14} /> LinkedIn
              </a>
            )}
            {social.github && (
              <a href={social.github} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <Globe size={14} /> GitHub
              </a>
            )}
            {social.website && (
              <a href={social.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-950/30 text-primary-600 rounded-xl text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                <Globe size={14} /> Website
              </a>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
