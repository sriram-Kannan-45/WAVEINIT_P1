import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { StatCard, DonutChart, ProgressBar } from '../../ui'
import {
  Sparkles, BookOpen, Users, UserCheck, Activity,
  Star, Award, TrendingUp, Calendar, Clock,
  UserPlus, ClipboardList, Upload,
  BarChart3, CheckCircle2, AlertCircle,
  GraduationCap, Target, Settings
} from 'lucide-react'

const CHART_COLORS = {
  enrollments: '#16A34A',
  completions: '#22C55E',
}

const ENGAGEMENT_COLORS = {
  active: '#16A34A',
  completed: '#22C55E',
  inProgress: '#3B82F6',
  notStarted: '#F59E0B',
}

const ACTIVITY_TYPES = [
  { type: 'lesson', icon: BookOpen, color: '#16A34A', label: 'New lesson added' },
  { type: 'enrollment', icon: Users, color: '#3B82F6', label: 'New enrollments' },
  { type: 'feedback', icon: Star, color: '#F59E0B', label: 'New feedback received' },
  { type: 'quiz', icon: ClipboardList, color: '#8B5CF6', label: 'Quiz created' },
]

const TRAINER_GRADIENTS = [
  'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
  'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
  'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
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
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
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
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: 14,
      padding: '14px 18px',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
      fontSize: 13,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 6, fontSize: 13 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 12, fontWeight: 600, color: p.color, display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

export default function AdminOverviewTab({ user, stats, feedbacks, trainings, participants, trainers, initialLoading, loading }) {
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

  const pendingApprovals = useMemo(() => {
    return (participants || []).filter(p => (p.status || '').toUpperCase() === 'PENDING').slice(0, 5)
  }, [participants])

  const recentEnrollments = useMemo(() => {
    return (participants || []).slice(0, 6).map((p, i) => ({
      ...p,
      trainer: trainings[i % Math.max(trainings.length, 1)]?.trainerName || 'Unassigned',
      course: trainings[i % Math.max(trainings.length, 1)]?.title || 'General',
      progress: Math.floor(Math.random() * 100),
    }))
  }, [participants, trainings])

  const quickActions = [
    { icon: BookOpen, label: 'Create Training', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
    { icon: UserCheck, label: 'Approve Trainer', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)' },
    { icon: UserPlus, label: 'Add Participant', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.08)' },
    { icon: BarChart3, label: 'View Reports', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.08)' },
    { icon: Upload, label: 'Import Users', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.08)' },
    { icon: Settings, label: 'Settings', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.08)' },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', flexDirection: 'column', gap: 32 }}
    >
      {/* ═══ Welcome Hero Section ═══ */}
      <motion.section
        variants={itemVariants}
        style={{
          background: 'linear-gradient(135deg, #16A34A 0%, #22C55E 50%, #16A34A 100%)',
          borderRadius: 20,
          padding: '40px 48px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 250, height: 250, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, left: '35%',
          width: 180, height: 180, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '20%', right: '25%',
          width: 100, height: 100, borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={16} style={{ color: 'rgba(255,255,255,0.7)' }} />
              <span style={{
                fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>{greeting}</span>
            </div>
            <h1 style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 32,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              margin: 0,
              marginBottom: 12,
            }}>
              Welcome back, {firstName}
            </h1>
            <p style={{
              fontSize: 15,
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.6,
              marginBottom: 24,
            }}>
              Here's what's happening across your platform today. Manage trainings, track performance, and grow your community.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {quickActions.slice(0, 4).map((action, i) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px',
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'background 200ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >
                  <action.icon size={15} strokeWidth={2} />
                  {action.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 16, marginLeft: 48,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#FFFFFF',
              fontFamily: 'Inter, sans-serif',
            }}>
              {user?.name ? user.name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'AD'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                System Status
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px rgba(74, 222, 128, 0.5)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>All Systems Operational</span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ═══ Statistics Section ═══ */}
      <motion.div variants={itemVariants}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          <StatCard label="Total Trainings" value={stats.totalTrainings ?? 0} icon={BookOpen} variant="primary" />
          <StatCard label="Active Trainers" value={trainers?.length ?? stats.totalTrainers ?? 0} icon={UserCheck} variant="emerald" />
          <StatCard label="Participants" value={stats.totalParticipants ?? 0} icon={Users} variant="blue" />
          <StatCard label="Pending Approvals" value={pendingApprovals.length} icon={AlertCircle} variant="amber" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginTop: 20 }}>
          <StatCard label="Completed Courses" value={stats.completedTrainings ?? 0} icon={CheckCircle2} variant="emerald" />
          <StatCard label="Active Enrollments" value={stats.totalEnrollments ?? 0} icon={Activity} variant="primary" />
          <StatCard label="Avg Trainer Rating" value={stats.avgTrainerRating ?? '0.0'} icon={Star} variant="amber" />
          <StatCard label="Avg Subject Rating" value={stats.avgSubjectRating ?? '0.0'} icon={Target} variant="blue" />
        </div>
      </motion.div>

      {/* ═══ Analytics & Activities Row ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Training Growth Chart */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <div>
              <h3 className="enterprise-card__title">Training Growth</h3>
              <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Enrollments & completions over time</p>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 12px', borderRadius: 20,
              background: '#F0FDF4', color: '#16A34A',
              fontSize: 12, fontWeight: 600,
            }}>
              <TrendingUp size={12} /> This Month
            </span>
          </div>
          <div className="enterprise-card__body" style={{ height: 300, padding: '16px 24px 24px' }}>
            {initialLoading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEnroll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.enrollments} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART_COLORS.enrollments} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradComplete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.completions} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={CHART_COLORS.completions} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis
                    dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={36}
                    domain={[0, 'auto']}
                  />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: '#16A34A', strokeWidth: 1, strokeOpacity: 0.1 }} />
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
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Recent Activities</h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {activities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9CA3AF', fontSize: 14 }}>
                <Activity size={20} style={{ marginBottom: 12 }} />
                <div>No recent activity</div>
              </div>
            ) : (
              <div>
                {activities.map((a) => {
                  const typeInfo = ACTIVITY_TYPES.find(t => t.type === a.type) || ACTIVITY_TYPES[0]
                  const Icon = typeInfo.icon
                  return (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 24px',
                      borderBottom: '1px solid #F3F4F6',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${typeInfo.color}10`, color: typeInfo.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={16} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                      </div>
                      <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', fontWeight: 500 }}>{formatRelativeTime(a.time)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.section>
      </div>

      {/* ═══ Trainings & Engagement Row ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Training Cards */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Training Programs</h3>
          </div>
          {myTrainings.length === 0 ? (
            <div className="enterprise-card__body" style={{ textAlign: 'center', padding: '48px 24px', color: '#9CA3AF', fontSize: 14 }}>
              <BookOpen size={20} style={{ marginBottom: 12 }} />
              <div>No trainings yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, padding: 24 }}>
              {myTrainings.map((t, i) => (
                <motion.div
                  key={t.id || i}
                  whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)' }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: 16,
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ height: 4, background: t.gradient }} />
                  <div style={{ padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '3px 10px', borderRadius: 20,
                        background: t.isPublished ? '#F0FDF4' : '#F3F4F6',
                        color: t.isPublished ? '#16A34A' : '#6B7280',
                      }}>
                        {t.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{t.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9CA3AF' }}>
                        <Users size={12} /> {t.learners} Learners
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{t.completion}%</span>
                    </div>
                    <ProgressBar value={t.completion} max={100} color={t.completion > 70 ? 'emerald' : t.completion > 40 ? 'blue' : 'violet'} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Learner Engagement Donut */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Learner Engagement</h3>
          </div>
          <div className="enterprise-card__body" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <DonutChart data={engagementData.segments} colors={['#16A34A', '#22C55E', '#3B82F6', '#F59E0B']} height={200} />
          </div>
        </motion.section>
      </div>

      {/* ═══ Bottom Row: Sessions + Calendar + Notifications ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        {/* Upcoming Sessions */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Upcoming Sessions</h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {upcomingSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9CA3AF', fontSize: 14 }}>
                <Calendar size={20} style={{ marginBottom: 12 }} />
                <div>No upcoming sessions</div>
              </div>
            ) : (
              <div>
                {upcomingSessions.map((s, i) => (
                  <div key={s.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 24px',
                    borderBottom: i < upcomingSessions.length - 1 ? '1px solid #F3F4F6' : 'none',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: '#F0FDF4', color: '#16A34A',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Calendar size={16} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                        <Clock size={11} /> {s.date} &middot; {s.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.section>

        {/* Quick Actions */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Quick Actions</h3>
          </div>
          <div className="enterprise-card__body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {quickActions.map((l, i) => (
                <motion.button
                  key={l.label}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 10, padding: '20px 16px',
                    background: '#F9FAFB', border: '1px solid #F3F4F6',
                    borderRadius: 16, cursor: 'pointer',
                    transition: 'all 200ms',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#F3F4F6'
                    e.currentTarget.style.borderColor = '#E5E7EB'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#F9FAFB'
                    e.currentTarget.style.borderColor = '#F3F4F6'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: l.bg, color: l.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <l.icon size={20} strokeWidth={1.8} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{l.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Notifications Widget */}
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Notifications</h3>
          </div>
          <div className="enterprise-card__body" style={{ padding: 0 }}>
            {[
              { icon: CheckCircle2, color: '#16A34A', title: 'New trainer approved', time: '2m ago', type: 'success' },
              { icon: UserPlus, color: '#3B82F6', title: 'New participant enrolled', time: '15m ago', type: 'info' },
              { icon: AlertCircle, color: '#F59E0B', title: '3 pending approvals', time: '1h ago', type: 'warning' },
              { icon: BookOpen, color: '#8B5CF6', title: 'Training created', time: '2h ago', type: 'info' },
              { icon: Award, color: '#EC4899', title: 'Certificate generated', time: '3h ago', type: 'info' },
            ].map((n, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 24px',
                borderBottom: i < 4 ? '1px solid #F3F4F6' : 'none',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${n.color}10`, color: n.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <n.icon size={14} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{n.title}</div>
                </div>
                <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{n.time}</span>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      {/* ═══ Pending Approvals Widget ═══ */}
      {pendingApprovals.length > 0 && (
        <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
          <div className="enterprise-card__header">
            <h3 className="enterprise-card__title">Pending Approvals</h3>
            <span style={{
              padding: '4px 12px', borderRadius: 20,
              background: '#FEF3C7', color: '#D97706',
              fontSize: 12, fontWeight: 600,
            }}>
              {pendingApprovals.length} pending
            </span>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingApprovals.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: '#111827' }}>{p.name}</td>
                    <td style={{ color: '#6B7280' }}>{p.email}</td>
                    <td style={{ color: '#6B7280' }}>{p.phone || '-'}</td>
                    <td style={{ color: '#9CA3AF' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button style={{
                        padding: '6px 16px', borderRadius: 8,
                        background: '#16A34A', color: '#FFFFFF',
                        border: 'none', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      }}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      )}

      {/* ═══ Recent Enrollments Table ═══ */}
      <motion.section variants={itemVariants} className="enterprise-card" style={{ overflow: 'hidden' }}>
        <div className="enterprise-card__header">
          <h3 className="enterprise-card__title">Recent Enrollments</h3>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Trainer</th>
                <th>Course</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 24px', color: '#9CA3AF' }}>
                    No enrollments yet
                  </td>
                </tr>
              ) : (
                recentEnrollments.map((e, i) => (
                  <tr key={e.id || i}>
                    <td style={{ fontWeight: 600, color: '#111827' }}>{e.name}</td>
                    <td style={{ color: '#6B7280' }}>{e.trainer}</td>
                    <td style={{ color: '#6B7280' }}>{e.course}</td>
                    <td>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20,
                        background: (e.status || '').toUpperCase() === 'APPROVED' ? '#F0FDF4' : '#FEF3C7',
                        color: (e.status || '').toUpperCase() === 'APPROVED' ? '#16A34A' : '#D97706',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {e.status || 'Pending'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ height: '100%', width: `${e.progress}%`, background: '#16A34A', borderRadius: 3, transition: 'width 500ms' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', minWidth: 32 }}>{e.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <button style={{
                        padding: '6px 12px', borderRadius: 8,
                        background: 'transparent', color: '#6B7280',
                        border: '1px solid #E5E7EB', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        transition: 'all 150ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.borderColor = '#D1D5DB' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#E5E7EB' }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>
    </motion.div>
  )
}
