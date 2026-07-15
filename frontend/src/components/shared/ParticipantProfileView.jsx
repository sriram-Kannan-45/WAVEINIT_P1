import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Mail, Calendar, Sparkles, Globe, Code2, Briefcase, Bird,
  Tag, FileText, User as UserIcon, ExternalLink, AlertCircle,
} from 'lucide-react'
import { API_BASE, assetUrl } from '../../api/api'
import { getAuthHeaders } from '../../api/request'

/**
 * ParticipantProfileView
 * ───────────────────────────────────────────────────────────────────────
 * Read-only modal showing a participant's full profile (avatar, bio,
 * skills, social links, course info pulled from the auth User record).
 *
 * Used by:
 *   - AdminDashboard → ParticipantList row "View profile" action
 *   - TrainerDashboard → clickable participant name in the feedback table
 *
 * Backend: GET /api/participant-profile/:userId (ADMIN + TRAINER only).
 *
 * Props:
 *   open       — boolean
 *   userId     — participant's user.id
 *   fallback   — optional { name, email, createdAt } to show while loading
 *   onClose    — fn()
 */
export default function ParticipantProfileView({ open, userId, fallback, onClose }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch when opened
  useEffect(() => {
    if (!open || !userId) {
      setProfile(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/participant-profile/${userId}`, { headers: getAuthHeaders() })
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (cancelled) return
        if (!ok) {
          setError(data?.error || `HTTP ${status}`)
          setProfile(null)
        } else {
          setProfile(data.profile)
        }
      })
      .catch((e) => {
        if (!cancelled) { setError(e.message || 'Failed to load profile'); setProfile(null) }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, userId])

  // ESC + body scroll lock
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  const user = profile?.user || fallback || null
  const displayName = profile?.displayName || user?.name || 'Participant'
  const initials = (displayName || 'U')
    .trim().split(/\s+/).map((p) => p[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
  const joined = (() => {
    const d = user?.createdAt
    if (!d) return null
    try {
      const dt = new Date(d)
      return isNaN(dt) ? null : dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    } catch { return null }
  })()

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="bg"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ppv-title"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              width: '100%', maxWidth: 560, maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 60px -12px rgba(15,23,42,0.30)',
            }}
          >
            {/* Header */}
            <div
              style={{
                position: 'relative',
                padding: '24px 24px 20px',
                background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 32, height: 32,
                  borderRadius: 8, border: 0,
                  background: 'rgba(15,23,42,0.04)',
                  color: '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 160ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.04)' }}
              >
                <X size={16} />
              </button>

              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {/* Avatar */}
                <div
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    overflow: 'hidden', flexShrink: 0,
                    background: 'linear-gradient(135deg, #475569, #1e293b)',
                    color: '#fff', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    fontWeight: 700, fontSize: 24,
                    boxShadow: '0 0 0 1px #e2e8f0, 0 4px 12px -2px rgba(15,23,42,0.10)',
                  }}
                >
                  {profile?.avatarUrl ? (
                    <img src={assetUrl(profile.avatarUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2
                    id="ppv-title"
                    style={{
                      margin: 0,
                      fontFamily: "'Outfit', system-ui, sans-serif",
                      fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em',
                      color: '#0f172a',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {displayName}
                  </h2>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginTop: 4,
                      fontSize: 13, color: '#64748b',
                    }}
                  >
                    <UserIcon size={13} />
                    <span style={{ textTransform: 'capitalize' }}>
                      {(user?.role || 'participant').toLowerCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading && (
                <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                  Loading profile…
                </p>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    fontSize: 13,
                  }}
                >
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              {!loading && !error && (
                <>
                  {/* Email + joined info row */}
                  <InfoRow icon={Mail} label="Email" value={user?.email} />
                  {joined && <InfoRow icon={Calendar} label="Joined" value={joined} />}

                  {/* Bio */}
                  {profile?.bio && (
                    <Section title="About" icon={FileText}>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#334155' }}>
                        {profile.bio}
                      </p>
                    </Section>
                  )}

                  {/* Skills */}
                  {profile?.skills?.length > 0 && (
                    <Section title="Skills" icon={Tag}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profile.skills.map((s, i) => (
                          <span
                            key={s + i}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12, fontWeight: 600,
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Sparkles size={10} /> {s}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Links */}
                  {profile?.links && Object.values(profile.links).some(Boolean) && (
                    <Section title="Links" icon={Globe}>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {profile.links.website && <LinkRow icon={Globe} url={profile.links.website} label="Website" />}
                        {profile.links.github && <LinkRow icon={Code2} url={profile.links.github} label="GitHub" />}
                        {profile.links.linkedin && <LinkRow icon={Briefcase} url={profile.links.linkedin} label="LinkedIn" />}
                        {profile.links.twitter && <LinkRow icon={Bird} url={profile.links.twitter} label="Twitter" />}
                      </ul>
                    </Section>
                  )}

                  {/* Empty state — profile exists but is blank */}
                  {!profile?.bio && !profile?.skills?.length &&
                   (!profile?.links || !Object.values(profile.links).some(Boolean)) && (
                    <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', margin: '12px 0' }}>
                      This participant hasn't filled in their profile yet.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ───── Helpers ──────────────────────────────────────────────────────── */
function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
      <span
        style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: '#f1f5f9', color: '#475569',
          flexShrink: 0,
        }}
      >
        <Icon size={14} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </div>
        <div style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <section>
      <div
        style={{
          fontSize: 11, fontWeight: 700, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 0.5,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          marginBottom: 6,
        }}
      >
        <Icon size={11} /> {title}
      </div>
      {children}
    </section>
  )
}

function LinkRow({ icon: Icon, url, label }) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12.5, fontWeight: 600,
          color: '#1e293b',
          textDecoration: 'none',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          maxWidth: '100%',
        }}
      >
        <Icon size={13} style={{ color: '#64748b', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <ExternalLink size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
      </a>
    </li>
  )
}
