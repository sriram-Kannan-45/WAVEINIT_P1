import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, TrendingUp, Award, Clock, ArrowRight, Sparkles, BarChart3,
  ChevronRight, Trophy, Target, Video, Users, CheckCircle, FileText,
  Star, Plus, Calendar
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import interviewService from '../../../services/interviewService'
import { useStudentStats } from '../../../hooks/useStudentStats'
import { useContinueLearning } from '../../../hooks/useContinueLearning'
import CourseArtwork from '../../common/CourseArtwork'
import '../../../styles/trainer-my-trainings.css'
import { getTwoLetterInitials } from '../../common/UserAvatar'

function OverviewAreaChart() {
  return (
    <div className="tdb-chart-box">
      <svg viewBox="0 0 460 120" width="100%" height="120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tdb-green-grad-p" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#16A34A" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid lines & labels */}
        {[
          { label: '100', y: 16 },
          { label: '75', y: 38 },
          { label: '50', y: 60 },
          { label: '25', y: 82 },
          { label: '0', y: 104 },
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
          d="M 45 104 L 115 104 C 145 104 165 92 185 82 C 205 82 225 82 250 82 C 290 82 335 48 375 28 C 405 18 425 16 440 16 L 440 104 Z"
          fill="url(#tdb-green-grad-p)"
        />

        {/* Smooth curve line */}
        <path
          d="M 45 104 L 115 104 C 145 104 165 92 185 82 C 205 82 225 82 250 82 C 290 82 335 48 375 28 C 405 18 425 16 440 16"
          fill="none"
          stroke="#16A34A"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Data point dots */}
        <circle cx="185" cy="82" r="3.2" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="250" cy="82" r="3.2" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="440" cy="16" r="3.8" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />

        {/* X Axis labels */}
        {[
          { label: 'Mar', x: 45 },
          { label: 'Apr', x: 115 },
          { label: 'May', x: 185 },
          { label: 'Jun', x: 250 },
          { label: 'Jul', x: 360 },
          { label: 'Aug', x: 440 },
        ].map((m, i) => (
          <text key={i} x={m.x} y="118" fill="#94A3B8" fontSize="9.5" textAnchor="middle" fontFamily="inherit" fontWeight="500">
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
}) {
  const navigate = useNavigate()
  const { stats, loading } = useStudentStats()
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

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active'

  return (
    <div className="tdb-dashboard-page" style={{ padding: 0, height: 'auto', background: 'transparent' }}>
      {/* ── 1. Page Header Card ── */}
      <div className="tdb-page-header">
        <div className="tdb-header-left">
          <div className="tdb-header-icon-box">
            <TrendingUp size={20} strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="tdb-header-title">Welcome back, {participantFirstName}!</h1>
            <p className="tdb-header-subtitle">Here's an overview of your training activities.</p>
          </div>
        </div>

        <button
          className="tdb-create-btn"
          onClick={onGoToCourses}
        >
          <Plus size={15} strokeWidth={2.5} /> Explore Courses
        </button>
      </div>

      {/* ── 2. Statistics Cards Row (4 Cards) ── */}
      <div className="tdb-stats-grid">
        {/* Card 1: Total Trainings */}
        <div className="tdb-stat-card">
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--green">
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">Total Trainings</span>
            <div className="tdb-stat-value">{enrolledCount}</div>
            <span className="tdb-stat-sub">All courses enrolled</span>
          </div>
        </div>

        {/* Card 2: Published / Active */}
        <div className="tdb-stat-card">
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--blue">
            <CheckCircle size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">Published</span>
            <div className="tdb-stat-value">{inProgressCount > 0 ? inProgressCount : enrolledCount}</div>
            <span className="tdb-stat-sub">Courses live</span>
          </div>
        </div>

        {/* Card 3: Drafts / In progress */}
        <div className="tdb-stat-card">
          <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--amber">
            <Clock size={18} strokeWidth={2} />
          </div>
          <div className="tdb-stat-text-wrap">
            <span className="tdb-stat-label">In Progress</span>
            <div className="tdb-stat-value">{inProgressCount}</div>
            <span className="tdb-stat-sub">In progress</span>
          </div>
        </div>

        {/* Card 4: Total Students / Score */}
        <div className="tdb-stat-card">
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
      <div className="tdb-main-grid">
        {/* LEFT COLUMN: Training Overview Card + Metric Strip */}
        <div className="tdb-card">
          <div className="tdb-card-header">
            <h2 className="tdb-card-title">Training Overview</h2>
            <select className="tdb-select" defaultValue="This Month">
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Year">This Year</option>
            </select>
          </div>

          {/* Chart */}
          <OverviewAreaChart />

          {/* Mini Metric Strip */}
          <div className="tdb-metric-strip">
            <div className="tdb-metric-item">
              <div className="tdb-metric-icon" style={{ background: '#EAF8F0', color: '#16A34A' }}>
                <Users size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{enrolledCount}</div>
                <div className="tdb-metric-sub">Active Students</div>
              </div>
            </div>

            <div className="tdb-metric-item">
              <div className="tdb-metric-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
                <BookOpen size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{enrolledCount}</div>
                <div className="tdb-metric-sub">Assigned Courses</div>
              </div>
            </div>

            <div className="tdb-metric-item">
              <div className="tdb-metric-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <FileText size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{quizzes.length}</div>
                <div className="tdb-metric-sub">Feedback Reviews</div>
              </div>
            </div>

            <div className="tdb-metric-item">
              <div className="tdb-metric-icon" style={{ background: '#FAF5FF', color: '#8B5CF6' }}>
                <Star size={14} strokeWidth={2.2} />
              </div>
              <div>
                <div className="tdb-metric-val">{upcomingInterviews.length}</div>
                <div className="tdb-metric-sub">Interviews</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Stacked Cards (Recent Trainings + Upcoming Sessions) */}
        <div className="tdb-right-col">
          {/* Card 1: Recent Trainings */}
          <div className="tdb-card" style={{ flex: 1.1 }}>
            <div className="tdb-card-header">
              <h2 className="tdb-card-title">Recent Trainings</h2>
              <button
                className="tdb-link-btn"
                onClick={onClickCourse}
              >
                View all →
              </button>
            </div>

            {enrollments.length === 0 && trainings.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                <BookOpen size={30} style={{ margin: '0 auto 8px', color: '#CBD5E1' }} />
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No enrolled trainings yet</p>
                <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Trainings you enroll in will appear here.</span>
              </div>
            ) : (
              (enrollments.length > 0 ? enrollments : trainings).slice(0, 2).map((tr) => (
                <div
                  key={tr.id || tr.courseId || tr.trainingId}
                  className="tdb-course-row"
                  onClick={onClickCourse}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="tdb-course-thumb">
                    <div className="tdb-course-badge-status">{tr.status || 'PUBLISHED'}</div>
                    <div className="tdb-course-badge-students">
                      <Users size={9} /> {tr.enrolledCount || 1}
                    </div>
                    <CourseArtwork title={tr.title || tr.trainingTitle} category={tr.category} />
                  </div>

                  <div className="tdb-course-info">
                    <span className="tdb-category-pill">{tr.category || tr.programTitle || 'TRAINING'}</span>
                    <h3 className="tdb-course-name">{tr.title || tr.trainingTitle}</h3>
                    <p className="tdb-course-desc">
                      {tr.description || `Training curriculum for ${tr.title || tr.trainingTitle}.`}
                    </p>
                    <div className="tdb-course-meta">
                      <span>{tr.capacity ? `${tr.capacity} Max Seats` : '3 Max Seats'}</span>
                      <span>|</span>
                      <span>{tr.enrolledCount || 1} Students</span>
                    </div>
                    <div className="tdb-course-footer-row">
                      <div className="tdb-author-avatar">{participantInitials}</div>
                      <span>{tr.startDate || tr.createdAt ? fmtDate(tr.startDate || tr.createdAt) : 'Aug 14, 2026'}</span>
                      <span>•</span>
                      <span>Assigned by Admin</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Card 2: Upcoming Sessions */}
          <div className="tdb-card" style={{ flex: 0.9 }}>
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
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                <Calendar size={30} style={{ margin: '0 auto 8px', color: '#CBD5E1' }} />
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No upcoming sessions</p>
                <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Scheduled interviews and sessions will appear here.</span>
              </div>
            ) : (
              upcomingInterviews.slice(0, 2).map((iv) => {
                const d = iv.scheduledAt ? new Date(iv.scheduledAt) : new Date()
                const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
                const day = d.getDate()
                const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={iv.id} className="tdb-session-row" onClick={() => navigate('/interviews')} style={{ cursor: 'pointer' }}>
                    <div className="tdb-session-left">
                      <div className="tdb-date-badge">
                        <span className="tdb-date-month">{month}</span>
                        <span className="tdb-date-day">{day}</span>
                      </div>
                      <div>
                        <h4 className="tdb-session-title">{iv.title || iv.trainerName || 'Interview Session'}</h4>
                        <p className="tdb-session-time">{time} • {iv.role || 'Evaluation'}</p>
                      </div>
                    </div>
                    <span className="tdb-badge-upcoming">{iv.status || 'Upcoming'}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Card: Quick Actions ── */}
      <div className="tdb-quick-card">
        <div className="tdb-card-header" style={{ marginBottom: 6 }}>
          <h2 className="tdb-card-title">Quick Actions</h2>
        </div>

        <div className="tdb-quick-actions-grid">
          <div
            className="tdb-action-card"
            onClick={onGoToCourses}
          >
            <div className="tdb-action-icon tdb-action-icon--green">
              <Plus size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">Create Course</h4>
              <div className="tdb-action-sub">Start a new training</div>
            </div>
          </div>

          <div
            className="tdb-action-card"
            onClick={onClickCourse}
          >
            <div className="tdb-action-icon tdb-action-icon--blue">
              <BookOpen size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">My Trainings</h4>
              <div className="tdb-action-sub">View assigned courses</div>
            </div>
          </div>

          <div
            className="tdb-action-card"
            onClick={onClickCourse}
          >
            <div className="tdb-action-icon tdb-action-icon--amber">
              <TrendingUp size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">View Reports</h4>
              <div className="tdb-action-sub">Track performance</div>
            </div>
          </div>

          <div
            className="tdb-action-card"
            onClick={onClickQuiz}
          >
            <div className="tdb-action-icon tdb-action-icon--purple">
              <FileText size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h4 className="tdb-action-title">Bulk Import</h4>
              <div className="tdb-action-sub">Import multiple courses</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
