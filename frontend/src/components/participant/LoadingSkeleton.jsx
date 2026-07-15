import { motion } from 'framer-motion'

/* ── Shimmer keyframe via inline style ────────────────────── */
const shimmer = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.6s infinite',
}

/* ── Generic shimmer block ──────────────────────────────────── */
function ShimmerBox({ className = '' }) {
  return (
    <div
      className={`rounded-xl bg-white/5 ${className}`}
      style={shimmer}
    />
  )
}

/* ── Profile Card Skeleton ──────────────────────────────────── */
export function ProfileCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 flex items-center gap-6"
    >
      {/* Avatar circle */}
      <ShimmerBox className="w-20 h-20 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-3">
        <ShimmerBox className="h-5 w-40" />
        <ShimmerBox className="h-3 w-64" />
        <ShimmerBox className="h-3 w-48" />
        {/* Progress bar */}
        <ShimmerBox className="h-2 w-full rounded-full" />
      </div>
    </motion.div>
  )
}

/* ── Stat Card Skeleton ─────────────────────────────────────── */
export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-3"
        >
          <ShimmerBox className="w-10 h-10 rounded-xl" />
          <ShimmerBox className="h-7 w-20" />
          <ShimmerBox className="h-3 w-24" />
        </motion.div>
      ))}
    </div>
  )
}

/* ── Leaderboard Row Skeleton ───────────────────────────────── */
export function LeaderboardRowSkeleton({ count = 8 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-4 px-5 py-4 rounded-xl bg-white/5 border border-white/5"
        >
          <ShimmerBox className="w-8 h-6 rounded-lg" />
          <ShimmerBox className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <ShimmerBox className="h-4 w-32" />
            <ShimmerBox className="h-3 w-24" />
          </div>
          <ShimmerBox className="h-5 w-16 hidden sm:block" />
          <ShimmerBox className="h-5 w-12 hidden md:block" />
          <ShimmerBox className="h-5 w-14" />
        </motion.div>
      ))}
    </div>
  )
}

/* ── Podium Skeleton ────────────────────────────────────────── */
export function PodiumSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4 items-end mb-8">
      {[2, 1, 3].map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center space-y-3">
          <ShimmerBox className={`mx-auto rounded-full ${i === 1 ? 'w-16 h-16' : 'w-12 h-12'}`} />
          <ShimmerBox className="h-4 w-24 mx-auto" />
          <ShimmerBox className="h-6 w-16 mx-auto" />
          <ShimmerBox className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}
