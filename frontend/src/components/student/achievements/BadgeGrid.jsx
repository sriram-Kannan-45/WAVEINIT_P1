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
  primary: { bg: '#EAF8F0', color: '#16A34A', border: '#DCFCE7', glow: 'rgba(22, 163, 74, 0.18)' },
  teal:    { bg: '#F0FDFA', color: '#0D9488', border: '#CCFBF1', glow: 'rgba(13, 148, 136, 0.16)' },
  violet:  { bg: '#F5F3FF', color: '#7C3AED', border: '#EDE9FE', glow: 'rgba(124, 58, 237, 0.16)' },
  warning: { bg: '#FFFBEB', color: '#D97706', border: '#FEF3C7', glow: 'rgba(217, 119, 6, 0.16)' },
  danger:  { bg: '#FEF2F2', color: '#DC2626', border: '#FEE2E2', glow: 'rgba(220, 38, 38, 0.16)' },
}

function BadgeTile({ badge, index }) {
  const { earned, label, description, icon: Icon, tone, progress, requirement } = badge
  const t = TONE_STYLES[tone] || TONE_STYLES.primary

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      className={`ach-badge-card ${earned ? 'ach-badge-card--earned' : 'ach-badge-card--locked'}`}
    >
      {/* Soft radial glow for earned badges */}
      {earned && (
        <div
          className="ach-badge-glow"
          style={{ background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }}
        />
      )}

      <div
        className="ach-badge-icon-box"
        style={{
          background: earned ? t.bg : '#F1F5F9',
          color: earned ? t.color : '#94A3B8',
          border: earned ? `2px solid ${t.color}` : '2px dashed #CBD5E1',
        }}
      >
        {earned ? <Icon size={26} strokeWidth={2.2} /> : <Lock size={20} />}
      </div>

      <h4 className="ach-badge-name">{label}</h4>
      <p className="ach-badge-desc">{description}</p>

      <div className="ach-badge-footer">
        {earned ? (
          <span className="ach-earned-pill">
            ✓ Earned
          </span>
        ) : (
          <div>
            <div className="ach-req-bar">
              <div
                className="ach-req-fill"
                style={{ width: `${Math.round((progress || 0) * 100)}%` }}
              />
            </div>
            <p className="ach-req-text" title={requirement}>
              {requirement}
            </p>
          </div>
        )}
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Rich progress summary card ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="ach-progress-card"
      >
        <div className="ach-progress-header">
          <div className="ach-progress-left">
            <div className="ach-count-badge">
              <span className="ach-count-earned">{earned}</span>
              <span className="ach-count-total">of {total} earned</span>
            </div>

            {nextBadge ? (
              <div className="ach-next-pill">
                <span>Next up:</span>
                <strong>{nextBadge.label}</strong>
                <span className="ach-next-pill-req">· {nextBadge.requirement}</span>
              </div>
            ) : (
              <div className="ach-next-pill" style={{ color: '#16A34A', background: '#EAF8F0', borderColor: '#DCFCE7' }}>
                ✦ All badges earned — incredible achievement!
              </div>
            )}
          </div>

          <div className="ach-progress-pct">{pct}%</div>
        </div>

        <div className="ach-bar-track">
          <motion.div
            className="ach-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </motion.div>

      {/* ─── Badges Section ──────────────────────────────────────────── */}
      <div>
        <div className="ach-section-head">
          <div>
            <h3 className="ach-section-title">Badges</h3>
            <p className="ach-section-sub">{earned} of {total} unlocked</p>
          </div>
        </div>

        <div className="ach-badges-grid">
          {badges.map((b, i) => (
            <BadgeTile key={b.id} badge={b} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
