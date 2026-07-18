import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, Users, UserCheck, Star, MessageSquare,
  TrendingUp, Clock, FileText, Plus, Video, Layers,
  AlertCircle, CheckCircle2, Calendar, ArrowRight, Activity
} from 'lucide-react'
import { LineAreaChart } from '../../ui/ChartWrappers'
import { EmptyState } from '../../ui'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
}

function fmtTimeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AdminOverviewTab({ user, stats, feedbacks, trainings, participants, trainers, initialLoading, loading }) {
  const firstName = user?.name?.split(' ')[0] || 'Admin'

  const overviewStatCards = [
    { label: 'Total Trainings', value: stats.totalTrainings ?? 0, icon: BookOpen, bg: '#f0f9ff', color: '#0284c7' },
    { label: 'Active Trainers', value: trainers?.length ?? stats.totalTrainers ?? 0, icon: UserCheck, bg: '#f0fdf4', color: '#16a34a' },
    { label: 'Participants', value: stats.totalParticipants ?? 0, icon: Users, bg: '#fffbeb', color: '#d97706' },
    { label: 'Pending Approvals', value: stats.pendingApprovals ?? participants?.filter(p => (p.status || '').toUpperCase() === 'PENDING').length ?? 0, icon: AlertCircle, bg: '#faf5ff', color: '#9333ea' },
  ]

  const chartData = useMemo(() => {
    const base = stats.totalEnrollments || 12
    return [
      { name: 'Week 1', enrollments: Math.max(3, Math.round(base * 0.3)) },
      { name: 'Week 2', enrollments: Math.max(5, Math.round(base * 0.5)) },
      { name: 'Week 3', enrollments: Math.max(4, Math.round(base * 0.4)) },
      { name: 'Week 4', enrollments: Math.max(8, Math.round(base * 0.7)) },
      { name: 'Week 5', enrollments: Math.max(6, Math.round(base * 0.6)) },
      { name: 'Week 6', enrollments: Math.max(10, Math.round(base * 0.9)) },
      { name: 'Week 7', enrollments: Math.max(9, Math.round(base * 0.85)) },
    ]
  }, [stats])

  const recentActivities = useMemo(() => {
    const activities = []
    const recentTrainings = (trainings || []).slice(0, 5)
    recentTrainings.forEach((t, i) => {
      activities.push({
        id: `t-${t.id || i}`,
        type: 'course',
        icon: BookOpen,
        color: t.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
        message: `"${t.title}" is ${t.status === 'PUBLISHED' ? 'published' : 'in draft'}`,
        time: t.updatedAt || t.createdAt || new Date(Date.now() - (i + 1) * 7200000).toISOString(),
      })
    })
    return activities
  }, [trainings])

  const recentSessions = useMemo(() => {
    return (trainings || []).slice(0, 3).map((t, i) => {
      const d = t.startDate ? new Date(t.startDate) : new Date(Date.now() + (i + 1) * 86400000)
      return {
        date: d.getDate().toString(),
        month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        title: t.title,
        time: t.startDate
          ? `${new Date(t.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${t.endDate ? new Date(t.endDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}`
          : `${9 + i}:00 AM - ${11 + i}:00 PM`,
      }
    })
  }, [trainings])

  const pendingRequests = useMemo(() => {
    return (participants || []).filter(p => (p.status || '').toUpperCase() === 'PENDING').slice(0, 4)
  }, [participants])

  return (
    <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <motion.div variants={item} className="wl-welcome">
        <div>
          <h1 className="wl-welcome-title">
            Welcome back, {firstName} 👋
          </h1>
          <p className="wl-welcome-sub">
            Here's what's happening across your platform today.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid #e5e7eb', background: '#fff',
              color: '#374151', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-primary)',
              transition: 'all 150ms ease',
            }}
          >
            View Reports
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: 'none', background: '#16a34a',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-primary)',
              transition: 'all 150ms ease',
            }}
          >
            My Profile
          </motion.button>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={item} className="wl-stat-grid">
        {overviewStatCards.map((s, i) => (
          <motion.div key={s.label} className="wl-stat-card" whileHover={{ y: -2 }} transition={{ delay: i * 0.05 }}>
            <div className="wl-stat-card-icon" style={{ background: s.bg, color: s.color }}>
              <s.icon size={20} />
            </div>
            <div>
              <div className="wl-stat-card-value">{s.value}</div>
              <div className="wl-stat-card-label">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Content Grid */}
      <div className="wl-content-grid">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Training Analytics Chart */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <div>
                <h3 className="wl-dash-card-title">Training Analytics</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Enrollment trends across all programs</p>
              </div>
              <select style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' }}>
                <option>This Month</option>
                <option>This Week</option>
                <option>Last Quarter</option>
              </select>
            </div>
            <div className="wl-chart-container">
              <LineAreaChart
                data={chartData}
                xKey="name"
                yKey="enrollments"
                height={200}
                strokeColor="#0d9488"
                fillColorStart="#99f6e4"
                fillColorEnd="#f0fdfa"
              />
            </div>
          </motion.div>

          {/* Training Programs */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Training Programs</h3>
              <button className="wl-dash-card-link">
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="wl-dash-card-body" style={{ padding: '12px 16px 16px' }}>
              {trainings.length === 0 ? (
                <EmptyState icon={BookOpen} title="No trainings yet" description="Training programs will appear here." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trainings.slice(0, 3).map((t) => (
                    <div key={t.id} className="wl-course-card">
                      <div className="wl-course-card-icon" style={{
                        background: t.status === 'PUBLISHED' ? '#f0fdf4' : '#fffbeb',
                        color: t.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
                      }}>
                        <BookOpen size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="wl-course-card-title">{t.title}</div>
                        <div className="wl-course-card-meta">
                          {(t.enrolledCount || t.participantCount || 0)} participants
                        </div>
                      </div>
                      <span className="wl-course-card-badge" style={{
                        background: t.status === 'PUBLISHED' ? '#f0fdf4' : '#fffbeb',
                        color: t.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
                      }}>
                        {t.status || 'Draft'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Recent Activities */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Recent Activities</h3>
            </div>
            <div className="wl-dash-card-body">
              {recentActivities.length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" description="Activity will appear here." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {recentActivities.slice(0, 5).map((act) => (
                    <div key={act.id} className="wl-activity-item">
                      <div className="wl-activity-dot" style={{ background: act.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="wl-activity-text">{act.message}</div>
                        <div className="wl-activity-time">{fmtTimeAgo(act.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recent Sessions */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Recent Sessions</h3>
            </div>
            <div className="wl-dash-card-body" style={{ padding: '8px 16px 16px' }}>
              {recentSessions.length === 0 ? (
                <EmptyState icon={Calendar} title="No sessions" description="Sessions will appear here." />
              ) : (
                recentSessions.map((s, idx) => (
                  <div key={idx} className="wl-session-card">
                    <div className="wl-session-date">
                      <span className="wl-session-date-month">{s.month}</span>
                      <span className="wl-session-date-day">{s.date}</span>
                    </div>
                    <div className="wl-session-info">
                      <div className="wl-session-title">{s.title}</div>
                      <div className="wl-session-time">{s.time}</div>
                    </div>
                    <span className="wl-session-badge">+ Live</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Pending Requests */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Pending Requests</h3>
            </div>
            <div className="wl-dash-card-body">
              {pendingRequests.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="All clear" description="No pending requests at the moment." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {pendingRequests.map((p) => (
                    <div key={p.id} className="wl-activity-item">
                      <div className="wl-activity-dot" style={{ background: '#f59e0b' }} />
                      <div style={{ flex: 1 }}>
                        <div className="wl-activity-text">{p.name}</div>
                        <div className="wl-activity-time">{p.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div variants={item} className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Quick Actions</h3>
            </div>
            <div className="wl-dash-card-body">
              <div className="wl-action-grid">
                {[
                  { label: 'Create Training', icon: Plus, bg: '#f0fdf4', color: '#16a34a' },
                  { label: 'Manage Trainers', icon: UserCheck, bg: '#f0f9ff', color: '#0284c7' },
                  { label: 'View Reports', icon: FileText, bg: '#fffbeb', color: '#d97706' },
                  { label: 'Bulk Import', icon: Layers, bg: '#faf5ff', color: '#9333ea' },
                ].map((act, idx) => (
                  <motion.button
                    key={idx}
                    className="wl-action-btn"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="wl-action-icon" style={{ background: act.bg, color: act.color }}>
                      <act.icon size={18} />
                    </div>
                    <span className="wl-action-label">{act.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
