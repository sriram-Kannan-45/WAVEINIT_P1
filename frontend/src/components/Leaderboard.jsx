import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import {
  Trophy, Medal, Flame, Clock, TrendingUp, Crown,
  Star, Zap, Users, BarChart2, ChevronUp, ChevronDown
} from 'lucide-react'

/* ─── Custom Recharts Tooltip ─── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-bold text-slate-800 mb-1">{label}</p>
      <p className="text-primary-600 font-black text-base">{payload[0]?.value?.toFixed(1)}%</p>
    </div>
  )
}

/* ─── Podium bar heights ─── */
const PODIUM_HEIGHTS = { 1: 'h-36', 2: 'h-28', 3: 'h-20' }

/* ─── Rank configs ─── */
const RANK_CONFIG = {
  1: {
    medal: '🥇', label: '1st',
    card: 'border-amber-300 bg-gradient-to-b from-amber-50 to-yellow-50 shadow-xl shadow-amber-100',
    stripe: 'from-yellow-400 to-amber-500',
    avatar: 'from-yellow-400 to-amber-500 shadow-amber-200',
    score: 'text-amber-600',
    bar: 'from-yellow-400 to-amber-500',
    scale: 'sm:scale-105 sm:z-10',
  },
  2: {
    medal: '🥈', label: '2nd',
    card: 'border-slate-300 bg-gradient-to-b from-slate-50 to-white shadow-lg shadow-slate-100',
    stripe: 'from-slate-300 to-slate-400',
    avatar: 'from-slate-400 to-slate-500',
    score: 'text-slate-600',
    bar: 'from-slate-300 to-slate-400',
    scale: '',
  },
  3: {
    medal: '🥉', label: '3rd',
    card: 'border-orange-200 bg-gradient-to-b from-orange-50 to-white shadow-lg shadow-orange-100',
    stripe: 'from-orange-300 to-orange-400',
    avatar: 'from-orange-400 to-orange-500 shadow-orange-200',
    score: 'text-orange-600',
    bar: 'from-orange-300 to-orange-400',
    scale: '',
  },
}

/* ─── Main Leaderboard Component ─── */
const Leaderboard = ({ data = [], title = 'Quiz Leaderboard', showChart = true, currentUserId = null }) => {
  const [filterRange, setFilterRange] = useState('all')

  const displayData = filterRange === 'top10' ? data.slice(0, 10) : data
  const topThree    = displayData.slice(0, 3)
  const rest        = displayData.slice(3)

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [1, 0, 2]

  const chartData = data.slice(0, 10).map(entry => ({
    name: entry.name?.length > 9
      ? entry.name.substring(0, 9) + '…'
      : entry.name || 'Unknown',
    score: entry.score || 0,
  }))

  const getMedalColor = (score) => {
    if (score >= 90) return 'text-amber-500'
    if (score >= 80) return 'text-primary-500'
    if (score >= 70) return 'text-emerald-500'
    return 'text-slate-400'
  }

  const getStatusBadge = (score) => {
    if (score >= 90) return { label: 'Outstanding', color: 'bg-amber-50 text-amber-700 border-amber-200' }
    if (score >= 80) return { label: 'Excellent',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (score >= 60) return { label: 'Good',        color: 'bg-blue-50 text-blue-700 border-blue-200' }
    if (score >= 40) return { label: 'Passed',      color: 'bg-primary-50 text-primary-700 border-primary-200' }
    return                  { label: 'Keep Going',  color: 'bg-slate-50 text-slate-600 border-slate-200' }
  }

  const CHART_COLORS = [
    '#14B8A6', '#0D9488', '#14B8A6', '#2DD4BF',
    '#5EEAD4', '#2DD4BF', '#0D9488', '#0F766E',
    '#115E59', '#134E4A',
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full"
      style={{ fontFamily: "'Inter', 'Poppins', sans-serif" }}
    >

      {/* ═══════════════════ HEADER ═══════════════════ */}
      <div className="mb-7">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-200"
            >
              <Trophy size={22} className="text-white" />
            </motion.div>
            <div>
              <h2
                className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {title}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5 font-medium">
                See how you rank among participants
              </p>
            </div>
          </div>

          {data.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-primary-50 rounded-xl border border-primary-100">
              <Users size={15} className="text-primary-500" />
              <span className="text-sm font-bold text-primary-600">{data.length} participants</span>
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all',   label: 'All Time', icon: Star },
            { key: 'top10', label: 'Top 10',   icon: Crown },
          ].map(({ key, label, icon: Icon }) => (
            <motion.button
              key={key}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setFilterRange(key)}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200',
                filterRange === key
                  ? 'bg-gradient-to-r from-primary-600 to-primary-600 text-white shadow-md shadow-primary-200'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ EMPTY STATE ═══════════════════ */}
      {data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 px-4 bg-white rounded-2xl border-2 border-dashed border-slate-200"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl mb-5"
          >
            <Trophy size={36} className="text-amber-400" />
          </motion.div>
          <h3 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            No Attempts Yet
          </h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto font-medium leading-relaxed">
            Be the first to take this quiz and claim the top spot on the leaderboard!
          </p>
        </motion.div>
      ) : (
        <>

          {/* ═══════════════════ PODIUM ═══════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end">
              {podiumOrder.map((pos, i) => {
                const entry = topThree[pos]
                if (!entry) return <div key={i} className="h-32" />

                const rank          = pos + 1
                const cfg           = RANK_CONFIG[rank]
                const isFirst       = rank === 1
                const isCurrentUser = currentUserId && entry.userId === currentUserId

                return (
                  <motion.div
                    key={entry.userId || entry.name || i}
                    initial={{ y: 60, opacity: 0, scale: 0.85 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      delay: i * 0.14 + 0.2,
                      type: 'spring',
                      stiffness: 220,
                      damping: 22,
                    }}
                    className={`relative ${cfg.scale}`}
                  >
                    {/* "You" badge */}
                    {isCurrentUser && (
                      <motion.div
                        initial={{ y: -8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="absolute -top-3.5 left-0 right-0 flex justify-center z-10"
                      >
                        <span className="px-3 py-1 bg-gradient-to-r from-primary-600 to-primary-600 text-white text-[10px] font-black rounded-full shadow-lg shadow-primary-200 uppercase tracking-wider">
                          ✨ You
                        </span>
                      </motion.div>
                    )}

                    <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 hover:shadow-2xl ${cfg.card}`}>
                      {/* Top stripe */}
                      <div className={`h-1.5 bg-gradient-to-r ${cfg.stripe}`} />

                      <div className="p-4 sm:p-5 text-center">
                        {/* Medal */}
                        <motion.div
                          animate={isFirst ? { y: [0, -5, 0] } : {}}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-3xl sm:text-4xl mb-2.5"
                        >
                          {cfg.medal}
                        </motion.div>

                        {/* Avatar */}
                        <motion.div
                          whileHover={{ scale: 1.08, rotate: 4 }}
                          className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2.5 rounded-2xl flex items-center justify-center font-black text-base sm:text-lg text-white shadow-lg bg-gradient-to-br ${cfg.avatar}`}
                          style={{ fontFamily: 'Outfit, sans-serif' }}
                        >
                          {(entry.name || 'U').charAt(0).toUpperCase()}
                        </motion.div>

                        {/* Name */}
                        <h3
                          className="font-bold text-slate-900 text-sm sm:text-base mb-1 truncate"
                          style={{ fontFamily: 'Outfit, sans-serif' }}
                          title={entry.name}
                        >
                          {entry.name || 'Anonymous'}
                        </h3>

                        {/* Time */}
                        {entry.timeTaken && (
                          <p className="text-[10px] text-slate-500 mb-2 flex items-center justify-center gap-1">
                            <Clock size={10} />
                            {entry.timeTaken}
                          </p>
                        )}

                        {/* Score */}
                        <div className="flex items-baseline justify-center gap-0.5 mb-3">
                          <span
                            className={`text-2xl sm:text-3xl font-black ${cfg.score}`}
                            style={{ fontFamily: 'Outfit, sans-serif' }}
                          >
                            {entry.score?.toFixed(1) || 0}
                          </span>
                          <span className="text-sm text-slate-400 font-semibold">%</span>
                        </div>

                        {/* Score bar */}
                        <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${entry.score || 0}%` }}
                            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.5 + i * 0.1 }}
                            className={`h-full rounded-full bg-gradient-to-r ${cfg.bar}`}
                          />
                        </div>

                        {/* Rank label */}
                        <p className={`text-[10px] font-black uppercase tracking-widest mt-2 ${cfg.score}`}>
                          {cfg.label} Place
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>

          {/* ═══════════════════ CHART ═══════════════════ */}
          {showChart && chartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-8 bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <BarChart2 size={18} className="text-primary-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Score Distribution
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Top 10 participants</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(226, 232, 240, 0.6)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(20,184,166,0.05)', radius: 8 }} />
                  <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* ═══════════════════ TABLE (4th+) ═══════════════════ */}
          {rest.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            >
              {/* Table header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Full Rankings
                </h3>
                <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-lg">
                  #{4} – #{data.length}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Participant
                      </th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                        Progress
                      </th>
                      <th className="px-5 py-3.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rest.map((entry, index) => {
                      const rank          = index + 4
                      const isCurrentUser = currentUserId && entry.userId === currentUserId
                      const score         = entry.score || 0
                      const badge         = getStatusBadge(score)

                      return (
                        <motion.tr
                          key={entry.userId || entry.name || index}
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + index * 0.04 }}
                          className={[
                            'transition-colors hover:bg-primary-50/30 group',
                            isCurrentUser ? 'bg-primary-50/50' : '',
                          ].join(' ')}
                        >
                          {/* Rank */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-base font-black text-slate-700"
                                style={{ fontFamily: 'Outfit, sans-serif' }}
                              >
                                #{rank}
                              </span>
                              {rank <= 10 && (
                                <Flame size={13} className={getMedalColor(score)} />
                              )}
                            </div>
                          </td>

                          {/* Participant */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={[
                                  'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-sm flex-shrink-0',
                                  isCurrentUser
                                    ? 'bg-gradient-to-br from-primary-500 to-primary-600'
                                    : 'bg-gradient-to-br from-slate-400 to-slate-500',
                                ].join(' ')}
                              >
                                {(entry.name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 text-sm leading-tight">
                                  {entry.name || 'Anonymous'}
                                </p>
                                {isCurrentUser && (
                                  <p className="text-[10px] text-primary-600 font-bold mt-0.5">✨ You</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Score */}
                          <td className="px-5 py-4">
                            <div className="flex items-baseline gap-0.5">
                              <span
                                className="text-lg font-black text-slate-900"
                                style={{ fontFamily: 'Outfit, sans-serif' }}
                              >
                                {score.toFixed(1)}
                              </span>
                              <span className="text-xs text-slate-400 font-medium">%</span>
                            </div>
                          </td>

                          {/* Progress bar */}
                          <td className="px-5 py-4 hidden sm:table-cell">
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${score}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 + index * 0.03 }}
                                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600"
                              />
                            </div>
                          </td>

                          {/* Status badge */}
                          <td className="px-5 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

        </>
      )}
    </motion.div>
  )
}

export default Leaderboard
