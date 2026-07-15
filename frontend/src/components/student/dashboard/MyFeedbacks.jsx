import { motion } from 'framer-motion'
import { MessageSquare, Star, Reply } from 'lucide-react'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

function StaticStars({ value = 0 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={13}
          fill={s <= value ? '#F79009' : 'transparent'}
          stroke={s <= value ? '#F79009' : 'var(--neutral-200)'}
          strokeWidth={1.6}
        />
      ))}
    </span>
  )
}

export default function MyFeedbacks({ feedbacks = [], loading = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--neutral-900)', letterSpacing: '-0.03em', margin: 0, marginBottom: 4 }}>My Feedback History</h2>
        <p style={{ fontSize: 14, color: 'var(--neutral-500)', margin: 0 }}>{feedbacks.length} feedback{feedbacks.length === 1 ? '' : 's'} submitted</p>
      </div>

      {!loading && feedbacks.length === 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card__body">
            <div className="empty-state">
              <div className="empty-state__icon" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)' }}>
                <MessageSquare size={28} />
              </div>
              <h3 className="empty-state__title">No feedback yet</h3>
              <p className="empty-state__description">Once you submit a course review, it'll appear here.</p>
            </div>
          </div>
        </div>
      )}

      {feedbacks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {feedbacks.map((f, i) => (
            <motion.article
              key={f.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.24) }}
              className="enterprise-card"
            >
              <div className="enterprise-card__body">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 4 }}>
                      {f.trainingTitle}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--neutral-400)' }}>
                      Submitted {fmtDate(f.submittedAt)}
                    </p>
                  </div>
                  {f.anonymous && <span className="badge badge--neutral">Anonymous</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-50)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--neutral-400)', letterSpacing: '0.05em' }}>Instructor</span>
                    <StaticStars value={f.trainerRating} />
                    <span style={{ fontSize: 12, color: 'var(--neutral-500)', marginLeft: 'auto' }}>{f.trainerRating}/5</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-50)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--neutral-400)', letterSpacing: '0.05em' }}>Subject</span>
                    <StaticStars value={f.subjectRating} />
                    <span style={{ fontSize: 12, color: 'var(--neutral-500)', marginLeft: 'auto' }}>{f.subjectRating}/5</span>
                  </div>
                </div>

                {f.comments && (
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--neutral-600)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-50)', borderLeft: '3px solid var(--brand-participant)' }}>
                    "{f.comments}"
                  </p>
                )}

                {f.trainerResponse && (
                  <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--status-info-bg)', borderLeft: '3px solid var(--status-info)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--status-info-dark)' }}>
                      <Reply size={12} /> INSTRUCTOR REPLIED
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--neutral-700)', lineHeight: 1.5, margin: 0 }}>{f.trainerResponse}</p>
                  </div>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  )
}
