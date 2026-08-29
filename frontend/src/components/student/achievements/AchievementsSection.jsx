import { motion } from 'framer-motion'
import { Award, Sparkles } from 'lucide-react'
import BadgeGrid from './BadgeGrid'
import CertificateCard from './CertificateCard'
import { useStudentStats } from '../../../hooks/useStudentStats'
import '../../../styles/achievements.css'

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
    <div className="ach-container">
      {/* ── Page Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
          <Award size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Achievements</h2>
          <p className="reg-admin-subtitle">Badges and certificates earned across your learning journey</p>
        </div>
      </div>

      {loading ? (
        <div className="ach-badges-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="ach-badge-card" style={{ padding: '24px 16px' }}>
              <div className="skeleton" style={{ width: 58, height: 58, borderRadius: '50%', marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '70%', height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '90%', height: 11, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: '50%', height: 18, borderRadius: 12 }} />
            </div>
          ))}
        </div>
      ) : (
        <BadgeGrid stats={stats} enrollmentsCount={enrollmentsCount} streak={streak} />
      )}

      {/* ── Certificates Section ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="ach-section-head">
          <div>
            <h3 className="ach-section-title">Certificates</h3>
            <p className="ach-section-sub">{certificates.length} earned &middot; Score 70%+ on any quiz to qualify</p>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            background: '#EAF8F0', border: '1px solid #DCFCE7',
            color: '#15803D',
            fontSize: 11.5, fontWeight: 700,
          }}>
            <Sparkles size={13} /> Auto-generated
          </div>
        </div>

        {!loading && certificates.length === 0 && (
          <div className="ach-empty-card">
            <div className="ach-empty-icon">
              <Award size={26} />
            </div>
            <h3 className="ach-empty-title">No certificates yet</h3>
            <p className="ach-empty-desc">
              Score <strong>70% or higher</strong> on any quiz to unlock a verified, printable certificate of achievement.
            </p>
          </div>
        )}

        {certificates.length > 0 && (
          <div className="ach-cert-grid">
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
