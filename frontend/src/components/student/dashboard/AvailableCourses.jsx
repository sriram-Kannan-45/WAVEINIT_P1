import { motion } from 'framer-motion'
import { Calendar, User, Users, CheckCircle, XCircle, AlertCircle, Search, BookOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Badge } from '../../ui'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function AvailableCourses({
  trainings = [],
  enrollments = [],
  loading = false,
  onEnroll,
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const isEnrolled = (id) => enrollments.some((e) => e.trainingId === id)

  const filtered = useMemo(() => {
    return trainings.filter((t) => {
      const enrolled = isEnrolled(t.id)
      const full = t.isFull
      if (filter === 'open' && (enrolled || full)) return false
      if (filter === 'enrolled' && !enrolled) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          t.title?.toLowerCase().includes(q) ||
          t.trainerName?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [trainings, enrollments, search, filter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--neutral-900)', letterSpacing: '-0.03em', margin: 0, marginBottom: 4 }}>Explore Trainings</h2>
          <p style={{ fontSize: 14, color: 'var(--neutral-500)', margin: 0 }}>Discover trainings created by your instructors</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
            <input
              type="search"
              placeholder="Search trainings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field-input"
              style={{ paddingLeft: 40, height: 40, fontSize: 13 }}
              aria-label="Search trainings"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: 'var(--radius-xl)', background: 'var(--neutral-100)', border: '1px solid var(--neutral-150)' }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'open', label: 'Open' },
              { key: 'enrolled', label: 'Joined' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)',
                  border: 'none', cursor: 'pointer',
                  background: filter === f.key ? 'var(--neutral-0)' : 'transparent',
                  color: filter === f.key ? 'var(--neutral-900)' : 'var(--neutral-500)',
                  boxShadow: filter === f.key ? 'var(--shadow-xs)' : 'none',
                  transition: 'all 150ms',
                  fontFamily: 'var(--font-primary)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && trainings.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="enterprise-card" style={{ minHeight: 280 }}>
              <div className="enterprise-card__body">
                <div className="skeleton" style={{ height: 18, width: '70%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 12, width: '95%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 24 }} />
                <div className="skeleton" style={{ height: 8, width: '100%', marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 36, width: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card__body">
            <div className="empty-state">
              <div className="empty-state__icon" style={{ background: 'var(--brand-participant-bg)', color: 'var(--brand-participant)' }}>
                <BookOpen size={28} />
              </div>
              <h3 className="empty-state__title">
                {trainings.length === 0 ? 'No trainings available yet' : 'No matches'}
              </h3>
              <p className="empty-state__description">
                {trainings.length === 0
                  ? 'Your instructor will publish trainings here. Check back soon!'
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Course grid */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
          {filtered.map((t, i) => {
            const enrolled = isEnrolled(t.id)
            const full = t.isFull
            const pct = t.capacity ? Math.round(((t.enrolledCount || 0) / t.capacity) * 100) : null

            return (
              <motion.article
                key={t.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                whileHover={{ y: -3 }}
                className="enterprise-card"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <div className="enterprise-card__body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-xl)', background: 'var(--brand-participant-bg)', color: 'var(--brand-participant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BookOpen size={20} />
                    </div>
                    {enrolled && (
                      <span className="badge badge--success"><CheckCircle size={11} /> Joined</span>
                    )}
                    {full && !enrolled && (
                      <span className="badge badge--error"><XCircle size={11} /> Full</span>
                    )}
                  </div>

                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: 'var(--neutral-900)', marginBottom: 'var(--space-2)' }}>
                    {t.title}
                  </h3>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--neutral-500)', marginBottom: 'var(--space-4)', flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.description || 'No description provided yet.'}
                  </p>

                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)', fontSize: 12.5, color: 'var(--neutral-500)', listStyle: 'none' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <User size={12} style={{ color: 'var(--neutral-400)' }} />
                      <span style={{ color: 'var(--neutral-400)' }}>Instructor:</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{t.trainerName || 'TBA'}</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Calendar size={12} style={{ color: 'var(--neutral-400)' }} />
                      <span>{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Users size={12} style={{ color: 'var(--neutral-400)' }} />
                      <span>{t.enrolledCount ?? 0}{t.capacity ? ` / ${t.capacity}` : ''} enrolled</span>
                    </li>
                  </ul>

                  {pct !== null && (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--neutral-400)', marginBottom: 4 }}>
                        <span>Capacity</span>
                        <span style={{ fontWeight: 700, color: 'var(--neutral-600)' }}>{pct}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'var(--neutral-100)', borderRadius: 3, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{
                            height: '100%', borderRadius: 3,
                            background: pct > 85 ? 'var(--status-warning)' : 'var(--brand-participant)',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 'auto' }}>
                    {!enrolled && !full && (
                      <Button variant="primary" onClick={() => onEnroll?.(t.id)} disabled={loading} className="w-full">
                        Join Training
                      </Button>
                    )}
                    {enrolled && (
                      <Button variant="secondary" disabled className="w-full">
                        <CheckCircle size={14} /> Already enrolled
                      </Button>
                    )}
                    {full && !enrolled && (
                      <Button variant="secondary" disabled className="w-full">
                        <AlertCircle size={14} /> Training is full
                      </Button>
                    )}
                  </div>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}
    </div>
  )
}
