import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, User, BookOpen, X, CheckCircle, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button, Badge } from '../../ui'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const courseStatus = (start, end) => {
  if (!start || !end) return { label: 'Self-paced', variant: 'info' }
  const now = Date.now()
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (now < s) return { label: 'Upcoming', variant: 'info' }
  if (now > e) return { label: 'Completed', variant: 'success' }
  return { label: 'In progress', variant: 'success' }
}

export default function MyEnrollments({ enrollments = [], loading = false, onCancel }) {
  const [confirmId, setConfirmId] = useState(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--neutral-900)', letterSpacing: '-0.03em', margin: 0, marginBottom: 4 }}>My Courses</h2>
        <p style={{ fontSize: 14, color: 'var(--neutral-500)', margin: 0 }}>Courses you've joined &middot; {enrollments.length} active</p>
      </div>

      {loading && enrollments.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-6)' }}>
          {[1, 2].map((i) => (
            <div key={i} className="enterprise-card">
              <div className="enterprise-card__body">
                <div className="skeleton" style={{ height: 18, width: '60%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 12, width: '90%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '70%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && enrollments.length === 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card__body">
            <div className="empty-state">
              <div className="empty-state__icon" style={{ background: 'var(--brand-participant-bg)', color: 'var(--brand-participant)' }}>
                <BookOpen size={28} />
              </div>
              <h3 className="empty-state__title">You haven't joined any course yet</h3>
              <p className="empty-state__description">Browse the course catalogue and tap "Join Course" to enroll.</p>
            </div>
          </div>
        </div>
      )}

      {enrollments.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
          {enrollments.map((e, i) => {
            const status = courseStatus(e.startDate, e.endDate)
            return (
              <motion.article
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.24) }}
                whileHover={{ y: -3 }}
                className="enterprise-card"
              >
                <div className="enterprise-card__body">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-xl)', background: 'var(--brand-participant-bg)', color: 'var(--brand-participant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BookOpen size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'var(--neutral-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                        {e.trainingTitle}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
                        <span className={`badge badge--${status.variant}`}>{status.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--neutral-400)' }}>Joined {fmtDate(e.enrolledAt)}</span>
                      </div>
                    </div>
                  </div>

                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--neutral-500)', marginBottom: 'var(--space-4)', listStyle: 'none' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <User size={12} style={{ color: 'var(--neutral-400)' }} />
                      <span style={{ color: 'var(--neutral-400)' }}>Instructor:</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{e.trainerName || 'TBA'}</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Calendar size={12} style={{ color: 'var(--neutral-400)' }} />
                      <span>{fmtDate(e.startDate)} → {fmtDate(e.endDate)}</span>
                    </li>
                  </ul>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(e.trainingId)} style={{ color: 'var(--status-error)' }}>
                      <X size={13} /> Leave
                    </Button>
                  </div>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}

      {/* Confirm leave modal */}
      <AnimatePresence>
        {confirmId != null && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmId(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
            }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="enterprise-card"
              style={{ maxWidth: 420, width: '100%' }}
            >
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Leave this course?</h3>
              </div>
              <div className="enterprise-card__body">
                <p style={{ fontSize: 14, color: 'var(--neutral-500)', marginBottom: 'var(--space-6)' }}>
                  You can re-enroll later, but your progress in this enrollment will be lost.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <Button variant="secondary" onClick={() => setConfirmId(null)}>Stay enrolled</Button>
                  <Button variant="danger" onClick={() => { onCancel?.(confirmId); setConfirmId(null) }}>
                    Leave course
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
