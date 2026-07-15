import { motion } from 'framer-motion'
import { Trophy, Star, Target, Flame, Award, Crown, Zap, BookOpen, Lock } from 'lucide-react'

/**
 * Compute a badge catalogue derived purely from existing data.
 * No backend / no DB column required.
 *
 * Inputs:
 *  - stats: from /participant/stats (totalQuizzes, averageScore, bestScore, bestRank, accuracyTrend)
 *  - enrollmentsCount
 *  - streak (computed in OverviewSection)
 */
export function buildBadgeCatalogue({ stats, enrollmentsCount = 0, streak = 0 }) {
  const totalQuizzes = stats?.totalQuizzes ?? 0
  const averageScore = stats?.averageScore ?? 0
  const bestScore    = stats?.bestScore ?? 0
  const bestRank     = stats?.bestRank ?? null
  const trend        = stats?.accuracyTrend ?? []
  const perfectAttempts = trend.filter((t) => t.score >= 99).length

  return [
    {
      id: 'first-step',
      label: 'First Step',
      description: 'Complete your first quiz',
      icon: BookOpen,
      tone: 'primary',
      earned: totalQuizzes >= 1,
      progress: Math.min(1, totalQuizzes / 1),
      requirement: 'Take 1 quiz',
    },
    {
      id: 'consistent',
      label: 'Consistent Learner',
      description: 'Complete 5 quizzes',
      icon: Target,
      tone: 'teal',
      earned: totalQuizzes >= 5,
      progress: Math.min(1, totalQuizzes / 5),
      requirement: `Take 5 quizzes (${Math.min(totalQuizzes, 5)}/5)`,
    },
    {
      id: 'dedicated',
      label: 'Dedicated Scholar',
      description: 'Complete 15 quizzes',
      icon: Award,
      tone: 'violet',
      earned: totalQuizzes >= 15,
      progress: Math.min(1, totalQuizzes / 15),
      requirement: `Take 15 quizzes (${Math.min(totalQuizzes, 15)}/15)`,
    },
    {
      id: 'high-scorer',
      label: 'High Scorer',
      description: 'Score 80% or higher',
      icon: Star,
      tone: 'warning',
      earned: bestScore >= 80,
      progress: Math.min(1, bestScore / 80),
      requirement: 'Reach 80% on any quiz',
    },
    {
      id: 'perfectionist',
      label: 'Perfectionist',
      description: 'Score 100% on a quiz',
      icon: Zap,
      tone: 'violet',
      earned: bestScore >= 99.5,
      progress: Math.min(1, bestScore / 100),
      requirement: 'Score 100% on any quiz',
    },
    {
      id: 'top-3',
      label: 'Podium Finisher',
      description: 'Reach the top 3 on a quiz',
      icon: Trophy,
      tone: 'warning',
      earned: bestRank != null && bestRank <= 3,
      progress: bestRank != null ? Math.min(1, 3 / bestRank) : 0,
      requirement: bestRank ? `Best rank: #${bestRank}` : 'Reach top 3',
    },
    {
      id: 'champion',
      label: 'Champion',
      description: 'Rank #1 on any quiz',
      icon: Crown,
      tone: 'warning',
      earned: bestRank === 1,
      progress: bestRank === 1 ? 1 : (bestRank ? 1 / bestRank : 0),
      requirement: 'Reach #1 on any quiz',
    },
    {
      id: 'streak',
      label: 'On Fire',
      description: 'Maintain a 3-day streak',
      icon: Flame,
      tone: 'danger',
      earned: streak >= 3,
      progress: Math.min(1, streak / 3),
      requirement: `Active streak: ${streak} day${streak === 1 ? '' : 's'}`,
    },
    {
      id: 'avg-pro',
      label: 'Steady Excellence',
      description: 'Average 75%+ across attempts',
      icon: Target,
      tone: 'teal',
      earned: averageScore >= 75 && totalQuizzes >= 3,
      progress: Math.min(1, averageScore / 75),
      requirement: 'Average 75% across 3+ attempts',
    },
    {
      id: 'perfect-streak',
      label: 'Perfectly Tuned',
      description: 'Score 99%+ in 3 attempts',
      icon: Zap,
      tone: 'violet',
      earned: perfectAttempts >= 3,
      progress: Math.min(1, perfectAttempts / 3),
      requirement: `${Math.min(perfectAttempts, 3)}/3 perfect attempts`,
    },
    {
      id: 'enrolled',
      label: 'Course Enthusiast',
      description: 'Join 3 courses',
      icon: BookOpen,
      tone: 'primary',
      earned: enrollmentsCount >= 3,
      progress: Math.min(1, enrollmentsCount / 3),
      requirement: `Joined ${enrollmentsCount}/3 courses`,
    },
  ]
}

const TONE_STYLES = {
  primary: { bg: 'var(--academic-primary-50)', color: 'var(--academic-primary)', glow: 'rgba(13,148,136,0.18)' },
  teal:    { bg: 'var(--academic-secondary-50)', color: 'var(--academic-secondary-600)', glow: 'rgba(20,184,166,0.16)' },
  violet:  { bg: 'var(--academic-accent-50)', color: 'var(--academic-accent-500)', glow: 'rgba(20,184,166,0.16)' },
  warning: { bg: 'var(--academic-warning-50)', color: 'var(--academic-warning)', glow: 'rgba(245,158,11,0.16)' },
  danger:  { bg: 'var(--academic-danger-50)', color: 'var(--academic-danger)', glow: 'rgba(239,68,68,0.16)' },
}

function BadgeTile({ badge, index }) {
  const { earned, label, description, icon: Icon, tone, progress, requirement } = badge
  const t = TONE_STYLES[tone] || TONE_STYLES.primary
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -3 }}
      className="ac-card"
      style={{
        textAlign: 'center',
        padding: 20,
        opacity: earned ? 1 : 0.65,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow halo for earned badges */}
      {earned && (
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -40%)',
            width: 140, height: 140, borderRadius: '50%',
            background: `radial-gradient(circle, ${t.glow}, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      <motion.div
        whileHover={earned ? { scale: 1.08, rotate: 4 } : {}}
        style={{
          position: 'relative',
          width: 64, height: 64, margin: '0 auto 12px',
          borderRadius: '50%',
          background: t.bg, color: t.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: earned ? `2px solid ${t.color}` : '2px dashed var(--academic-border)',
          filter: earned ? 'none' : 'grayscale(0.5)',
        }}
      >
        {earned ? <Icon size={28} /> : <Lock size={22} style={{ color: 'var(--academic-text-muted)' }} />}
      </motion.div>
      <h4 style={{
        fontFamily: "'Poppins', sans-serif", fontSize: 14, fontWeight: 700,
        color: earned ? 'var(--academic-text)' : 'var(--academic-text-secondary)',
        marginBottom: 4,
      }}>
        {label}
      </h4>
      <p style={{ fontSize: 12, color: 'var(--academic-text-muted)', marginBottom: 12, minHeight: 30 }}>
        {description}
      </p>

      {!earned && (
        <>
          <div className="ac-progress" style={{ height: 5, marginBottom: 6 }}>
            <div className="ac-progress__fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--academic-text-muted)' }}>
            {requirement}
          </p>
        </>
      )}
      {earned && (
        <span className="ac-chip ac-chip-success" style={{ marginTop: 4 }}>
          ✓ Earned
        </span>
      )}
    </motion.div>
  )
}

export default function BadgeGrid({ stats, enrollmentsCount = 0, streak = 0 }) {
  const badges = buildBadgeCatalogue({ stats, enrollmentsCount, streak })
  const earned = badges.filter((b) => b.earned).length
  const total = badges.length
  const pct = total > 0 ? Math.round((earned / total) * 100) : 0

  // "Next up" — the locked badge with the highest progress (closest to unlock)
  const nextBadge = badges
    .filter((b) => !b.earned)
    .sort((a, b) => (b.progress || 0) - (a.progress || 0))[0]

  return (
    <div className="ac-stack">
      {/* ─── Rich progress summary strip ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="ach-progress-strip"
      >
        <div className="ach-progress-strip__top">
          <div className="ach-progress-strip__stats">
            <span className="ach-progress-strip__count">
              <span className="mono">{earned}</span>
              <span className="ach-progress-strip__count-of">of</span>
              <span className="mono">{total}</span>
              <span className="ach-progress-strip__count-label">earned</span>
            </span>
            {nextBadge ? (
              <span className="ach-progress-strip__next">
                Next up: <strong>{nextBadge.label}</strong>
                <span className="ach-progress-strip__next-req">· {nextBadge.requirement}</span>
              </span>
            ) : (
              <span className="ach-progress-strip__next">
                ✦ All badges earned — incredible work!
              </span>
            )}
          </div>
          <span className="ach-progress-strip__pct mono">{pct}%</span>
        </div>
        <div className="ach-progress-strip__bar">
          <motion.div
            className="ach-progress-strip__fill"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </motion.div>

      {/* ─── Badges header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 className="ac-section-title" style={{ fontSize: 18 }}>Badges</h3>
          <p className="ac-section-subtitle">{earned} of {total} earned</p>
        </div>
      </div>

      <div
        className="grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {badges.map((b, i) => <BadgeTile key={b.id} badge={b} index={i} />)}
      </div>
    </div>
  )
}
