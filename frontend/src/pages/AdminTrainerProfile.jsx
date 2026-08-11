import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MapPin, BookOpen, Users, Award,
  ArrowLeft, Mail, Phone, Link2, Globe, Briefcase, GraduationCap
} from 'lucide-react'
import { API, assetUrl } from '../api/api'
import { useToast } from '../components/Toast'

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
    <div className="reg-admin" style={{ padding: '48px 0' }}>
      <div className="reg-admin-loading">
        <span className="bulk-spin" />
        Loading trainer profile...
      </div>
    </div>
  )

  const profile = data?.profile
  const experiences = data?.experiences || []
  const educations = data?.educations || []
  const stats = data?.stats || { courseCount: 0, enrolledCount: 0 }

  if (!profile) return (
    <div className="reg-admin">
      <div className="reg-admin-empty" style={{ padding: '64px 0' }}>
        <Users size={28} />
        <div className="reg-admin-empty-title">Trainer profile not found.</div>
        <div className="reg-admin-empty-sub">This trainer may not have a public profile yet.</div>
        <button className="reg-admin-btn reg-admin-btn--secondary" type="button" style={{ cursor: 'pointer', marginTop: 8 }} onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Go back
        </button>
      </div>
    </div>
  )

  const skills = Array.isArray(profile.skills) ? profile.skills : []
  const certs = Array.isArray(profile.certifications) ? profile.certifications : []
  const social = profile.socialLinks || {}

  return (
    <div className="reg-admin" style={{ maxWidth: 1000, margin: '0 auto', gap: 20, paddingBottom: 40 }}>
      {/* Back */}
      <div>
        <button
          className="reg-admin-btn reg-admin-btn--secondary"
          type="button"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={15} /> Back to trainers
        </button>
      </div>

      {/* Cover + Avatar */}
      <div className="reg-admin-table-wrap" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ height: 140, background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 45%, #0f766e 100%)', position: 'relative' }}>
          <div
            style={{
              position: 'absolute', inset: 0, opacity: 0.35,
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
        </div>
        <div style={{ padding: '0 24px 20px', marginTop: -52, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 104, height: 104, borderRadius: 18, background: '#fff', border: '4px solid #fff', boxShadow: '0 6px 18px rgba(15,23,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {profile.imagePath ? (
                <img src={assetUrl(profile.imagePath)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 30, fontWeight: 700, color: '#0d9488', fontFamily: 'var(--font-primary)' }}>{initials(profile.user?.name)}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-primary)', margin: 0 }}>{profile.user?.name || 'Trainer'}</h1>
              <p style={{ fontSize: 14, color: '#64748b', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{profile.headline || 'Trainer'}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>
                {profile.user?.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} /> {profile.user.email}</span>}
                {profile.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={12} /> {profile.phone}</span>}
                {profile.address && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} /> {profile.address}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="reg-admin-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[
          { icon: BookOpen, value: stats.courseCount, label: 'Courses', bg: '#f0fdf4', color: '#16a34a' },
          { icon: Users, value: stats.enrolledCount, label: 'Total Learners', bg: '#f0f9ff', color: '#0284c7' },
          { icon: Award, value: certs.length, label: 'Certifications', bg: '#fffbeb', color: '#d97706' },
        ].map(s => (
          <div key={s.label} className="reg-admin-stat">
            <div className="reg-admin-stat-icon" style={{ background: s.bg, color: s.color }}>
              <s.icon size={19} />
            </div>
            <div>
              <div className="reg-admin-stat-num">{s.value}</div>
              <div className="reg-admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* About */}
      {profile.about && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">About</h3>
          </div>
          <div className="reg-card-body">
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#475569', fontFamily: 'var(--font-primary)', margin: 0, whiteSpace: 'pre-line' }}>{profile.about}</p>
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">Skills</h3>
          </div>
          <div className="reg-card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {skills.map((s, i) => (
                <span key={i} style={{ padding: '6px 14px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-primary)' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Experience */}
      {experiences.length > 0 && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">Experience</h3>
          </div>
          <div className="reg-card-body" style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {experiences.map(exp => (
                <div key={exp.id} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #0d9488, #0f766e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    <Briefcase size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-primary)', margin: 0 }}>{exp.title}</h4>
                    <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{exp.company}</p>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{fmtDate(exp.startDate)} — {exp.isCurrent ? 'Present' : fmtDate(exp.endDate)}</p>
                    {exp.description && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569', marginTop: 8, fontFamily: 'var(--font-primary)' }}>{exp.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Education */}
      {educations.length > 0 && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">Education</h3>
          </div>
          <div className="reg-card-body" style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {educations.map(edu => (
                <div key={edu.id} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #059669, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    <GraduationCap size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-primary)', margin: 0 }}>{edu.degree || edu.school}</h4>
                    <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{edu.school}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ''}</p>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{edu.startYear} — {edu.endYear || 'Present'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Certifications */}
      {certs.length > 0 && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">Certifications</h3>
          </div>
          <div className="reg-card-body" style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {certs.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#475569', fontFamily: 'var(--font-primary)' }}>
                  <Award size={15} style={{ color: '#f59e0b', flexShrink: 0 }} /> {c}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Social Links */}
      {Object.values(social).some(Boolean) && (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <h3 className="reg-card-title">Social Links</h3>
          </div>
          <div className="reg-card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {social.linkedin && (
                <a href={social.linkedin} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 11, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-primary)', transition: 'all 150ms ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff' }}>
                  <Link2 size={14} /> LinkedIn
                </a>
              )}
              {social.github && (
                <a href={social.github} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#f1f5f9', color: '#334155', borderRadius: 11, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-primary)', transition: 'all 150ms ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}>
                  <Globe size={14} /> GitHub
                </a>
              )}
              {social.website && (
                <a href={social.website} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#f0fdf4', color: '#15803d', borderRadius: 11, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-primary)', transition: 'all 150ms ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4' }}>
                  <Globe size={14} /> Website
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
