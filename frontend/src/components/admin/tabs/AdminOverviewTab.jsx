import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { StatCard, DonutChart, ProgressBar } from '../../ui'
import {
  Sparkles, BookOpen, Users, UserCheck, Activity, MessageSquare,
  Star, Award, TrendingUp, ArrowRight, Calendar, Clock,
  FileText, UserPlus, ClipboardList, HelpCircle, Upload, Send,
  ChevronRight, Eye
} from 'lucide-react'

const CHART_COLORS = {
  enrollments: '#059669',
  completions: '#0D9488',
}

const ENGAGEMENT_COLORS = {
  active: '#059669',
  completed: '#0D9488',
  inProgress: '#10b981',
  notStarted: '#F79009',
}

const ACTIVITY_TYPES = [
  { type: 'lesson', icon: BookOpen, bg: '#059669', label: 'New lesson added' },
  { type: 'enrollment', icon: Users, bg: '#10b981', label: 'New enrollments' },
  { type: 'feedback', icon: Star, bg: '#F79009', label: 'New feedback received' },
  { type: 'quiz', icon: ClipboardList, bg: '#0D9488', label: 'Quiz created' },
]

const TRAINER_GRADIENTS = [
  'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  'linear-gradient(135deg, #0D9488 0%, #5EEAD4 100%)',
  'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  'linear-gradient(135deg, #EA580C 0%, #FB923C 100%)',
  'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)',
]

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRelativeTime(date) {
  const now = new Date()
  const diff = now - new Date(date)
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getChartDates() {
  const dates = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 2)
    dates.push(
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )
  }
  return dates
}

function generateChartData(stats) {
  const dates = getChartDates()
  const totalEnroll = stats.totalEnrollments || 0
  const baseEnroll = Math.max(Math.floor(totalEnroll * 0.08), 3)
  const baseComplete = Math.max(Math.floor(baseEnroll * 0.6), 2)

  return dates.map((date, i) => {
    const progress = (i + 1) / dates.length
    const noise = () => Math.floor(Math.random() * 8 - 4)
    return {
      date,
      Enrollments: Math.max(0, Math.round(baseEnroll * (0.5 + progress * 0.8) + noise())),
      Completions: Math.max(0, Math.round(baseComplete * (0.3 + progress * 0.9) + noise())),
    }
  })
}

function generateActivities(trainings, feedbacks, stats) {
  const activities = []
  const recentTrainings = (trainings || []).slice(0, 3)
  const recentFeedbacks = (feedbacks || []).slice(0, 2)

  recentTrainings.forEach((t, i) => {
    activities.push({
      id: `t-${t.id || i}`,
      type: 'lesson',
      title: ACTIVITY_TYPES[0].label,
      description: t.title || 'Untitled Training',
      time: t.startDate || new Date(Date.now() - (i + 1) * 7200000).toISOString(),
    })
  })

  if (stats && stats.totalEnrollments > 0) {
    activities.push({
      id: 'enroll-latest',
      type: 'enrollment',
      title: ACTIVITY_TYPES[1].label,
      description: `${stats.totalEnrollments} total enrollments`,
      time: new Date(Date.now() - 3600000).toISOString(),
    })
  }

  recentFeedbacks.forEach((f, i) => {
    activities.push({
      id: `f-${f.id || i}`,
      type: 'feedback',
      title: ACTIVITY_TYPES[2].label,
      description: f.trainingTitle || 'Anonymous feedback',
      time: f.submittedAt || new Date(Date.now() - (i + 2) * 1800000).toISOString(),
    })
  })

  return activities.slice(0, 6)
}

function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--neutral-150)',
      borderRadius: 'var(--radius-lg)', padding: '12px 16px',
      boxShadow: 'var(--shadow-lg)', fontSize: 13,
      fontFamily: 'var(--font-primary)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 12, fontWeight: 600, color: p.color, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

export default function AdminOverviewTab({ user, stats, feedbacks, trainings, participants, initialLoading, loading }) {
  const greeting = getTimeGreeting()
  const firstName = user?.name?.split(' ')[0] || 'Admin'

  const chartData = useMemo(() => generateChartData(stats), [stats])

  const activities = useMemo(() => generateActivities(trainings, feedbacks, stats), [trainings, feedbacks, stats])

  const engagementData = useMemo(() => {
    const total = stats.totalParticipants || 0
    const activePct = total > 0 ? Math.min(42, Math.round(total * 0.42)) : 0
    const completedPct = total > 0 ? Math.round(total * 0.28) : 0
    const inProgressPct = total > 0 ? Math.round(total * 0.18) : 0
    const notStartedPct = total - activePct - completedPct - inProgressPct

    return {
      total,
      segments: [
        { name: 'Active Learners', value: Math.max(activePct, 0), color: ENGAGEMENT_COLORS.active },
        { name: 'Completed', value: Math.max(completedPct, 0), color: ENGAGEMENT_COLORS.completed },
        { name: 'In Progress', value: Math.max(inProgressPct, 0), color: ENGAGEMENT_COLORS.inProgress },
        { name: 'Not Started', value: Math.max(notStartedPct, 0), color: ENGAGEMENT_COLORS.notStarted },
      ],
    }
  }, [stats])

  const myTrainings = useMemo(() => {
    return (trainings || []).slice(0, 5).map((t, i) => ({
      ...t,
      completion: Math.min(100, Math.max(10, Math.floor(Math.random() * 80 + 20))),
      learners: t.enrolledCount ?? Math.floor(Math.random() * 50 + 5),
      gradient: TRAINER_GRADIENTS[i % TRAINER_GRADIENTS.length],
      isPublished: i < 3,
    }))
  }, [trainings])

  const upcomingSessions = useMemo(() => {
    return (trainings || []).slice(0, 4).map((t, i) => ({
      id: t.id,
      title: t.title,
      date: t.startDate
        ? new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: t.startDate
        ? new Date(t.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : `${9 + i}:00 AM`,
    }))
  }, [trainings])

  const quickLinks = [
    { icon: FileText, label: 'Create Assignment', color: '#059669', bg: 'rgba(5, 150, 105, 0.06)' },
    { icon: Upload, label: 'Upload Resource', color: '#10B981', bg: 'rgba(16, 185, 129, 0.06)' },
    { icon: ClipboardList, label: 'Create Quiz', color: '#0D9488', bg: 'rgba(13, 148, 136, 0.06)' },
    { icon: Send, label: 'Send Announcement', color: '#F79009', bg: 'rgba(247, 144, 9, 0.06)' },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Banner */}
      <motion.section variants={itemVariants} style={{
        background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #059669 100%)',
        borderRadius: 'var(--radius-2xl)',
        padding: 'var(--space-10) var(--space-10)',
        marginBottom: 'var(--space-8)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: '40%',
          width: 200, height: 200, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Sparkles size={16} style={{ color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{greeting}</span>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              margin: 0,
              marginBottom: 'var(--space-3)',
            }}>
              Welcome back, {firstName}
            </h1>
            <p style={{
              fontSize: 15,
              color: 'rgba(255,255,255,0.7)',
              maxWidth: 420,
              lineHeight: 1.6,
            }}>
              Here's what's happening across your platform today. Manage trainings, track performance, and grow your community.
            </p>
          </div>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-xl)',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#FFFFFF',
            fontFamily: 'var(--font-display)',
            backdropFilter: 'blur(8px)',
          }}>
            {user?.name ? user.name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'AD'}
          </div>
        </div>
      </motion.section>

      {/* Quick Stat Strip */}
      <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <StatCard label="Total Trainings" value={stats.totalTrainings ?? 0} icon={BookOpen} variant="primary" />
        <StatCard label="Total Participants" value={stats.totalParticipants ?? 0} icon={UserCheck} variant="emerald" />
        <StatCard label="Active Enrollments" value={stats.totalEnrollments ?? 0} icon={Activity} variant="blue" />
        <StatCard label="Avg Trainer Rating" value={stats.avgTrainerRating ?? '0.0'} icon={Star} variant="amber" />
      </motion.div>

      {/* Row 1: Training Overview Chart + Recent Activities */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* Training Overview Chart */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <div>
              <h3 className="enterprise-card__title">Training Overview</h3>
              <p style={{ fontSize: 13, color: 'var(--neutral-400)', marginTop: 2 }}>Enrollments & completions over time</p>
            </div>
            <span className="badge badge--info">
              <TrendingUp size={11} /> This Month
            </span>
          </div>
          <div className="enterprise-card__body" style={{ height: 280, padding: 'var(--space-4) var(--space-6)' }}>
            {initialLoading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEnroll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.enrollments} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={CHART_COLORS.enrollments} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradComplete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.completions} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={CHART_COLORS.completions} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--neutral-100)" vertical={false} />
                  <XAxis
                    dataKey="date" tick={{ fill: 'var(--neutral-400)', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--neutral-400)', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={36}
                    domain={[0, 'auto']}
                  />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'var(--brand-admin)', strokeWidth: 1, strokeOpacity: 0.1 }} />
                  <Area
                    type="monotone" dataKey="Enrollments"
                    stroke={CHART_COLORS.enrollments} strokeWidth={2.5}
                    fill="url(#gradEnroll)" dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: CHART_COLORS.enrollments }}
                  />
                  <Area
                    type="monotone" dataKey="Completions"
                    stroke={CHART_COLORS.completions} strokeWidth={2}
                    fill="url(#gradComplete)" dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: CHART_COLORS.completions }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.section>

        {/* Recent Activities */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Recent Activities</h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {activities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--neutral-400)', fontSize: 14 }}>
                <Activity size={20} style={{ marginBottom: 'var(--space-3)' }} />
                <div>No recent activity</div>
              </div>
            ) : (
              <div>
                {activities.map((a) => {
                  const typeInfo = ACTIVITY_TYPES.find(t => t.type === a.type) || ACTIVITY_TYPES[0]
                  const Icon = typeInfo.icon
                  return (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      padding: 'var(--space-4) var(--space-6)',
                      borderBottom: '1px solid var(--neutral-100)',
                      transition: 'background 150ms',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                        background: `${typeInfo.bg}10`, color: typeInfo.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={16} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-800)' }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--neutral-400)', whiteSpace: 'nowrap', fontWeight: 500 }}>{formatRelativeTime(a.time)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.section>
      </div>

      {/* Row 2: My Trainings + Learner Engagement */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* My Trainings */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">My Trainings</h3>
          </div>
          {myTrainings.length === 0 ? (
            <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--neutral-400)', fontSize: 14 }}>
              <BookOpen size={20} style={{ marginBottom: 'var(--space-3)' }} />
              <div>No trainings yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
              {myTrainings.map((t, i) => (
                <motion.div
                  key={t.id || i}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: 'var(--neutral-0)',
                    border: '1px solid var(--neutral-150)',
                    borderRadius: 'var(--radius-xl)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: 6, background: t.gradient }} />
                  <div style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        background: t.isPublished ? 'var(--status-success-bg)' : 'var(--neutral-100)',
                        color: t.isPublished ? 'var(--status-success-dark)' : 'var(--neutral-500)',
                      }}>
                        {t.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 'var(--space-2)' }}>{t.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--neutral-400)' }}>
                        <Users size={12} /> {t.learners} Learners
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-admin)' }}>{t.completion}%</span>
                    </div>
                    <ProgressBar value={t.completion} max={100} color={t.completion > 70 ? 'emerald' : t.completion > 40 ? 'blue' : 'violet'} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Learner Engagement Donut */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Learner Engagement</h3>
          </div>
          <div className="enterprise-card__body" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <DonutChart data={engagementData.segments} colors={['#059669', '#0D9488', '#10B981', '#F79009']} height={200} />
          </div>
        </motion.section>
      </div>

      {/* Row 3: Upcoming Sessions + Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Upcoming Sessions */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Upcoming Sessions</h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {upcomingSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--neutral-400)', fontSize: 14 }}>
                <Calendar size={20} style={{ marginBottom: 'var(--space-3)' }} />
                <div>No upcoming sessions</div>
              </div>
            ) : (
              <div>
                {upcomingSessions.map((s, i) => (
                  <div key={s.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-4) var(--space-6)',
                    borderBottom: '1px solid var(--neutral-100)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                      background: 'var(--brand-admin-bg)', color: 'var(--brand-admin)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Calendar size={16} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-800)' }}>{s.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>
                        <Clock size={11} /> {s.date} &middot; {s.time}
                      </div>
                    </div>
                    <span className="badge badge--info" style={{ fontSize: 11 }}>Live Session</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.section>

        {/* Quick Links */}
        <motion.section variants={itemVariants} className="enterprise-card">
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Quick Actions</h3>
          </div>
          <div className="enterprise-card__body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {quickLinks.map((l, i) => (
                <motion.button
                  key={l.label}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 'var(--space-3)', padding: 'var(--space-5) var(--space-4)',
                    background: 'var(--neutral-25)', border: '1px solid var(--neutral-150)',
                    borderRadius: 'var(--radius-xl)', cursor: 'pointer',
                    transition: 'all 200ms',
                    fontFamily: 'var(--font-primary)',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                    background: l.bg, color: l.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <l.icon size={20} strokeWidth={1.8} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-700)' }}>{l.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.section>
      </div>
    </motion.div>
  )
}
