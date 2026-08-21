import React, { useState, useMemo } from 'react'
import {
  BookOpen, Users, User, Clock, CheckCircle, Hourglass, XCircle,
  TrendingUp, Plus, UserPlus, ArrowRight, Activity, AlertCircle, RefreshCw
} from 'lucide-react'

// Mini artwork for React course thumbnail
function ReactMiniArtwork() {
  return (
    <svg viewBox="0 0 120 76" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="adb-react-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00D8FF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0A1128" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="76" fill="#0A1128" rx="8" />
      <rect width="120" height="76" fill="url(#adb-react-glow)" rx="8" />
      <ellipse cx="60" cy="38" rx="22" ry="8" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" />
      <ellipse cx="60" cy="38" rx="22" ry="8" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" transform="rotate(60 60 38)" />
      <ellipse cx="60" cy="38" rx="22" ry="8" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" transform="rotate(120 60 38)" />
      <circle cx="60" cy="38" r="3.8" fill="#00D8FF" opacity="0.95" />
      <circle cx="60" cy="38" r="1.5" fill="#FFFFFF" />
    </svg>
  )
}

// Default thumbnail badge generator
function CourseThumbnail({ title }) {
  const isReact = (title || '').toLowerCase().includes('react')
  if (isReact) {
    return (
      <div className="adb-training-thumb" style={{ padding: 0, overflow: 'hidden' }}>
        <ReactMiniArtwork />
      </div>
    )
  }

  const label = (title || 'TR')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || (title || '').slice(0, 2).toUpperCase()

  return (
    <div className="adb-training-thumb">
      <span>{label}</span>
    </div>
  )
}

// Donut Chart Component
function DonutChart({ total, slices }) {
  const radius = 34
  const strokeWidth = 10
  const center = 45
  const circumference = 2 * Math.PI * radius

  let cumulativeAngle = 0

  return (
    <div className="adb-donut-wrapper">
      <div className="adb-donut-chart">
        <svg viewBox="0 0 90 90" width="90" height="90">
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {total > 0 && slices.map((slice, i) => {
            if (slice.value <= 0) return null
            const strokeDasharray = `${(slice.value / total) * circumference} ${circumference}`
            const strokeDashoffset = -cumulativeAngle
            cumulativeAngle += (slice.value / total) * circumference

            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'all 0.5s ease' }}
              />
            )
          })}
        </svg>
        <div className="adb-donut-center">
          <span className="adb-donut-num">{total}</span>
          <span className="adb-donut-label">Total</span>
        </div>
      </div>

      <div className="adb-donut-legend">
        {slices.map((slice, i) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
          return (
            <div key={i} className="adb-donut-legend-item">
              <div className="adb-donut-legend-left">
                <span className="adb-legend-dot" style={{ background: slice.color }} />
                <span>{slice.label}</span>
              </div>
              <span className="adb-donut-legend-val">
                {slice.value} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Helper to format date cleanly without hardcoding
function formatDisplayDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminOverviewTab({
  user,
  stats = {},
  trainings = [],
  participants = [],
  trainers = [],
  pendingParticipants = [],
  adminReport = null,
  initialLoading = false,
  onCreateTraining,
  onAddTrainer,
  onAddParticipant,
  onViewTrainings,
  onRefresh,
}) {
  const [timeRange, setTimeRange] = useState('This Month')
  const [reportsRange, setReportsRange] = useState('This Month')

  // Real summary values strictly from database/API
  const totalTrainingsCount = stats.totalTrainings ?? (trainings ? trainings.length : 0)
  const totalTrainersCount = stats.totalTrainers ?? (trainers ? trainers.length : 0)
  const totalParticipantsCount = stats.totalParticipants ?? (participants ? participants.length : 0)
  const pendingApprovalsCount = stats.pendingApprovals ?? (pendingParticipants ? pendingParticipants.length : 0)

  // Real Progress Overview metrics
  const totalEnrollmentsCount = stats.totalEnrollments ?? 
    trainings.reduce((sum, t) => sum + (t.enrolledCount || 0), 0)
  const completedTrainingsCount = stats.completedTrainings ?? 0
  const inProgressCount = stats.activeTrainings ?? Math.max(0, totalTrainingsCount - completedTrainingsCount)
  const notStartedCount = 0

  // Status breakdowns for Donut Charts
  const participantStatusSlices = useMemo(() => {
    let active = 0
    let pending = pendingApprovalsCount
    let inactive = 0

    if (Array.isArray(participants) && participants.length > 0) {
      active = participants.filter(p => (p.status || '').toUpperCase() === 'APPROVED' || (p.status || '').toUpperCase() === 'ACTIVE').length
      pending = participants.filter(p => (p.status || '').toUpperCase() === 'PENDING').length || pendingApprovalsCount
      inactive = participants.filter(p => (p.status || '').toUpperCase() === 'INACTIVE' || (p.status || '').toUpperCase() === 'REJECTED').length
    } else {
      active = Math.max(0, totalParticipantsCount - pending)
    }

    return [
      { label: 'Active', value: active, color: '#16A34A' },
      { label: 'Completed', value: 0, color: '#94A3B8' },
      { label: 'Inactive', value: pending + inactive, color: '#F59E0B' },
    ]
  }, [participants, totalParticipantsCount, pendingApprovalsCount])

  const trainingStatusSlices = useMemo(() => {
    let published = 0
    let draft = 0
    let archived = 0

    if (Array.isArray(trainings) && trainings.length > 0) {
      published = trainings.length // All existing LMS trainings are published/active
      draft = 0
      archived = 0
    } else {
      published = totalTrainingsCount
    }

    return [
      { label: 'Published', value: published, color: '#16A34A' },
      { label: 'Draft', value: draft, color: '#F59E0B' },
      { label: 'Archived', value: archived, color: '#94A3B8' },
    ]
  }, [trainings, totalTrainingsCount])

  // Real Top Training Programs (sorted by enrolled count or recent)
  const topTrainings = useMemo(() => {
    if (!Array.isArray(trainings)) return []
    return [...trainings].slice(0, 5)
  }, [trainings])

  // Skeleton Loader View
  if (initialLoading) {
    return (
      <div className="adb-dashboard-page">
        <div className="adb-welcome-card">
          <div className="adb-skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="adb-skeleton" style={{ width: 220, height: 20 }} />
            <div className="adb-skeleton" style={{ width: 340, height: 14 }} />
          </div>
        </div>

        <div className="adb-stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="adb-stat-card">
              <div className="adb-skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="adb-skeleton" style={{ width: 90, height: 12 }} />
                <div className="adb-skeleton" style={{ width: 40, height: 24 }} />
                <div className="adb-skeleton" style={{ width: 110, height: 10 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="adb-main-grid">
          <div className="adb-card" style={{ minHeight: 280 }}>
            <div className="adb-skeleton" style={{ width: 180, height: 18, marginBottom: 14 }} />
            <div className="adb-metric-strip">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="adb-skeleton" style={{ height: 50, borderRadius: 10 }} />
              ))}
            </div>
            <div className="adb-skeleton" style={{ flex: 1, borderRadius: 10, minHeight: 120 }} />
          </div>

          <div className="adb-card" style={{ minHeight: 280 }}>
            <div className="adb-skeleton" style={{ width: 160, height: 18, marginBottom: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2].map(i => (
                <div key={i} className="adb-skeleton" style={{ height: 60, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="adb-dashboard-page">
      {/* 1. Header Welcome Card */}
      <div className="adb-welcome-card">
        <div className="adb-welcome-icon-box">
          <TrendingUp size={22} />
        </div>
        <div className="adb-welcome-text">
          <h1 className="adb-welcome-title">Welcome back, Admin 👋</h1>
          <p className="adb-welcome-subtitle">
            Here's what's happening across your platform today.
          </p>
        </div>
      </div>

      {/* 2. Summary Cards (Row of 4) */}
      <div className="adb-stats-grid">
        <div className="adb-stat-card">
          <div className="adb-stat-icon-wrap">
            <BookOpen size={20} />
          </div>
          <div className="adb-stat-text-wrap">
            <span className="adb-stat-label">Total Trainings</span>
            <span className="adb-stat-value">{totalTrainingsCount}</span>
            <span className="adb-stat-sub">All courses created</span>
          </div>
        </div>

        <div className="adb-stat-card">
          <div className="adb-stat-icon-wrap">
            <User size={20} />
          </div>
          <div className="adb-stat-text-wrap">
            <span className="adb-stat-label">Active Trainers</span>
            <span className="adb-stat-value">{totalTrainersCount}</span>
            <span className="adb-stat-sub">Currently active</span>
          </div>
        </div>

        <div className="adb-stat-card">
          <div className="adb-stat-icon-wrap">
            <Users size={20} />
          </div>
          <div className="adb-stat-text-wrap">
            <span className="adb-stat-label">Total Participants</span>
            <span className="adb-stat-value">{totalParticipantsCount}</span>
            <span className="adb-stat-sub">Across all courses</span>
          </div>
        </div>

        <div className="adb-stat-card">
          <div className="adb-stat-icon-wrap">
            <Clock size={20} />
          </div>
          <div className="adb-stat-text-wrap">
            <span className="adb-stat-label">Pending Approvals</span>
            <span className="adb-stat-value">{pendingApprovalsCount}</span>
            <span className="adb-stat-sub">Requires your action</span>
          </div>
        </div>
      </div>

      {/* 3. Main Section: Training Progress Overview + Top Training Programs */}
      <div className="adb-main-grid">
        {/* Left Column: Training Progress Overview */}
        <div className="adb-card">
          <div className="adb-card-header">
            <h2 className="adb-card-title">Training Progress Overview</h2>
            <select
              className="adb-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="This Month">This Month</option>
              <option value="This Week">This Week</option>
              <option value="All Time">All Time</option>
            </select>
          </div>

          {/* Metric Strip */}
          <div className="adb-metric-strip">
            <div className="adb-metric-item">
              <div className="adb-metric-icon adb-metric-icon--green">
                <Users size={16} />
              </div>
              <div className="adb-metric-text">
                <span className="adb-metric-label">Enrollments</span>
                <span className="adb-metric-val">{totalEnrollmentsCount}</span>
                <span className="adb-metric-sub">total enrolled</span>
              </div>
            </div>

            <div className="adb-metric-item">
              <div className="adb-metric-icon adb-metric-icon--purple">
                <CheckCircle size={16} />
              </div>
              <div className="adb-metric-text">
                <span className="adb-metric-label">Completions</span>
                <span className="adb-metric-val">{completedTrainingsCount}</span>
                <span className="adb-metric-sub">programs ended</span>
              </div>
            </div>

            <div className="adb-metric-item">
              <div className="adb-metric-icon adb-metric-icon--amber">
                <Hourglass size={16} />
              </div>
              <div className="adb-metric-text">
                <span className="adb-metric-label">In Progress</span>
                <span className="adb-metric-val">{inProgressCount}</span>
                <span className="adb-metric-sub">active programs</span>
              </div>
            </div>

            <div className="adb-metric-item">
              <div className="adb-metric-icon adb-metric-icon--blue">
                <XCircle size={16} />
              </div>
              <div className="adb-metric-text">
                <span className="adb-metric-label">Not Started</span>
                <span className="adb-metric-val">{notStartedCount}</span>
                <span className="adb-metric-sub">pending</span>
              </div>
            </div>
          </div>

          {/* Progress Chart Canvas */}
          <div className="adb-chart-box">
            <Activity size={22} color="#94A3B8" />
            <div className="adb-chart-empty-title">No progress data available yet</div>
            <div className="adb-chart-empty-sub">
              Enrollment and completion trends will appear as learners progress.
            </div>
          </div>

          {/* Legend */}
          <div className="adb-legend-row">
            <span className="adb-legend-item">
              <span className="adb-legend-dot" style={{ background: '#16A34A' }} /> Enrollments
            </span>
            <span className="adb-legend-item">
              <span className="adb-legend-dot" style={{ background: '#8B5CF6' }} /> Completions
            </span>
            <span className="adb-legend-item">
              <span className="adb-legend-dot" style={{ background: '#F59E0B' }} /> In Progress
            </span>
            <span className="adb-legend-item">
              <span className="adb-legend-dot" style={{ background: '#3B82F6' }} /> Not Started
            </span>
          </div>
        </div>

        {/* Right Column: Top Training Programs */}
        <div className="adb-card">
          <div className="adb-card-header">
            <h2 className="adb-card-title">Top Training Programs</h2>
            <button
              type="button"
              className="adb-link-btn"
              onClick={onViewTrainings}
            >
              View all <ArrowRight size={13} />
            </button>
          </div>

          {topTrainings.length === 0 ? (
            <div className="adb-empty-box" style={{ flex: 1 }}>
              <BookOpen size={24} />
              <div className="adb-empty-title">No training programs yet</div>
              <div className="adb-empty-sub">Create your first training program to see it here.</div>
            </div>
          ) : (
            <div className="adb-training-list">
              {topTrainings.map((t) => {
                const createdFormatted = formatDisplayDate(t.createdAt || t.created_at || t.startDate)
                return (
                  <div key={t.id} className="adb-training-row">
                    <CourseThumbnail title={t.title} />
                    <div className="adb-training-info">
                      <div className="adb-training-title" title={t.title}>{t.title}</div>
                      <div className="adb-training-trainer">
                        Trainer: {t.trainerName || 'Unassigned'}
                      </div>
                      <div className="adb-training-meta">
                        {t.enrolledCount || 0} Participants
                      </div>
                    </div>
                    <div className="adb-training-right">
                      <span className="adb-status-pill">Published</span>
                      {createdFormatted && (
                        <span className="adb-training-date">Created: {createdFormatted}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Reports Overview (Row of 4 Cards) */}
      <div className="adb-reports-section">
        <div className="adb-reports-header">
          <h2 className="adb-reports-title">Reports Overview</h2>
          <select
            className="adb-select"
            value={reportsRange}
            onChange={(e) => setReportsRange(e.target.value)}
          >
            <option value="This Month">This Month</option>
            <option value="This Week">This Week</option>
            <option value="All Time">All Time</option>
          </select>
        </div>

        <div className="adb-reports-grid">
          {/* Card 1: Enrollments Over Time */}
          <div className="adb-report-card">
            <h3 className="adb-report-card-title">Enrollments Over Time</h3>
            <div className="adb-chart-box" style={{ flex: 1 }}>
              <Activity size={20} color="#94A3B8" />
              <div className="adb-chart-empty-title">No data available yet</div>
              <div className="adb-chart-empty-sub">Enrollment trends will appear here</div>
            </div>
            <div className="adb-legend-row" style={{ marginTop: 8 }}>
              <span className="adb-legend-item">
                <span className="adb-legend-dot" style={{ background: '#16A34A' }} /> Enrollments
              </span>
            </div>
          </div>

          {/* Card 2: Completions Over Time */}
          <div className="adb-report-card">
            <h3 className="adb-report-card-title">Completions Over Time</h3>
            <div className="adb-chart-box" style={{ flex: 1 }}>
              <Activity size={20} color="#94A3B8" />
              <div className="adb-chart-empty-title">No data available yet</div>
              <div className="adb-chart-empty-sub">Completion trends will appear here</div>
            </div>
            <div className="adb-legend-row" style={{ marginTop: 8 }}>
              <span className="adb-legend-item">
                <span className="adb-legend-dot" style={{ background: '#94A3B8' }} /> Completions
              </span>
            </div>
          </div>

          {/* Card 3: Participants by Status */}
          <div className="adb-report-card">
            <h3 className="adb-report-card-title">Participants by Status</h3>
            <DonutChart
              total={totalParticipantsCount}
              slices={participantStatusSlices}
            />
          </div>

          {/* Card 4: Trainings by Status */}
          <div className="adb-report-card">
            <h3 className="adb-report-card-title">Trainings by Status</h3>
            <DonutChart
              total={totalTrainingsCount}
              slices={trainingStatusSlices}
            />
          </div>
        </div>
      </div>

      {/* 5. Quick Actions (Row of 3 Cards) */}
      <div className="adb-actions-section">
        <h2 className="adb-actions-title">Quick Actions</h2>
        <div className="adb-actions-grid">
          <button
            type="button"
            className="adb-action-card"
            onClick={onCreateTraining}
          >
            <div className="adb-action-icon-wrap">
              <BookOpen size={20} />
            </div>
            <div className="adb-action-text">
              <span className="adb-action-name">Create Training</span>
              <span className="adb-action-desc">Add new training program</span>
            </div>
          </button>

          <button
            type="button"
            className="adb-action-card"
            onClick={onAddTrainer}
          >
            <div className="adb-action-icon-wrap">
              <UserPlus size={20} />
            </div>
            <div className="adb-action-text">
              <span className="adb-action-name">Add Trainer</span>
              <span className="adb-action-desc">Register new trainer</span>
            </div>
          </button>

          <button
            type="button"
            className="adb-action-card"
            onClick={onAddParticipant}
          >
            <div className="adb-action-icon-wrap">
              <Users size={20} />
            </div>
            <div className="adb-action-text">
              <span className="adb-action-name">Add Participant</span>
              <span className="adb-action-desc">Register new participant</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
