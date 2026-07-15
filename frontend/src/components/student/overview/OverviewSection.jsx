import { motion } from 'framer-motion'
import { BookOpen, TrendingUp, Award, Clock, ArrowRight, Sparkles, BarChart3, ChevronRight } from 'lucide-react'
import { useStudentStats } from '../../../hooks/useStudentStats'
import { useContinueLearning } from '../../../hooks/useContinueLearning'

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

export default function OverviewSection({
  user,
  trainings = [],
  enrollments = [],
  quizzes = [],
  onGoToCourses,
  onResume,
  onClickCourse,
  onClickQuiz,
}) {
  const { stats, loading } = useStudentStats()

  const enrolledCount = enrollments.length
  const completedCount = enrollments.filter(e => e.status === 'COMPLETED').length
  const quizCount = quizzes.length
  const avgScore = stats?.averageScore ?? 0

  const { continueLearning } = useContinueLearning()
  const recentItems = (continueLearning || []).slice(0, 3)

  const statCards = [
    { label: 'Enrolled Courses', value: enrolledCount, icon: BookOpen, color: 'var(--brand-participant)', bg: 'var(--brand-participant-bg)' },
    { label: 'Completed', value: completedCount, icon: TrendingUp, color: '#0D9488', bg: 'rgba(13,148,136,0.08)' },
    { label: 'Avg Score', value: avgScore > 0 ? `${avgScore}%` : '—', icon: BarChart3, color: '#F79009', bg: 'rgba(247,144,9,0.08)' },
    { label: 'Quizzes', value: quizCount, icon: Award, color: '#059669', bg: 'rgba(16,185,129,0.08)' },
  ]

  return (
    <div style={{ padding: '0' }}>
      {/* Welcome Banner */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" style={{
        background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #059669 100%)',
        borderRadius: 'var(--radius-2xl)',
        padding: 'var(--space-8) var(--space-8)',
        marginBottom: 'var(--space-8)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
              color: '#FFFFFF', letterSpacing: '-0.03em', margin: 0, marginBottom: 'var(--space-2)',
            }}>
              Welcome back, {user?.name?.split(' ')[0] || 'Student'}
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', maxWidth: 400 }}>
              Here's your learning overview. Keep up the great work!
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onGoToCourses}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: '10px 20px', borderRadius: 'var(--radius-lg)',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-primary)',
            }}
          >
            <BookOpen size={16} />
            Browse Courses
          </motion.button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: i * 0.06 }}
            className="stat-card"
            whileHover={{ y: -2 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>{s.label}</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>{s.value}</span>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>
                <s.icon size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Continue Learning */}
      {recentItems.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="enterprise-card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Clock size={16} /> Continue Learning
            </h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {recentItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onResume?.(item)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 'var(--space-4) var(--space-6)',
                  borderBottom: idx < recentItems.length - 1 ? '1px solid var(--neutral-100)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--neutral-50)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--neutral-800)' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>
                    {item.type === 'course' ? 'Course' : item.type === 'quiz' ? 'Quiz' : 'Lesson'} &middot; {item.subtitle || ''}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--neutral-400)' }} />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        <motion.div
          variants={itemVariants} initial="hidden" animate="visible"
          className="enterprise-card enterprise-card--hover"
          style={{ cursor: 'pointer' }}
          onClick={onClickCourse}
        >
          <div className="enterprise-card__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-xl)', background: 'var(--brand-participant-bg)', color: 'var(--brand-participant)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--neutral-900)' }}>My Courses</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>{enrolledCount} enrolled</div>
              </div>
              <ArrowRight size={18} style={{ color: 'var(--neutral-400)' }} />
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants} initial="hidden" animate="visible"
          className="enterprise-card enterprise-card--hover"
          style={{ cursor: 'pointer' }}
          onClick={onClickQuiz}
        >
          <div className="enterprise-card__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-xl)', background: 'rgba(16,185,129,0.08)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--neutral-900)' }}>AI Quizzes</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>{quizCount} available</div>
              </div>
              <ArrowRight size={18} style={{ color: 'var(--neutral-400)' }} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
