import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Search, Filter, Crown, Star, Zap, Flame,
  Clock, Target, BookOpen, ChevronDown, Medal, TrendingUp,
  Users, BarChart2, RefreshCw
} from 'lucide-react'
import leaderboardData, { DEPARTMENTS, BADGES, getTier } from './leaderboardData'

const PODIUM_ORDER = [1, 0, 2]

const MEDAL_CONFIG = {
  1: {
    emoji: '🥇', label: '1st', nameColor: '#b45309',
    glow: 'rgba(251,191,36,0.3)',
    ring: 'from-yellow-400 via-amber-400 to-yellow-300',
    card: 'bg-gradient-to-b from-amber-50 to-white',
    border: 'border-amber-300',
    heightClass: 'h-44', scale: 'sm:scale-110 sm:z-10',
    badge: '#fbbf24',
  },
  2: {
    emoji: '🥈', label: '2nd', nameColor: '#64748b',
    glow: 'rgba(148,163,184,0.3)',
    ring: 'from-slate-300 via-slate-400 to-slate-300',
    card: 'bg-gradient-to-b from-slate-50 to-white',
    border: 'border-slate-300',
    heightClass: 'h-36', scale: '',
    badge: '#94a3b8',
  },
  3: {
    emoji: '🥉', label: '3rd', nameColor: '#c2410c',
    glow: 'rgba(251,146,60,0.3)',
    ring: 'from-orange-400 via-orange-500 to-orange-400',
    card: 'bg-gradient-to-b from-orange-50 to-white',
    border: 'border-orange-300',
    heightClass: 'h-32', scale: '',
    badge: '#fb923c',
  },
}

function Avatar({ entry, size = 44, glow }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full p-[2px]"
        style={{ background: `linear-gradient(135deg, #14B8A6, #0D9488)` }}
      >
        <div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">
          <span className="font-display font-black text-primary-600 select-none" style={{ fontSize: size * 0.35 }}>
            {entry.initials}
          </span>
        </div>
      </div>
    </div>
  )
}

function BadgeChip({ badgeKey }) {
  const b = BADGES[badgeKey]
  if (!b) return null
  return (
    <span title={b.label} className="text-base leading-none">{b.icon}</span>
  )
}

function NeonRank({ rank }) {
  const colors = { 1: '#b45309', 2: '#64748b', 3: '#c2410c' }
  const color = colors[rank] || '#14B8A6'
  return (
    <span className="font-display text-lg font-black" style={{ color }}>
      #{rank}
    </span>
  )
}

function PodiumCard({ entry, rank, isCurrentUser, delay }) {
  const cfg = MEDAL_CONFIG[rank]

  return (
    <motion.div
      initial={{ y: 60, opacity: 0, scale: 0.85 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 22 }}
      className={`relative ${cfg.scale}`}
    >
      {isCurrentUser && (
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: delay + 0.3 }}
          className="absolute -top-5 inset-x-0 flex justify-center z-20"
        >
          <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-white"
            style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)', boxShadow: '0 0 15px rgba(20,184,166,0.5)' }}
          >
            ✨ You
          </span>
        </motion.div>
      )}

      <div
        className={`relative rounded-xl border ${cfg.border} ${cfg.card} overflow-hidden text-center p-4 sm:p-5 hover:scale-[1.02] transition-transform duration-300 shadow-sm`}
        style={{ boxShadow: `0 0 20px ${cfg.glow}, 0 8px 24px rgba(0,0,0,0.06)` }}
      >
        <div className={`absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r ${cfg.ring}`} />

        <motion.div
          animate={rank === 1 ? { y: [0, -6, 0] } : {}}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-3xl sm:text-4xl mb-2"
        >
          {cfg.emoji}
        </motion.div>

        <div className="flex justify-center mb-2">
          <Avatar entry={entry} size={rank === 1 ? 60 : 52} glow={cfg.glow} />
        </div>

        <h3 className="font-display font-bold text-base sm:text-lg leading-tight mb-1 truncate" style={{ color: cfg.nameColor }} title={entry.name}>
          {entry.name}
        </h3>
        <p className="text-xs text-slate-500 mb-2">{entry.department}</p>

        {entry.badges?.length > 0 && (
          <div className="flex justify-center gap-1 mb-2">
            {entry.badges.slice(0, 3).map(b => <BadgeChip key={b} badgeKey={b} />)}
          </div>
        )}

        <div className="flex items-baseline justify-center gap-0.5 mb-2">
          <span className="font-display text-2xl sm:text-3xl font-black" style={{ color: cfg.nameColor }}>
            {entry.xp.toLocaleString()}
          </span>
          <span className="text-sm text-slate-500 ml-1">XP</span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, entry.score)}%` }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: delay + 0.4 }}
            className={`h-full rounded-full bg-gradient-to-r ${cfg.ring}`}
          />
        </div>

        <p className="text-xs font-bold mt-2" style={{ color: cfg.nameColor, opacity: 0.8 }}>
          {entry.score.toFixed(1)}% · {cfg.label} Place
        </p>
      </div>
    </motion.div>
  )
}

function LeaderboardRow({ entry, rank, isCurrentUser, index, scoreKey }) {
  const tier = getTier(entry.xp)

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ x: 4, transition: { duration: 0.15 } }}
      className={`group relative flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 rounded-lg border transition-all duration-200 ${
        isCurrentUser
          ? 'border-primary-300 bg-primary-50'
          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
      }`}
    >
      {isCurrentUser && (
        <div className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ boxShadow: 'inset 0 0 12px rgba(20,184,166,0.08)' }} />
      )}

      <div className="w-8 text-center flex-shrink-0">
        <NeonRank rank={rank} />
      </div>

      <div className="flex-shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
          style={{
            background: isCurrentUser
              ? 'linear-gradient(135deg, #14B8A6, #0D9488)'
              : `linear-gradient(135deg, ${tier.color}60, ${tier.color}30)`,
            border: `1.5px solid ${isCurrentUser ? 'rgba(20,184,166,0.6)' : tier.color + '40'}`,
            boxShadow: `0 0 12px ${isCurrentUser ? 'rgba(20,184,166,0.2)' : tier.color + '20'}`,
          }}
        >
          <span className="font-display">{entry.initials}</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="font-display font-semibold text-base text-slate-900 truncate">{entry.name}</p>
          {isCurrentUser && (
            <span className="text-xs font-black text-primary-600 flex-shrink-0">✨ You</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{entry.department}</span>
          {entry.badges?.length > 0 && (
            <div className="flex gap-0.5">
              {entry.badges.slice(0, 2).map(b => <BadgeChip key={b} badgeKey={b} />)}
            </div>
          )}
          {entry.streak > 0 && (
            <span className="text-xs flex items-center gap-1 text-orange-600">
              <Flame size={12} /> {entry.streak}d
            </span>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="font-display text-base font-black text-slate-900">
          {entry[scoreKey].toFixed(1)}<span className="text-xs text-slate-500">%</span>
        </div>
        <div className="text-xs text-slate-500">{entry.xp.toLocaleString()} XP</div>
      </div>

      <div className="text-right flex-shrink-0 hidden sm:block w-16">
        <div className="text-sm font-bold text-emerald-600">{entry.accuracy.toFixed(1)}%</div>
        <div className="text-xs text-slate-500">accuracy</div>
      </div>

      <div className="text-right flex-shrink-0 hidden md:block w-14">
        <div className="text-sm font-bold text-blue-600">{entry.quizzesCompleted}</div>
        <div className="text-xs text-slate-500">quizzes</div>
      </div>

      <div className="w-16 hidden lg:block">
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${entry[scoreKey]}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.04 + 0.3 }}
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #14B8A6, #0D9488)' }}
          />
        </div>
      </div>
    </motion.div>
  )
}

export default function PremiumLeaderboard({ currentUserId = null, currentUserName = '' }) {
  const [mode, setMode] = useState('alltime')
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('All')
  const [deptOpen, setDeptOpen] = useState(false)
  const [liveGlow, setLiveGlow] = useState(false)

  const scoreKey = mode === 'weekly' ? 'weeklyScore' : 'score'

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveGlow(true)
      setTimeout(() => setLiveGlow(false), 1200)
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(() => {
    return [...leaderboardData]
      .sort((a, b) => b[scoreKey] - a[scoreKey])
      .filter(e => {
        const q = search.toLowerCase()
        const matchName = !q || e.name.toLowerCase().includes(q)
        const matchDept = dept === 'All' || e.department === dept
        return matchName && matchDept
      })
  }, [scoreKey, search, dept])

  const topThree = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const totalParticipants = leaderboardData.length

  const currentUserRank = useMemo(() => {
    const idx = sorted.findIndex(e =>
      e.name?.toLowerCase() === currentUserName?.toLowerCase()
    )
    return idx >= 0 ? idx + 1 : null
  }, [sorted, currentUserName])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 15, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400 }}
              className="p-3 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', boxShadow: '0 0 20px rgba(251,191,36,0.3)' }}
            >
              <Trophy size={22} className="text-white" />
            </motion.div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                Leaderboard
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Compete with your peers · {totalParticipants} participants</p>
            </div>
          </div>

          <motion.div
            animate={liveGlow ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 0.6 }}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-sm font-semibold text-emerald-700">Live Rankings</span>
          </motion.div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 w-fit">
            {[
              { key: 'alltime', label: 'All Time', icon: Star },
              { key: 'weekly', label: 'This Week', icon: TrendingUp },
            ].map(({ key, label, icon: Icon }) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode(key)}
                id={`leaderboard-${key}-btn`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === key
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                style={mode === key ? {
                  background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
                  boxShadow: '0 0 16px rgba(20,184,166,0.3)',
                } : {}}
              >
                <Icon size={13} />
                {label}
              </motion.button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Search participants…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="leaderboard-search"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
            />
          </div>

          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setDeptOpen(o => !o)}
              id="leaderboard-dept-filter"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-all"
            >
              <Filter size={13} />
              {dept}
              <motion.span animate={{ rotate: deptOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={12} />
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {deptOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-slate-200 overflow-hidden z-30 bg-white shadow-lg"
                >
                  {['All', ...DEPARTMENTS].map(d => (
                    <button
                      key={d}
                      onClick={() => { setDept(d); setDeptOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        dept === d
                          ? 'text-primary-600 bg-primary-50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {currentUserRank && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg border border-primary-200 bg-primary-50"
        >
          <Trophy size={16} className="text-primary-500 flex-shrink-0" />
          <span className="text-sm text-slate-700">
            You are currently ranked
            <span className="font-black text-primary-600 mx-1">#{currentUserRank}</span>
            out of {totalParticipants} participants
          </span>
        </motion.div>
      )}

      {topThree.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end mb-6 mt-4 px-2 sm:px-6">
          {PODIUM_ORDER.map((pos, i) => {
            const entry = topThree[pos]
            if (!entry) return <div key={i} />
            const rank = pos + 1
            const isCurrentUser = entry.name?.toLowerCase() === currentUserName?.toLowerCase()
            return (
              <PodiumCard
                key={entry.id}
                entry={entry}
                rank={rank}
                isCurrentUser={isCurrentUser}
                delay={i * 0.12 + 0.1}
              />
            )
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <div className="grid grid-cols-[40px_1fr_80px_80px_60px_70px] gap-2 px-5 py-3 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:grid">
            <span>#</span>
            <span>Participant</span>
            <span className="text-right">Score</span>
            <span className="text-right">Accuracy</span>
            <span className="text-right">Quizzes</span>
            <span>Progress</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto custom-scrollbar">
            {rest.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No participants match your filters</div>
            ) : (
              rest.map((entry, i) => {
                const globalRank = sorted.indexOf(entry) + 1
                const isCurrentUser = entry.name?.toLowerCase() === currentUserName?.toLowerCase()
                return (
                  <div key={entry.id} className="px-2 sm:px-3 py-1">
                    <LeaderboardRow
                      entry={entry}
                      rank={globalRank}
                      isCurrentUser={isCurrentUser}
                      index={i}
                      scoreKey={scoreKey}
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="py-20 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-slate-500 text-sm">No participants match your search</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Avg Score', value: `${(leaderboardData.reduce((s, e) => s + e.score, 0) / leaderboardData.length).toFixed(1)}%`, icon: Target, color: '#059669' },
          { label: 'Total Quizzes', value: leaderboardData.reduce((s, e) => s + e.quizzesCompleted, 0), icon: BookOpen, color: '#14B8A6' },
          { label: 'Top Streak', value: `${Math.max(...leaderboardData.map(e => e.streak))} days`, icon: Flame, color: '#ea580c' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm"
          >
            <Icon size={16} style={{ color, flexShrink: 0 }} />
            <div>
              <div className="font-display text-sm font-bold text-slate-900">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}