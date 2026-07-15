import { motion } from 'framer-motion'
import { Award, Trophy } from 'lucide-react'
import BadgeGrid from './BadgeGrid'
import CertificateCard from './CertificateCard'
import { useStudentStats } from '../../../hooks/useStudentStats'

export default function AchievementsSection({ user, enrollmentsCount = 0 }) {
  const { stats, loading } = useStudentStats()

  const dates = new Set((stats?.accuracyTrend || []).map((t) => t.date))
  let streak = 0
  for (let i = 0; i < 90; i++) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (dates.has(key)) streak++
    else if (i > 0) break
  }

  const certificates = (stats?.breakdownByQuiz || [])
    .filter((q) => (q.bestScore ?? 0) >= 70)
    .sort((a, b) => b.bestScore - a.bestScore)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, #F79009 0%, #F59E0B 100%)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 18px rgba(247,144,9,0.28)',
        }}>
          <Trophy size={20} />
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--neutral-900)', letterSpacing: '-0.03em', margin: 0 }}>Achievements</h2>
          <p style={{ fontSize: 14, color: 'var(--neutral-500)', margin: '2px 0 0' }}>Badges and certificates you've earned</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="enterprise-card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
              <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px' }} />
              <div className="skeleton" style={{ width: '60%', height: 14, margin: '0 auto 6px' }} />
              <div className="skeleton" style={{ width: '80%', height: 10, margin: '0 auto' }} />
            </div>
          ))}
        </div>
      ) : (
        <BadgeGrid stats={stats} enrollmentsCount={enrollmentsCount} streak={streak} />
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--neutral-900)', margin: 0 }}>Certificates</h3>
            <p style={{ fontSize: 13, color: 'var(--neutral-400)', margin: '2px 0 0' }}>{certificates.length} earned &middot; Score 70%+ to qualify</p>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 'var(--radius-lg)',
            background: 'var(--status-success-bg)',
            color: 'var(--status-success-dark)',
            fontSize: 12, fontWeight: 700,
          }}>
            <Award size={13} /> Auto-generated
          </div>
        </div>

        {!loading && certificates.length === 0 && (
          <div className="enterprise-card">
            <div className="enterprise-card__body">
              <div className="empty-state">
                <div className="empty-state__icon" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                  <Award size={28} />
                </div>
                <h3 className="empty-state__title">No certificates yet</h3>
                <p className="empty-state__description">
                  Score <strong>70% or higher</strong> on any quiz to unlock a printable certificate.
                </p>
              </div>
            </div>
          </div>
        )}

        {certificates.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {certificates.map((cert, i) => (
              <CertificateCard
                key={cert.quizId}
                certificate={cert}
                studentName={user?.name || 'Student'}
                index={i}
              />
            ))}
          </div>
        )}
      </motion.section>
    </div>
  )
}
