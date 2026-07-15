import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Trophy, Zap, Clock, Target, ChevronDown, ChevronUp, Users } from 'lucide-react'

/* ──────────────────────────────────────────────
   Mock data — 10 participants
   ────────────────────────────────────────────── */
const ALL_PARTICIPANTS = [
  { id: 1,  name: 'Arjun Sharma',   score: 98, accuracy: 96, time: '01:52', streak: 14 },
  { id: 2,  name: 'Maya Patel',     score: 95, accuracy: 92, time: '02:08', streak: 11 },
  { id: 3,  name: 'Leo Kim',        score: 91, accuracy: 90, time: '02:24', streak: 9 },
  { id: 4,  name: 'You',            score: 87, accuracy: 88, time: '02:45', streak: 7, isYou: true },
  { id: 5,  name: 'Sarah Chen',     score: 84, accuracy: 85, time: '03:02', streak: 10 },
  { id: 6,  name: 'Raj Nair',       score: 80, accuracy: 81, time: '03:18', streak: 6 },
  { id: 7,  name: 'Emma Wilson',    score: 76, accuracy: 79, time: '03:35', streak: 8 },
  { id: 8,  name: 'David Park',     score: 72, accuracy: 74, time: '03:52', streak: 5 },
  { id: 9,  name: 'Priya Singh',    score: 67, accuracy: 71, time: '04:10', streak: 4 },
  { id: 10, name: 'James Brown',    score: 63, accuracy: 68, time: '04:28', streak: 3 },
]

const SHIMMER =
  'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)'

/* ─── Helper particles ─── */
function Particles() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    let w = c.width = window.innerWidth
    let h = c.height = window.innerHeight
    const dots = Array.from({ length: 50 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 2 + 0.5, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      o: Math.random() * 0.4 + 0.1,
    }))
    let id
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy
        if (d.x < 0) d.x = w; if (d.x > w) d.x = 0
        if (d.y < 0) d.y = h; if (d.y > h) d.y = 0
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(45,212,191,${d.o})`; ctx.fill()
      }
      id = requestAnimationFrame(draw)
    }
    draw()
    const resize = () => { w = c.width = window.innerWidth; h = c.height = window.innerHeight }
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
}

/* ─── Medal icons ─── */
const Medal = ({ rank }) => {
  if (rank === 1) return <span className="text-lg drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]">🥇</span>
  if (rank === 2) return <span className="text-lg drop-shadow-[0_0_6px_rgba(156,163,175,0.6)]">🥈</span>
  if (rank === 3) return <span className="text-lg drop-shadow-[0_0_6px_rgba(180,83,9,0.6)]">🥉</span>
  return null
}

/* ─── Gradient avatar ─── */
function AvatarCircle({ name, rank, size = 36 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const borderGrads = {
    1: 'from-amber-400 via-yellow-300 to-amber-500',
    2: 'from-slate-300 via-slate-200 to-slate-400',
    3: 'from-amber-700 via-amber-600 to-amber-800',
  }
  const border = borderGrads[rank] || 'from-[#0D9488] to-[#2DD4BF]'
  const glow = rank === 1 ? 'shadow-[0_0_16px_rgba(245,158,11,0.4)]' : rank === 2 ? 'shadow-[0_0_12px_rgba(156,163,175,0.3)]' : rank === 3 ? 'shadow-[0_0_12px_rgba(180,83,9,0.3)]' : ''
  return (
    <div className={`shrink-0 rounded-full bg-gradient-to-br ${border} p-[2px] ${glow}`}>
      <div className={`rounded-full bg-[#0f172a] flex items-center justify-center font-bold text-white`}
        style={{ width: size - 4, height: size - 4, fontSize: size * 0.32 }}
      >
        {initials}
      </div>
    </div>
  )
}

/* ─── Animated progress bar ─── */
function ScoreBar({ score, maxScore, color }) {
  const pct = (score / maxScore) * 100
  return (
    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full"
        style={{ background: color || 'linear-gradient(90deg, #0D9488, #2DD4BF)' }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════
   PremiumLeaderboardPanel
   ═══════════════════════════════════════════════ */
export default function PremiumLeaderboardPanel({ quizActive = true, onClear }) {
  const [phase, setPhase] = useState('live') // 'live' | 'completed' | 'empty'
  const [countdown, setCountdown] = useState(300) // 5 min demo
  const [participants, setParticipants] = useState([])
  const [sorted, setSorted] = useState([])
  const [revealStep, setRevealStep] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(true)

  /* ── Init ── */
  useEffect(() => {
    if (phase === 'live') {
      setParticipants(ALL_PARTICIPANTS.map(p => ({ ...p, score: Math.max(10, p.score - Math.floor(Math.random() * 15)) })))
    }
  }, [phase])

  useEffect(() => {
    setSorted([...participants].sort((a, b) => b.score - a.score || a.time.localeCompare(b.time)))
  }, [participants])

  /* ── Countdown ── */
  useEffect(() => {
    if (phase !== 'live') return
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); setPhase('completed'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  /* ── Socket.io simulation ── */
  useEffect(() => {
    if (phase !== 'live') return
    const t = setInterval(() => {
      setParticipants(prev => prev.map(p => ({
        ...p,
        score: Math.min(100, p.score + (Math.random() > 0.6 ? Math.floor(Math.random() * 3) : 0)),
      })))
    }, 3000)
    return () => clearInterval(t)
  }, [phase])

  /* ── Staggered reveal ── */
  useEffect(() => {
    if (phase !== 'completed') { setRevealStep(0); return }
    const t = setInterval(() => {
      setRevealStep(prev => { if (prev >= sorted.length + 5) { clearInterval(t); return sorted.length + 5 }; return prev + 1 })
    }, 100)
    return () => clearInterval(t)
  }, [phase, sorted.length])

  /* ── Reset ── */
  const reset = useCallback(() => {
    setPhase('empty')
    setParticipants([])
    setSorted([])
    setCountdown(300)
    setRevealStep(0)
    if (onClear) onClear()
    setTimeout(() => setPhase('live'), 2000)
  }, [onClear])

  /* ── Auto reset after completed ── */
  useEffect(() => {
    if (phase !== 'completed') return
    const t = setTimeout(() => reset(), 15000)
    return () => clearTimeout(t)
  }, [phase, reset])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const maxScore = sorted.length > 0 ? sorted[0].score : 100
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const youRow = sorted.find(p => p.isYou)
  const podiumOrder = [1, 0, 2] // silver, gold, bronze layout

  const podiumColors = [
    { bg: 'from-amber-500/20 to-yellow-500/10', border: 'border-amber-500/30', glow: 'rgba(245,158,11,0.2)', text: '#f59e0b', label: '2nd' },
    { bg: 'from-yellow-400/20 to-amber-400/10', border: 'border-yellow-400/30', glow: 'rgba(245,158,11,0.35)', text: '#f59e0b', label: '1st' },
    { bg: 'from-amber-700/20 to-orange-600/10', border: 'border-amber-700/30', glow: 'rgba(180,83,9,0.2)', text: '#b45309', label: '3rd' },
  ]

  const youIdx = sorted.findIndex(p => p.isYou)

  return (
    <div className="relative">
      <Particles />

      {/* ── Drawer toggle (mobile) ── */}
      <button
        onClick={() => setDrawerOpen(v => !v)}
        className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-[#0D9488] to-[#2DD4BF] text-white flex items-center justify-center shadow-lg shadow-[#0D9488]/40"
        aria-label={drawerOpen ? 'Close leaderboard' : 'Open leaderboard'}
      >
        <Trophy size={20} />
      </button>

      {/* ── Main card ── */}
      <motion.div
        initial={false}
        animate={drawerOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        className="overflow-hidden lg:overflow-visible"
      >
        <div className="relative z-10 rounded-2xl border border-white/10 bg-[#0f172a]/90 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0D9488] to-[#2DD4BF] flex items-center justify-center shadow-lg shadow-[#0D9488]/30">
                <Trophy size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>Leaderboard</h2>
                <p className="text-[11px] text-white/40 font-medium">AI Quiz Rankings</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Phase badge */}
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                phase === 'live'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : phase === 'completed'
                  ? 'bg-[#0D9488]/15 text-[#2DD4BF] border border-[#0D9488]/20'
                  : 'bg-white/5 text-white/30 border border-white/10'
              }`}>
                {phase === 'live' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</>}
                {phase === 'completed' && <>✓ Completed</>}
                {phase === 'empty' && <>⏸ Paused</>}
              </span>

              {/* Countdown (live only) */}
              {phase === 'live' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono font-bold text-[#2DD4BF]">
                  <Clock size={12} />
                  {fmt(countdown)}
                </div>
              )}

              {/* Demo controls */}
              <div className="flex gap-1.5">
                {phase === 'live' && (
                  <button onClick={() => { setPhase('completed'); setCountdown(0) }}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#0D9488] to-[#2DD4BF] text-white text-[10px] font-bold hover:shadow-lg hover:shadow-[#0D9488]/30 transition-all"
                  >
                    End Quiz
                  </button>
                )}
                {phase === 'completed' && (
                  <button onClick={reset}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[10px] font-bold hover:bg-white/10 transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ═══════ CONTENT ═══════ */}
          <AnimatePresence mode="wait">
            {/* ── Empty state ── */}
            {phase === 'empty' && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center justify-center py-16 px-6 text-center"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5"
                >
                  <Trophy size={36} className="text-white/20" />
                </motion.div>
                <h3 className="text-[17px] font-bold text-white/80 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  No Rankings Available
                </h3>
                <p className="text-[13px] text-white/40 max-w-xs leading-relaxed">
                  Complete the quiz to enter the leaderboard and compete with other participants.
                </p>
              </motion.div>
            )}

            {/* ── Live state ── */}
            {phase === 'live' && (
              <motion.div
                key="live"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[12px] font-semibold text-emerald-400">Live Rankings — updating in real-time</span>
                </div>

                {/* Podium skeleton */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {podiumOrder.map((idx) => {
                    const p = sorted[idx]
                    if (!p) return <div key={idx} className="h-[160px] rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
                    const pc = podiumColors[idx]
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`rounded-xl bg-gradient-to-b ${pc.bg} border ${pc.border} p-4 text-center relative overflow-hidden`}
                        style={{ boxShadow: `0 0 30px ${pc.glow}` }}
                      >
                        <div className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">{pc.label}</div>
                        <AvatarCircle name={p.name} rank={idx + 1} size={40} />
                        <div className="mt-2 text-[12px] font-bold text-white truncate">{p.name}</div>
                        <div className="text-[20px] font-black mt-1" style={{ color: pc.text, fontFamily: "'Poppins', sans-serif" }}>{p.score}</div>
                        <div className="text-[10px] text-white/30">pts</div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Mini table */}
                <div className="space-y-1">
                  {sorted.slice(0, 7).map((p, i) => {
                    const pct = (p.score / maxScore) * 100
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-white/[0.04] ${
                          p.isYou ? 'bg-[#0D9488]/10 border border-[#0D9488]/20' : ''
                        }`}
                      >
                        <span className="w-6 text-center text-[11px] font-bold text-white/30">#{(p.id)}</span>
                        <AvatarCircle name={p.name} rank={0} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold text-white/80 truncate">{p.name}</span>
                            {p.isYou && <span className="text-[8px] font-bold text-[#2DD4BF] bg-[#0D9488]/20 px-1.5 py-0.5 rounded uppercase">You</span>}
                          </div>
                          <ScoreBar score={p.score} maxScore={maxScore} color="linear-gradient(90deg, #0D9488, #2DD4BF)" />
                        </div>
                        <span className="text-[14px] font-bold text-white/70" style={{ fontFamily: "'Poppins', sans-serif" }}>{p.score}</span>
                        <span className="text-[11px] text-white/30 w-10 text-right">{p.accuracy}%</span>
                        <span className="text-[11px] text-white/30 w-12 text-right font-mono">{p.time}</span>
                      </motion.div>
                    )
                  })}
                </div>

                {youRow && youIdx > 6 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/20"
                  >
                    <span className="w-6 text-center text-[11px] font-bold text-[#2DD4BF]">#{youIdx + 1}</span>
                    <AvatarCircle name={youRow.name} rank={0} size={28} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-semibold text-white/80">{youRow.name}</span>
                      <span className="ml-2 text-[8px] font-bold text-[#2DD4BF] bg-[#0D9488]/20 px-1.5 py-0.5 rounded uppercase">You</span>
                    </div>
                    <span className="text-[14px] font-bold text-[#2DD4BF]">{youRow.score}</span>
                  </motion.div>
                )}

                <p className="mt-4 text-[10px] text-white/20 text-center">
                  {sorted.length} participants · updating live
                </p>
              </motion.div>
            )}

            {/* ── Completed state ── */}
            {phase === 'completed' && (
              <motion.div
                key="completed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-5"
              >
                {/* ── Top 3 Podium ── */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {podiumOrder.map((idx) => {
                    const p = top3[idx]
                    if (!p) return null
                    const heights = ['mt-6', 'mt-0', 'mt-10']
                    const pc = podiumColors[idx]
                    const delay = 5 + idx
                    const visible = revealStep >= delay
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={visible ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 0.5, delay: idx * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                        className={`rounded-2xl bg-gradient-to-b ${pc.bg} border ${pc.border} p-5 text-center relative overflow-hidden ${heights[idx]}`}
                        style={{ boxShadow: `0 0 40px ${pc.glow}` }}
                      >
                        {/* Glow overlay */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full" style={{ background: `radial-gradient(circle, ${pc.glow.replace('0.2','0.3').replace('0.35','0.4')}, transparent 70%)`, filter: 'blur(20px)' }} />
                        <div className="relative z-10">
                          <Medal rank={idx + 1} />
                          <div className="flex justify-center mt-2">
                            <AvatarCircle name={p.name} rank={idx + 1} size={44} />
                          </div>
                          <div className="mt-2 text-[13px] font-bold text-white truncate">{p.name}</div>
                          <div className="text-[26px] font-black mt-1" style={{ color: pc.text, fontFamily: "'Poppins', sans-serif" }}>{p.score}</div>
                          <div className="text-[10px] text-white/40">points · {p.accuracy}% acc</div>
                          <div className="mt-2 flex justify-center gap-2 text-[10px] text-white/30">
                            <span>⏱ {p.time}</span>
                            <span>🔥 {p.streak}</span>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* ── Full ranked table ── */}
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {/* Column headers */}
                  <div className="grid grid-cols-[40px_1fr_60px_60px_70px_50px] gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-white/5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    <span>Rank</span>
                    <span>Name</span>
                    <span>Score</span>
                    <span>Acc</span>
                    <span>Time</span>
                    <span>Streak</span>
                  </div>

                  {/* Rows */}
                  {sorted.map((p, i) => {
                    const isTop3 = i < 3
                    const delay = 8 + i
                    const visible = revealStep >= delay
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={visible ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                        className={`grid grid-cols-[40px_1fr_60px_60px_70px_50px] gap-2 items-center px-4 py-2.5 transition-all duration-200 hover:bg-white/[0.04] lb-row ${
                          p.isYou ? 'bg-[#0D9488]/10 border-l-2 border-l-[#2DD4BF]' : 'border-l-2 border-l-transparent'
                        } ${i < sorted.length - 1 ? 'border-b border-white/[0.03]' : ''}`}
                      >
                        {/* Rank */}
                        <div className="flex items-center justify-center w-7 h-7 rounded-full">
                          {isTop3 ? <Medal rank={i + 1} /> : <span className="text-[11px] font-bold text-white/30">#{i + 1}</span>}
                        </div>

                        {/* Name + avatar */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarCircle name={p.name} rank={isTop3 ? i + 1 : 0} size={30} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[13px] font-semibold truncate ${p.isYou ? 'text-[#2DD4BF]' : 'text-white/80'}`}
                                style={{ fontFamily: "'Poppins', sans-serif" }}
                              >
                                {p.name}
                              </span>
                              {p.isYou && (
                                <span className="text-[8px] font-bold text-[#2DD4BF] bg-[#0D9488]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">You</span>
                              )}
                            </div>
                            <ScoreBar score={p.score} maxScore={maxScore} color={isTop3 ? podiumColors[i].text : 'linear-gradient(90deg, #0D9488, #2DD4BF)'} />
                          </div>
                        </div>

                        {/* Score */}
                        <div className={`text-[14px] font-bold ${isTop3 ? 'text-[#f59e0b]' : 'text-white/70'}`}
                          style={{ fontFamily: "'Poppins', sans-serif" }}
                        >
                          {p.score}
                        </div>

                        {/* Accuracy */}
                        <div className="text-[12px] font-medium text-white/40">{p.accuracy}%</div>

                        {/* Time */}
                        <div className="text-[11px] font-mono text-white/30">{p.time}</div>

                        {/* Streak */}
                        <div className="flex items-center gap-1 text-[12px] font-bold text-[#f59e0b]">
                          🔥{p.streak}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Summary footer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2"
                >
                  {[
                    { label: 'Avg Score', value: Math.round(sorted.reduce((a, p) => a + p.score, 0) / sorted.length) + '%', color: '#2DD4BF' },
                    { label: 'Top Score', value: sorted[0]?.score + '%', color: '#f59e0b' },
                    { label: 'Participants', value: sorted.length, color: '#60a5fa' },
                    { label: 'Avg Accuracy', value: Math.round(sorted.reduce((a, p) => a + p.accuracy, 0) / sorted.length) + '%', color: '#34d399' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/5 p-3 text-center">
                      <div className="text-[10px] text-white/30 font-medium uppercase tracking-wider">{s.label}</div>
                      <div className="text-[18px] font-black mt-0.5" style={{ color: s.color, fontFamily: "'Poppins', sans-serif" }}>{s.value}</div>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <style>{`
            .lb-row {
              transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
            }
            .lb-row:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 20px rgba(13,148,136,0.1);
            }
          `}</style>
        </div>
      </motion.div>
    </div>
  )
}
