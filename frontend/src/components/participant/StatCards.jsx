import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Award, Sparkles, Zap, Star, BarChart3, Brain,
  Trophy, BookOpen, Target, TrendingUp, Users
} from 'lucide-react'

const statConfig = [
  {
    key: 'totalQuizScore',
    label: 'Quiz Score',
    format: (v) => v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—',
    icon: Brain,
    color: '#14B8A6',
    hoverBg: 'bg-primary-50',
    hoverBorder: 'border-primary-300',
  },
  {
    key: 'aiQuizScore',
    label: 'AI Score',
    format: (v) => v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—',
    icon: Zap,
    color: '#3b82f6',
    hoverBg: 'bg-blue-50',
    hoverBorder: 'border-blue-300',
  },
  {
    key: 'quizzesTaken',
    label: 'Quizzes',
    format: (v) => v != null ? v : '—',
    icon: BookOpen,
    color: '#06b6d4',
    hoverBg: 'bg-cyan-50',
    hoverBorder: 'border-cyan-300',
  },
  {
    key: 'aiCoursesCompleted',
    label: 'Courses',
    format: (v) => v != null ? v : '—',
    icon: Award,
    color: '#10b981',
    hoverBg: 'bg-emerald-50',
    hoverBorder: 'border-emerald-300',
  },
  {
    key: 'streak',
    label: 'Streak',
    format: (v) => v != null ? `${v} days` : '—',
    icon: Star,
    color: '#f59e0b',
    hoverBg: 'bg-amber-50',
    hoverBorder: 'border-amber-300',
  },
]

function StatCard({ stat, index }) {
  const Icon = stat.icon
  const [animated, setAnimated] = useState(false)
  const ref = useRef(null)
  const value = stat.rawValue || 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setAnimated(true); obs.disconnect() } },
      { threshold: 0.2 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const displayValue = animated ? value : 0
  const formatted = stat.format(value)
  const isPercentage = typeof formatted === 'string' && formatted.includes('%')

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${stat.hoverBorder}`}
    >
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${stat.hoverBg}`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
            {stat.label}
          </p>
          <p
            className="font-display font-black truncate transition-colors duration-300"
            style={{ fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)', color: animated ? stat.color : '#94a3b8' }}
          >
            {isPercentage ? (
              <AnimatedPercent value={stat.rawValue || 0} color={stat.color} />
            ) : (
              <AnimatedNumber value={value} color={stat.color} />
            )}
          </p>
        </div>
        <div
          className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-4deg] ${stat.hoverBg}`}
          style={{ color: stat.color }}
        >
          <Icon size={18} />
        </div>
      </div>
    </motion.div>
  )
}

function AnimatedNumber({ value, color }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    let start = 0
    const step = Math.max(1, value / 35)
    const timer = setInterval(() => {
      start += step
      if (start >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(Math.floor(start))
    }, 30)
    return () => clearInterval(timer)
  }, [value])
  return <>{display.toLocaleString()}</>
}

function AnimatedPercent({ value, color }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    let start = 0
    const step = value / 35
    const timer = setInterval(() => {
      start += step
      if (start >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(Math.floor(start * 10) / 10)
    }, 30)
    return () => clearInterval(timer)
  }, [value])
  return <>{display.toFixed(1)}%</>
}

export default function StatCards({ stats = {} }) {
  const rawValues = {
    totalQuizScore: stats.totalQuizScore ?? null,
    aiQuizScore: stats.aiQuizScore ?? null,
    quizzesTaken: stats.quizzesTaken ?? null,
    aiCoursesCompleted: stats.aiCoursesCompleted ?? null,
    streak: stats.streak ?? null,
  }

  if (!stats || Object.keys(stats).length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statConfig.map((s, i) => (
          <div
            key={s.key}
            className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse"
          >
            <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-6 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {statConfig.map((stat, i) => (
        <StatCard
          key={stat.key}
          stat={{
            ...stat,
            rawValue: rawValues[stat.key],
            format: stat.format,
          }}
          index={i}
        />
      ))}
    </div>
  )
}