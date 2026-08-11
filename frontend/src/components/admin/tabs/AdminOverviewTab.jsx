import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Users, UserCheck, AlertCircle, Activity,
  Calendar, ArrowRight, Plus, FileText, Layers, Star, TrendingUp
} from 'lucide-react'
import { LineAreaChart } from '../../ui/ChartWrappers'

function fmtTimeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const statusColor = (status) => (status || '').toUpperCase() === 'PUBLISHED' ? '#16a34a' : '#d97706'
const statusBg = (status) => (status || '').toUpperCase() === 'PUBLISHED' ? '#f0fdf4' : '#fffbeb'

export default function AdminOverviewTab({ user, stats, feedbacks, trainings, participants, trainers, initialLoading, loading }) {
  const navigate = useNavigate()
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
        color: statusColor(t.status),
        message: `"${t.title}" is ${statusColor(t.status) === '#16a34a' ? 'published' : 'in draft'}`,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Welcome Banner */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
          <TrendingUp size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="reg-admin-title">
            Welcome back, {firstName}
          </h1>
          <p className="reg-admin-subtitle">
            Here's what's happening across your platform today.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button className="reg-admin-btn reg-admin-btn--secondary" type="button" style={{ cursor: 'pointer' }}>
            <FileText size={15} /> View Reports
          </button>
          <button className="reg-admin-btn reg-admin-btn--primary" type="button" style={{ cursor: 'pointer' }} onClick={() => navigate('/my-profile')}>
            <Users size={15} /> My Profile
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="reg-admin-stats">
        {overviewStatCards.map((s) => (
          <div key={s.label} className="reg-admin-stat">
            <div className="reg-admin-stat-icon" style={{ background: s.bg, color: s.color }}>
              <s.icon size={20} />
            </div>
            <div>
              <div className="reg-admin-stat-num">{s.value}</div>
              <div className="reg-admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="reg-dash-grid">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Training Analytics Chart */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <div>
                <h3 className="reg-card-title">Training Analytics</h3>
                <p className="reg-card-subtitle">Enrollment trends across all programs</p>
              </div>
              <select className="reg-select" defaultValue="This Month" style={{ width: 'auto', padding: '6px 28px 6px 12px', fontSize: 12 }}>
                <option>This Month</option>
                <option>This Week</option>
                <option>Last Quarter</option>
              </select>
            </div>
            <div className="reg-card-body" style={{ paddingTop: 0 }}>
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
          </div>

          {/* Training Programs */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <h3 className="reg-card-title">Training Programs</h3>
              <button className="reg-admin-btn reg-admin-btn--ghost" type="button" style={{ cursor: 'pointer' }}>
                View all <ArrowRight size={13} />
              </button>
            </div>
            <div className="reg-card-body" style={{ padding: '12px 16px 16px' }}>
              {trainings.length === 0 ? (
                <div className="reg-admin-empty">
                  <BookOpen size={22} />
                  <div className="reg-admin-empty-title">No trainings yet</div>
                  <div className="reg-admin-empty-sub">Training programs will appear here.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trainings.slice(0, 3).map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #eef2f7', background: '#fff' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: statusBg(t.status), color: statusColor(t.status) }}>
                        <BookOpen size={17} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'var(--font-primary)' }}>
                          {(t.enrolledCount || t.participantCount || 0)} participants
                        </div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-primary)', background: statusBg(t.status), color: statusColor(t.status) }}>
                        {t.status || 'Draft'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <h3 className="reg-card-title">Recent Activities</h3>
            </div>
            <div className="reg-card-body">
              {recentActivities.length === 0 ? (
                <div className="reg-admin-empty">
                  <Activity size={22} />
                  <div className="reg-admin-empty-title">No activity yet</div>
                  <div className="reg-admin-empty-sub">Activity will appear here.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recentActivities.slice(0, 5).map((act) => (
                    <div key={act.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: act.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: '#334155', fontFamily: 'var(--font-primary)' }}>{act.message}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{fmtTimeAgo(act.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Recent Sessions */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <h3 className="reg-card-title">Recent Sessions</h3>
            </div>
            <div className="reg-card-body" style={{ padding: '8px 16px 16px' }}>
              {recentSessions.length === 0 ? (
                <div className="reg-admin-empty">
                  <Calendar size={22} />
                  <div className="reg-admin-empty-title">No sessions</div>
                  <div className="reg-admin-empty-sub">Sessions will appear here.</div>
                </div>
              ) : (
                recentSessions.map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 10, background: '#0d9488', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, fontFamily: 'var(--font-primary)' }}>{s.month}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-primary)' }}>{s.date}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{s.time}</div>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-primary)', background: '#f0fdf4', color: '#16a34a' }}>+ Live</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Requests */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <h3 className="reg-card-title">Pending Requests</h3>
            </div>
            <div className="reg-card-body">
              {pendingRequests.length === 0 ? (
                <div className="reg-admin-empty">
                  <Star size={22} />
                  <div className="reg-admin-empty-title">All clear</div>
                  <div className="reg-admin-empty-sub">No pending requests at the moment.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pendingRequests.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: '#f59e0b' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: '#334155', fontWeight: 600, fontFamily: 'var(--font-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="reg-admin-table-wrap">
            <div className="reg-card-header">
              <h3 className="reg-card-title">Quick Actions</h3>
            </div>
            <div className="reg-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Create Training', icon: Plus, bg: '#f0fdf4', color: '#16a34a' },
                  { label: 'Manage Trainers', icon: UserCheck, bg: '#f0f9ff', color: '#0284c7' },
                  { label: 'View Reports', icon: FileText, bg: '#fffbeb', color: '#d97706' },
                  { label: 'Bulk Import', icon: Layers, bg: '#faf5ff', color: '#9333ea' },
                ].map((act, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px',
                      borderRadius: 10, border: '1px solid #eef2f7', background: '#fff',
                      cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-primary)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#eef2f7'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: act.bg, color: act.color }}>
                      <act.icon size={16} />
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', textAlign: 'left' }}>{act.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
