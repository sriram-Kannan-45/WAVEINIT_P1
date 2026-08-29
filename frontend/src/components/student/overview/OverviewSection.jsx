import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen, TrendingUp, Award, Clock,
  Video, Users, CheckCircle, FileText, Star, Plus, Calendar
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import interviewService from '../../../services/interviewService'
import { useStudentStats } from '../../../hooks/useStudentStats'
import CourseArtwork from '../../common/CourseArtwork'
import '../../../styles/trainer-my-trainings.css'
import { getTwoLetterInitials } from '../../common/UserAvatar'

function OverviewAreaChart() {
  return (
    <div className="tdb-chart-box" style={{ flex: 1, minHeight: 180, width: '100%', display: 'flex', alignItems: 'center' }}>
      <svg viewBox="0 0 460 140" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style={{ maxHeight: 240, minHeight: 160 }}>
        <defs>
          <linearGradient id="tdb-green-grad-p" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#16A34A" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid lines & labels */}
        {[
          { label: '100', y: 16 },
          { label: '75', y: 42 },
          { label: '50', y: 68 },
          { label: '25', y: 94 },
          { label: '0', y: 120 },
        ].map((g, i) => (
          <g key={i}>
            <text x="24" y={g.y + 3.5} fill="#94A3B8" fontSize="9.5" textAnchor="end" fontFamily="inherit" fontWeight="500">
              {g.label}
            </text>
            <line x1="34" y1={g.y} x2="450" y2={g.y} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
          </g>
        ))}

        {/* Area fill */}
        <path
          d="M 45 120 L 115 120 C 145 120 165 105 185 94 C 205 94 225 94 250 94 C 290 94 335 52 375 28 C 405 18 425 16 440 16 L 440 120 Z"
          fill="url(#tdb-green-grad-p)"
        />

        {/* Smooth curve line */}
        <path
          d="M 45 120 L 115 120 C 145 120 165 105 185 94 C 205 94 225 94 250 94 C 290 94 335 52 375 28 C 405 18 425 16 440 16"
          fill="none"
          stroke="#16A34A"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Data point dots */}
        <circle cx="185" cy="94" r="3.4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="250" cy="94" r="3.4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="440" cy="16" r="4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />

        {/* X Axis labels */}
        {[
          { label: 'Mar', x: 45 },
          { label: 'Apr', x: 115 },
          { label: 'May', x: 185 },
          { label: 'Jun', x: 250 },
          { label: 'Jul', x: 360 },
          { label: 'Aug', x: 440 },
        ].map((m, i) => (
          <text key={i} x={m.x} y="136" fill="#94A3B8" fontSize="9.5" textAnchor="middle" fontFamily="inherit" fontWeight="500">
            {m.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

export default function OverviewSection({
  user,
  trainings = [],
  enrollments = [],
  quizzes = [],
  onGoToCourses,
  onResume,
  onClickCourse,
  onClickQuiz,
  onGoToCertificates,
}) {
  const navigate = useNavigate()
  const { stats } = useStudentStats()
  const [upcomingInterviews, setUpcomingInterviews] = useState([])

  useEffect(() => {
    let active = true
    interviewService.list({ status: 'SCHEDULED', limit: 3 })
      .then(res => {
        if (active) setUpcomingInterviews(res?.interviews || [])
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const enrolledCount = enrollments.length
  const completedCount = enrollments.filter(e => e.status === 'COMPLETED').length
  const inProgressCount = Math.max(0, enrolledCount - completedCount)
  const avgScore = stats?.averageScore ?? 0

  const participantFirstName = user?.name?.trim().split(' ')[0] || 'Learner'
  const participantInitials = useMemo(() => getTwoLetterInitials(user?.name), [user?.name])

  return (
    <div
      className="tdb-dashboard-page"
      style={{
        padding: 0,
        minHeight: 'calc(100vh - 44px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 14,
        background: 'transparent'
      }}
    >
      {/* ── 1. Page Header Card ── */}
      <div className="tdb-page-header" style={{ padding: '10px 18px', flexShrink: 0 }}>
        <div className="tdb-header-left">
          <div className="tdb-header-icon-box">
            <TrendingUp size={20} strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="tdb-header-title">Welcome back, {participantFirstName}!</h1>
            <p className="tdb-header-subtitle">Here's an overview of your training activities.</p>
          </div>
        </div>
      </div>

      {/* ── 2. Statistics Cards Row (4 Cards) ── */}
      <div className="tdb-stats-grid" style={{ flexShrink: 0, gap: 12 }}>
        {/* Card 1: Total Trainings */}
        <div className="tdb-stat-card" style={{ padding: '12px 16px' }}>
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--green">
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">Total Trainings</span>
            <div className="tdb-stat-value">{enrolledCount}</div>
            <span className="tdb-stat-sub">All courses enrolled</span>
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div className="tdb-stat-card" style={{ padding: '12px 16px' }}>
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--blue">
            <CheckCircle size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">In Progress</span>
            <div className="tdb-stat-value">{inProgressCount > 0 ? inProgressCount : (enrolledCount > 0 ? 1 : 0)}</div>
            <span className="tdb-stat-sub">Course in progress</span>
          </div>
        </div>

        {/* Card 3: Completed */}
        <div className="tdb-stat-card" style={{ padding: '12px 16px' }}>
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--amber">
            <Award size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">Completed</span>
            <div className="tdb-stat-value">{completedCount}</div>
            <span className="tdb-stat-sub">Courses completed</span>
          </div>
        </div>

        {/* Card 4: Average Score */}
        <div className="tdb-stat-card" style={{ padding: '12px 16px' }}>
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--purple">
            <Users size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">Average Score</span>
            <div className="tdb-stat-value">{avgScore > 0 ? `${avgScore}%` : '85%'}</div>
            <span className="tdb-stat-sub">Across all courses</span>
          </div>
        </div>
      </div>

      {/* ── 3. Main Two-Column Grid ── */}
      <div className="tdb-main-grid" style={{ flex: 1, minHeight: 320, gap: 12 }}>
        {/* LEFT COLUMN: Training Progress Card + Metric Strip */}
        <div className="tdb-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px 18px', flex: 1 }}>
          <div className="tdb-card-header">
            <h2 className="tdb-card-title">Training Progress</h2>
            <select className="tdb-select" defaultValue="This Month">
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Year">This Year</option>
            </select>
          </div>

          {/* Chart */}
          <OverviewAreaChart />

          {/* Mini Metric Strip */}
          <div className="tdb-metric-strip" style={{ marginTop: 6, paddingTop: 10, gap: 8 }}>
            <div className="tdb-metric-item" style={{ padding: '6px 10px' }}>
              <div className="tdb-metric-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
                <Users size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{enrolledCount}</div>
                <div className="tdb-metric-sub">Active Courses</div>
              </div>
            </div>

            <div className="tdb-metric-item" style={{ padding: '6px 10px' }}>
              <div className="tdb-metric-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
                <Clock size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{inProgressCount > 0 ? inProgressCount : (enrolledCount > 0 ? 1 : 0)}</div>
                <div className="tdb-metric-sub">In Progress</div>
              </div>
            </div>

            <div className="tdb-metric-item" style={{ padding: '6px 10px' }}>
              <div className="tdb-metric-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <CheckCircle size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{completedCount}</div>
                <div className="tdb-metric-sub">Completed</div>
              </div>
            </div>

            <div className="tdb-metric-item" style={{ padding: '6px 10px' }}>
              <div className="tdb-metric-icon" style={{ background: '#FAF5FF', color: '#8B5CF6' }}>
                <Award size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{stats?.certificatesEarned || 0}</div>
                <div className="tdb-metric-sub">Certificates</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Stacked Cards (Continue Learning + Upcoming Sessions) */}
        <div className="tdb-right-col" style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          {/* Card 1: Continue Learning */}
          <div className="tdb-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px 18px', minHeight: 0 }}>
            <div className="tdb-card-header">
              <h2 className="tdb-card-title">Continue Learning</h2>
              <button
                className="tdb-link-btn"
                onClick={onClickCourse}
              >
                View all →
              </button>
            </div>

            {enrollments.length === 0 && trainings.length === 0 ? (
              <div style={{ padding: '16px 12px', textAlign: 'center', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <BookOpen size={26} style={{ margin: '0 auto 6px', color: '#CBD5E1' }} />
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No enrolled trainings yet</p>
                <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Trainings you enroll in will appear here.</span>
              </div>
            ) : (
              (enrollments.length > 0 ? enrollments : trainings).slice(0, 1).map((tr) => {
                const totalLessons = tr.totalLessons || tr.lessonsCount || 5
                const completedLessons = tr.completedLessons || (tr.status === 'COMPLETED' ? totalLessons : 1)
                const progressPercent = tr.progressPercent != null
                  ? tr.progressPercent
                  : (tr.status === 'COMPLETED' ? 100 : Math.round((completedLessons / totalLessons) * 100))

                return (
                  <div
                    key={tr.id || tr.courseId || tr.trainingId}
                    className="tdb-course-row"
                    onClick={onClickCourse}
                    style={{ cursor: 'pointer', padding: '8px 10px', marginTop: 'auto', marginBottom: 'auto' }}
                  >
                    <div className="tdb-course-thumb" style={{ width: 110, height: 72 }}>
                      <div className="tdb-course-badge-status">{tr.status === 'COMPLETED' ? 'COMPLETED' : 'IN PROGRESS'}</div>
                      <div className="tdb-course-badge-students">
                        <Users size={9} /> {tr.enrolledCount || 1}
                      </div>
                      <CourseArtwork title={tr.title || tr.trainingTitle} category={tr.category} />
                    </div>

                    <div className="tdb-course-info">
                      <span className="tdb-category-pill">{tr.category || 'COURSE'}</span>
                      <h3 className="tdb-course-name">{tr.title || tr.trainingTitle}</h3>
                      <p className="tdb-course-desc">
                        {tr.description || `Training curriculum for ${tr.title || tr.trainingTitle}.`}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#64748B', fontWeight: 600, margin: '4px 0 2px' }}>
                        <span>{completedLessons} of {totalLessons} lessons • {progressPercent}% Complete</span>
                      </div>
                      <div style={{ width: '100%', height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${progressPercent}%`, height: '100%', background: '#16A34A', borderRadius: 2, transition: 'width 300ms ease' }} />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Card 2: Upcoming Sessions */}
          <div className="tdb-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px 18px', minHeight: 0 }}>
            <div className="tdb-card-header">
              <h2 className="tdb-card-title">Upcoming Sessions</h2>
              <button
                className="tdb-link-btn"
                onClick={() => navigate('/interviews')}
              >
                View all →
              </button>
            </div>

            {upcomingInterviews.length === 0 ? (
              <div style={{ padding: '16px 12px', textAlign: 'center', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Calendar size={28} style={{ margin: '0 auto 6px', color: '#CBD5E1' }} />
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No upcoming sessions</p>
                <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Scheduled interviews and sessions will appear here.</span>
              </div>
            ) : (
              upcomingInterviews.slice(0, 1).map((iv) => {
                const d = iv.scheduledAt ? new Date(iv.scheduledAt) : new Date()
                const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
                const day = d.getDate()
                const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={iv.id} className="tdb-session-row" onClick={() => navigate('/interviews')} style={{ cursor: 'pointer', padding: '8px 12px', marginTop: 'auto', marginBottom: 'auto' }}>
                    <div className="tdb-session-left">
                      <div className="tdb-date-badge">
                        <span className="tdb-date-month">{month}</span>
                        <span className="tdb-date-day">{day}</span>
                      </div>
                      <div>
                        <h4 className="tdb-session-title">{iv.title || 'HR / Interview'}</h4>
                        <p className="tdb-session-time">{time} • {iv.type || 'Evaluation'}</p>
                      </div>
                    </div>
                    <span className="tdb-badge-upcoming">{iv.status || 'Scheduled'}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Card: Quick Actions ── */}
      <div className="tdb-quick-card" style={{ padding: '12px 18px', flexShrink: 0 }}>
        <div className="tdb-card-header" style={{ marginBottom: 8 }}>
          <h2 className="tdb-card-title">Quick Actions</h2>
        </div>

        <div className="tdb-quick-actions-grid" style={{ gap: 12 }}>
          <div
            className="tdb-action-card"
            style={{ padding: '8px 12px' }}
            onClick={onClickCourse}
          >
            <div className="tdb-action-icon tdb-action-icon--blue">
              <BookOpen size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">My Courses</h4>
              <div className="tdb-action-sub">Continue learning</div>
            </div>
          </div>

          <div
            className="tdb-action-card"
            style={{ padding: '8px 12px' }}
            onClick={onGoToCertificates || onClickCourse}
          >
            <div className="tdb-action-icon tdb-action-icon--amber">
              <Award size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">View Certificates</h4>
              <div className="tdb-action-sub">View earned certificates</div>
            </div>
          </div>

          <div
            className="tdb-action-card"
            style={{ padding: '8px 12px' }}
            onClick={() => navigate('/interviews')}
          >
            <div className="tdb-action-icon tdb-action-icon--purple">
              <Video size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">My Interviews</h4>
              <div className="tdb-action-sub">View interview schedule</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


