import { useState, useEffect, useRef, useCallback } from 'react'

/* ── Mock data (8 participants) ── */
const MOCK_PARTICIPANTS = [
  { id: 1, name: 'Aisha Kapoor', score: 96, accuracy: 94, time: '02:45', streak: 12 },
  { id: 2, name: 'Marcus Chen', score: 92, accuracy: 89, time: '03:12', streak: 8 },
  { id: 3, name: 'Priya Sharma', score: 88, accuracy: 91, time: '02:58', streak: 15 },
  { id: 4, name: 'You', score: 85, accuracy: 86, time: '03:34', streak: 7, isYou: true },
  { id: 5, name: 'James Wilson', score: 79, accuracy: 82, time: '04:01', streak: 5 },
  { id: 6, name: 'Sophie Turner', score: 74, accuracy: 78, time: '03:48', streak: 9 },
  { id: 7, name: 'Raj Patel', score: 68, accuracy: 73, time: '04:22', streak: 3 },
  { id: 8, name: 'Emma Liu', score: 62, accuracy: 70, time: '04:45', streak: 6 },
]

const RANK_MEDALS = ['1st', '2nd', '3rd']

export default function AIQuizLeaderboard() {
  const [phase, setPhase] = useState('locked') // 'locked' | 'unlocked'
  const [countdown, setCountdown] = useState(300) // 5 min in seconds
  const [revealStep, setRevealStep] = useState(0)
  const [activeFilter, setActiveFilter] = useState('round')
  const [sorted, setSorted] = useState([])
  const canvasRef = useRef(null)
  const timerRef = useRef(null)
  const revealTimerRef = useRef(null)

  /* ── Sort by score descending ── */
  const rankData = useCallback((data) =>
    [...data].sort((a, b) => b.score - a.score || a.time.localeCompare(b.time)),
  [])

  useEffect(() => {
    setSorted(rankData(MOCK_PARTICIPANTS))
  }, [rankData])

  /* ── Countdown ── */
  useEffect(() => {
    if (phase !== 'locked') return
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setPhase('unlocked')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  /* ── Staggered reveal ── */
  useEffect(() => {
    if (phase !== 'unlocked') {
      setRevealStep(0)
      return
    }
    setRevealStep(0)
    const total = sorted.length + 5 // podium(3) + header + extra buffer
    revealTimerRef.current = setInterval(() => {
      setRevealStep((prev) => {
        if (prev >= total) {
          clearInterval(revealTimerRef.current)
          return total
        }
        return prev + 1
      })
    }, 120)
    return () => clearInterval(revealTimerRef.current)
  }, [phase, sorted.length])

  /* ── Confetti burst ── */
  useEffect(() => {
    if (phase !== 'unlocked' || revealStep < 3) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * -1,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: ['#0D9488', '#2DD4BF', '#f59e0b', '#c084fc', '#14B8A6', '#e879f9'][Math.floor(Math.random() * 6)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rv: (Math.random() - 0.5) * 10,
    }))

    let frame = 0
    const maxFrames = 180
    function draw() {
      if (frame >= maxFrames) { ctx.clearRect(0, 0, canvas.width, canvas.height); return }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of pieces) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05
        p.rot += p.rv
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rot * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      frame++
      if (frame < maxFrames) requestAnimationFrame(draw)
    }
    draw()
    return () => { frame = maxFrames }
  }, [phase, revealStep])

  /* ── Format countdown ── */
  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  /* ── Demo toggle ── */
  const togglePhase = () => {
    if (phase === 'locked') {
      clearInterval(timerRef.current)
      setPhase('unlocked')
      setCountdown(0)
    } else {
      clearInterval(revealTimerRef.current)
      setPhase('locked')
      setCountdown(300)
      setRevealStep(0)
    }
  }

  return (
    <div style={{
      position: 'relative',
      background: '#0f172a',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
      padding: 24,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(13,148,136,0.3); }
          50% { box-shadow: 0 0 20px 4px rgba(13,148,136,0.2); }
        }
        .lb-row {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .lb-row:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(13,148,136,0.12);
        }
        .lb-row.you {
          border-left: 3px solid #2DD4BF;
        }
        .podium-card {
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }
        .podium-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.4);
        }
        .filter-pill {
          transition: all 0.2s ease;
        }
        .filter-pill:hover {
          background: rgba(13,148,136,0.15);
        }
        .filter-pill.active {
          background: #0D9488;
          color: #fff;
        }
        .lock-icon {
          opacity: 0.3;
          filter: blur(0.5px);
        }
        .skeleton-row {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.03) 0%,
            rgba(255,255,255,0.08) 50%,
            rgba(255,255,255,0.03) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s ease-in-out infinite;
        }
        @media (max-width: 768px) {
          .lb-grid { grid-template-columns: 1fr !important; }
          .lb-podium-row { flex-direction: column !important; align-items: center !important; }
        }
      `}</style>

      {/* ── Confetti canvas ── */}
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
      />

      {/* ── Header row: title + demo toggle ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff',
            boxShadow: '0 4px 12px rgba(13,148,136,0.3)',
          }}>🏆</div>
          <h2 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: '#f1f5f9',
            fontFamily: "'Outfit', 'Poppins', sans-serif",
            letterSpacing: '-0.02em',
          }}>AI Quiz Leaderboard</h2>
        </div>
        <button
          onClick={togglePhase}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: '1px solid rgba(13,148,136,0.3)',
            background: phase === 'locked'
              ? 'linear-gradient(135deg, #0D9488, #2DD4BF)'
              : 'rgba(255,255,255,0.06)',
            color: '#f1f5f9',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s ease',
          }}
        >
          {phase === 'locked' ? 'Simulate Quiz End' : 'Reset to Locked'}
        </button>
      </div>

      {/* ── Locked / Unlocked content ── */}
      {phase === 'locked' ? (
        /* ═══════ LOCKED STATE ═══════ */
        <div>
          {/* Countdown + banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            padding: '14px 18px',
            borderRadius: 12,
            background: 'rgba(13,148,136,0.08)',
            border: '1px solid rgba(13,148,136,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                Leaderboard will unlock after the quiz round ends.
              </span>
            </div>
            <div style={{
              fontFamily: "'Inter', monospace",
              fontSize: 26,
              fontWeight: 700,
              color: '#2DD4BF',
              letterSpacing: '0.05em',
              background: 'rgba(0,0,0,0.25)',
              padding: '4px 14px',
              borderRadius: 8,
              border: '1px solid rgba(45,212,191,0.2)',
            }}>
              {fmt(countdown)}
            </div>
          </div>

          {/* Skeleton rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                {/* Rank / lock */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  <span className="lock-icon" style={{ color: '#64748b' }}>🔒</span>
                </div>
                {/* Avatar circle */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  flexShrink: 0,
                }} />
                {/* Name */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    height: 10, width: '55%',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4, marginBottom: 4,
                  }} />
                  <div style={{
                    height: 8, width: '30%',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 4,
                  }} />
                </div>
                {/* Score placeholder */}
                <div style={{
                  height: 10, width: 40,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 4,
                }} />
                {/* Accuracy placeholder */}
                <div style={{
                  height: 10, width: 36,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  display: 'none',
                }} className="md:block" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ═══════ UNLOCKED STATE ═══════ */
        <div>
          {/* ── Filter pills ── */}
          <div style={{
            display: 'flex',
            gap: 6,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}>
            {[
              { key: 'today', label: 'Today' },
              { key: 'round', label: 'This Round' },
              { key: 'overall', label: 'Overall' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`filter-pill ${activeFilter === f.key ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: '1px solid ' + (activeFilter === f.key ? 'transparent' : 'rgba(255,255,255,0.1)'),
                  background: activeFilter === f.key ? '#0D9488' : 'transparent',
                  color: activeFilter === f.key ? '#fff' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Podium ── */}
          <div className="lb-grid" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            marginBottom: 24,
          }}>
            {/* Podium cards */}
            <div className="lb-podium-row" style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}>
              {[1, 0, 2].map((idx) => {
                const p = top3[idx]
                if (!p) return null
                const heights = ['180px', '220px', '160px']
                const colors = ['#b45309', '#f59e0b', '#9ca3af']
                const medals = ['🥉', '🥇', '🥈']
                const labels = ['3rd', '1st', '2nd']
                const isGold = idx === 0
                return (
                  <div
                    key={p.id}
                    className="podium-card"
                    style={{
                      flex: 1,
                      maxWidth: 160,
                      background: 'rgba(255,255,255,0.05)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 14,
                      padding: '16px 12px',
                      textAlign: 'center',
                      opacity: revealStep > idx ? 1 : 0,
                      animation: revealStep > idx ? `fadeSlideIn 0.4s ease ${idx * 0.1}s both` : 'none',
                      cursor: 'default',
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{medals[idx]}</div>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${colors[idx]}, ${isGold ? '#fbbf24' : colors[idx]})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 8px',
                      fontSize: 16, fontWeight: 700, color: '#fff',
                      boxShadow: `0 0 20px ${colors[idx]}40`,
                      fontFamily: "'Poppins', sans-serif",
                    }}>
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: '#f1f5f9',
                      marginBottom: 2, fontFamily: "'Poppins', sans-serif",
                    }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: colors[idx], fontFamily: "'Poppins', sans-serif" }}>
                      {p.score}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {labels[idx]}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Top performer stats ── */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 16,
              opacity: revealStep > 3 ? 1 : 0,
              animation: revealStep > 3 ? 'fadeSlideIn 0.4s ease 0.3s both' : 'none',
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Round Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Avg Score', value: Math.round(sorted.reduce((a, p) => a + p.score, 0) / sorted.length) + '%' },
                  { label: 'Top Score', value: sorted[0]?.score + '%' },
                  { label: 'Participants', value: sorted.length },
                  { label: 'Avg Accuracy', value: Math.round(sorted.reduce((a, p) => a + p.accuracy, 0) / sorted.length) + '%' },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#2DD4BF', fontFamily: "'Poppins', sans-serif" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Full ranked table ── */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 80px 80px 100px 70px',
              gap: 8,
              padding: '12px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11,
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              <span>Rank</span>
              <span>Name</span>
              <span>Score</span>
              <span>Accuracy</span>
              <span>Time</span>
              <span>Streak</span>
            </div>

            {/* Rows */}
            {sorted.map((p, i) => {
              const isTop3 = i < 3
              const revealDelay = 5 + i
              const visible = revealStep >= revealDelay
              return (
                <div
                  key={p.id}
                  className={`lb-row ${p.isYou ? 'you' : ''}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 80px 80px 100px 70px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '10px 18px',
                    borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    opacity: visible ? 1 : 0,
                    animation: visible ? `fadeSlideIn 0.35s ease ${(revealDelay - 5) * 0.06}s both` : 'none',
                    background: p.isYou ? 'rgba(45,212,191,0.06)' : 'transparent',
                    borderLeft: p.isYou ? '3px solid #2DD4BF' : '3px solid transparent',
                    borderRadius: p.isYou ? '0 8px 8px 0' : 0,
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    background: isTop3 ? 'transparent' : 'rgba(255,255,255,0.04)',
                    color: isTop3 ? 'transparent' : '#94a3b8',
                  }}>
                    {isTop3 ? (
                      <span style={{ fontSize: 16 }}>{['🥇', '🥈', '🥉'][i]}</span>
                    ) : (
                      `#${i + 1}`
                    )}
                  </div>

                  {/* Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: p.isYou
                        ? 'linear-gradient(135deg, #0D9488, #2DD4BF)'
                        : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: p.isYou ? '#fff' : '#64748b',
                      flexShrink: 0,
                      fontFamily: "'Poppins', sans-serif",
                    }}>
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: '#f1f5f9',
                        fontFamily: "'Poppins', sans-serif",
                      }}>
                        {p.name}
                        {p.isYou && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 9, fontWeight: 700, color: '#2DD4BF',
                            background: 'rgba(45,212,191,0.12)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}>You</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: isTop3 ? '#f59e0b' : '#e2e8f0',
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    {p.score}
                  </div>

                  {/* Accuracy */}
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
                    {p.accuracy}%
                  </div>

                  {/* Time */}
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', fontFamily: "'Inter', monospace" }}>
                    {p.time}
                  </div>

                  {/* Streak */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 13, fontWeight: 600, color: '#f59e0b',
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    🔥{p.streak}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
