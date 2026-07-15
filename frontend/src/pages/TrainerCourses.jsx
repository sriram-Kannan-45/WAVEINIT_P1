import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Search, Plus, Pencil, Trash2,
  BookOpen, FileText, Users, BarChart3, Layers, Sparkles,
  CheckCircle2, AlertCircle, Folder, MessageSquare, Code,
  ChevronDown, ChevronRight, ChevronLeft, User, Calendar, Video, ArrowRight, Play, Eye, Star, Coffee, MoreVertical, Clock
} from 'lucide-react'
import { API, assetUrl, API_BASE } from '../api/api'
import { Button, Badge, Table, PageHeader, EmptyState, StatCard } from '../components/ui'
import { LineAreaChart } from '../components/ui/ChartWrappers'
import { getCourseThumbnail, getThumbnailSVG } from '../config/courseThumbnailMap'
import emptyCourseImg from '../assets/illustrations/empty-course.png'

import { useToast } from '../components/Toast'
import MaterialManager from '../components/trainer/MaterialManager'
import CourseQuizzesTab from '../components/trainer/CourseQuizzesTab'
import CourseParticipantsTab from '../components/trainer/CourseParticipantsTab'
import CourseAnalyticsTab from '../components/trainer/CourseAnalyticsTab'
import DiscussionBoard from '../components/shared/DiscussionBoard'
import CourseCodingTab from '../components/trainer/CourseCodingTab'
import {
  colors, btnPrimary, btnSecondary, iconBtn, STATUS_BADGE,
  lblStyle, inputStyle, th, td, typography, cardStyle, skeletonStyle
} from '../theme/tokens'

function getCourseArtwork(title, category) {
  return getCourseThumbnail(title, category)
}

function StatusBadge({ status = 'DRAFT' }) {
  const label = (status || 'DRAFT').toUpperCase()
  const isPublished = label === 'PUBLISHED'
  return (
    <span
      className="inline-flex items-center rounded-full text-[9px] font-extrabold uppercase tracking-wider"
      style={{
        padding: '4px 10px',
        background: isPublished ? '#10B981' : '#F59E0B',
        color: '#FFFFFF',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
        fontFamily: '"Plus Jakarta Sans", "SF Pro Display", sans-serif'
      }}
    >
      {label}
    </span>
  )
}

function TrainingCard({ course, artwork, onOpen, fmtTimeAgo }) {
  const thumb = artwork || getCourseThumbnail(course.title)
  const svgContent = getThumbnailSVG(thumb)
  const isDark = !thumb.dark

  return (
    <motion.div
      className="wl-training-card"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Thumbnail */}
      <div className="wl-training-card-thumb" style={{ background: thumb.gradient }}>
        <svg
          className="wl-training-card-thumb-svg"
          viewBox="0 0 400 200"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id={`glow-${course.id}`} cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor={thumb.accent} stopOpacity="0.12" />
              <stop offset="100%" stopColor={thumb.accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="200" fill="transparent" />
          <rect width="400" height="200" fill={`url(#glow-${course.id})`} />
          {svgContent}
        </svg>
        <div className="wl-training-card-thumb-overlay" />
        <div className="wl-training-card-status">
          <StatusBadge status={course.status} />
        </div>
        <div className="wl-training-card-learners-badge">
          <Users size={11} /> {course.enrolledCount || 0}
        </div>
        <div className="wl-training-card-thumb-icon" style={{ background: `${thumb.accent}22`, borderColor: `${thumb.accent}33` }}>
          <span style={{ fontSize: '18px', lineHeight: 1 }}>{thumb.icon}</span>
        </div>
      </div>

      {/* Body */}
      <div className="wl-training-card-body">
        <span className="wl-training-card-category">{thumb.label || 'General Training'}</span>
        <h3 className="wl-training-card-title" title={course.title}>{course.title}</h3>
        {course.description && (
          <p className="wl-training-card-desc">{course.description}</p>
        )}

        <div className="wl-training-card-stats">
          <span className="wl-training-card-stat">
            <FileText size={14} /> {course.lessonCount || 0} Lessons
          </span>
          <span className="wl-training-card-stat">
            <Users size={14} /> {course.enrolledCount || 0} Students
          </span>
        </div>

        <div className="wl-training-card-meta">
          <span>Updated {fmtTimeAgo(course.updatedAt || course.createdAt)}</span>
          <span>Assigned by Admin</span>
        </div>

        <div className="wl-training-card-actions">
          <button
            className="wl-training-card-btn-primary"
            onClick={(e) => { e.stopPropagation(); onOpen(course.id); }}
          >
            Open Course <ArrowRight size={14} />
          </button>
          <button
            className="wl-training-card-btn-secondary"
            onClick={(e) => { e.stopPropagation(); onOpen(course.id); }}
          >
            View Participants
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function CoursesList({ user, onOpenCourse }) {
  const { error: showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchCourses = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.TRAINER_COURSES.LIST, { headers: auth() })
      const d = await r.json()
      if (d.success) setCourses(d.courses || [])
      else showError(d.error || 'Failed to load courses')
    } catch (e) {
      showError(e.message || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCourses() }, [])

  const stats = useMemo(() => ({
    total: courses.length,
    published: courses.filter(c => c.status === 'PUBLISHED').length,
    draft: courses.filter(c => c.status === 'DRAFT').length,
    archived: courses.filter(c => c.status === 'ARCHIVED').length,
  }), [courses])

  const filtered = useMemo(() => {
    return courses.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (c.title || '').toLowerCase().includes(q) ||
               (c.description || '').toLowerCase().includes(q) ||
               (c.programTitle || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [courses, search, statusFilter])

  const recentActivity = useMemo(() =>
    [...courses]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5),
  [courses])

  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now)
      d.setMonth(d.getMonth() - (5 - i))
      return { name: months[d.getMonth()], trainings: courses.filter(c => {
        const ud = new Date(c.updatedAt || c.createdAt)
        return ud.getMonth() === d.getMonth() && ud.getFullYear() === d.getFullYear()
      }).length }
    })
  }, [courses])

  const fmtTimeAgo = (d) => {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const statCards = [
    { label: 'Total Trainings', value: stats.total, icon: BookOpen, variant: 'blue' },
    { label: 'Published', value: stats.published, icon: CheckCircle2, variant: 'emerald' },
    { label: 'Drafts', value: stats.draft, icon: FileText, variant: 'amber' },
    { label: 'Archived', value: stats.archived, icon: Folder, variant: 'violet' },
  ]

  return (
    <div className="wl-training-page">
      {/* ── Page Header ── */}
      <div className="wl-training-header">
        <div className="wl-training-header-text">
          <h1>My Trainings</h1>
          <p>Manage your assigned courses efficiently.</p>
        </div>
        <div className="wl-training-header-illustration">
          <BookOpen size={36} />
        </div>
      </div>

      {/* ── Statistics Row ── */}
      <div className="wl-training-stats">
        {statCards.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} variant={s.variant} />
        ))}
      </div>

      {/* ── Search + Filter Toolbar ── */}
      <div className="wl-training-toolbar">
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 420 }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses..."
            style={{
              height: 42, width: '100%', borderRadius: 12, paddingLeft: 42, paddingRight: 14,
              fontSize: 14, background: '#f9fafb', border: '1px solid #f3f4f6',
              outline: 'none', fontFamily: 'var(--font-primary)', boxSizing: 'border-box',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            className="focus:!border-[#16a34a] focus:!shadow-[0_0_0_3px_rgba(22,163,74,0.1)]"
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'].map((opt) => {
            const isActive = statusFilter === opt
            const labelMap = { ALL: 'All', DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' }
            return (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                style={{
                  height: 36, padding: '0 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? '#16a34a' : '#ffffff',
                  color: isActive ? '#ffffff' : '#6b7280',
                  border: `1px solid ${isActive ? '#16a34a' : '#e5e7eb'}`,
                  transition: 'all 150ms ease',
                  fontFamily: 'var(--font-primary)', outline: 'none',
                }}
              >
                {labelMap[opt]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main Content: Grid + Sidebar ── */}
      <div className="wl-training-main">
        {/* Left: Course Grid */}
        <div>
          {loading ? (
            <div className="wl-training-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="wl-training-skeleton">
                  <div className="wl-training-skeleton-thumb" />
                  <div className="wl-training-skeleton-body">
                    <div className="wl-training-skeleton-line wl-training-skeleton-line--short" />
                    <div className="wl-training-skeleton-line wl-training-skeleton-line--long" />
                    <div className="wl-training-skeleton-line wl-training-skeleton-line--medium" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="wl-training-empty">
              <BookOpen size={48} />
              <h3>{courses.length === 0 ? 'No courses assigned yet' : 'No courses match your filters'}</h3>
              <p>{courses.length === 0
                ? 'Ask your admin to assign you to a course under a Training Program.'
                : 'Try adjusting your search or status filter.'}</p>
            </div>
          ) : (
            <>
              <div className="wl-training-grid">
                {filtered.map((c) => (
                  <TrainingCard
                    key={c.id}
                    course={c}
                    artwork={getCourseArtwork(c.title)}
                    onOpen={onOpenCourse}
                    fmtTimeAgo={fmtTimeAgo}
                  />
                ))}
              </div>
              <div style={{ marginTop: 20, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
                Showing {filtered.length} of {courses.length} courses
              </div>
            </>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="wl-training-sidebar">
          {/* Training Overview Chart */}
          <div className="wl-dash-card">
            <div className="wl-dash-card-header">
              <div>
                <h3 className="wl-dash-card-title">Training Overview</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Course updates over time</p>
              </div>
            </div>
            <div className="wl-chart-container">
              <LineAreaChart
                data={chartData}
                xKey="name"
                yKey="trainings"
                height={180}
                strokeColor="#16a34a"
                fillColorStart="#86efac"
                fillColorEnd="#f0fdf4"
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Recent Activity</h3>
            </div>
            <div className="wl-dash-card-body">
              {recentActivity.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>No activity yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {recentActivity.map((c, i) => (
                    <div key={c.id || i} className="wl-activity-item">
                      <div className="wl-activity-dot" style={{
                        background: c.status === 'PUBLISHED' ? '#16a34a' : c.status === 'DRAFT' ? '#f59e0b' : '#94a3b8',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="wl-activity-text" style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.title}
                        </div>
                        <div className="wl-activity-time">
                          {c.status === 'PUBLISHED' ? 'Published' : c.status === 'DRAFT' ? 'Updated' : c.status?.toLowerCase() || 'updated'} {fmtTimeAgo(c.updatedAt || c.createdAt)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                        background: c.status === 'PUBLISHED' ? '#f0fdf4' : c.status === 'DRAFT' ? '#fffbeb' : '#f5f5f4',
                        color: c.status === 'PUBLISHED' ? '#16a34a' : c.status === 'DRAFT' ? '#d97706' : '#78716c',
                        flexShrink: 0,
                      }}>
                        {c.status || 'Draft'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CourseDetail({ user, courseId, onBack }) {
  const { error: showError, success } = useToast()
  const [tab, setTab] = useState('structure')
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchCourse = async () => {
    try {
      const r = await fetch(API.TRAINER_COURSES.DETAIL(courseId), { headers: auth() })
      const d = await r.json()
      if (d.success) setCourse(d.course)
      else showError(d.error || 'Failed to load course')
    } catch (e) {
      showError(e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchCourse() }, [courseId])

  if (loading) {
    return (
      <div className="wl-detail-page">
        <div className="wl-detail-loading-row">
          <div className="skeleton" style={{ height: 24, width: 100 }} />
          <div className="skeleton" style={{ height: 24, width: 120 }} />
        </div>
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 36, borderRadius: 8, marginTop: 8 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 12, marginTop: 8 }} />
      </div>
    )
  }
  if (!course) return null

  const artwork = getCourseArtwork(course.title)
  const svgContent = getThumbnailSVG(artwork)

  const TABS = [
    { key: 'structure',    label: 'Structure',    icon: <Layers size={13} /> },
    { key: 'lessons',      label: 'Lessons',      icon: <FileText size={13} /> },
    { key: 'quizzes',      label: 'AI Quiz',      icon: <Sparkles size={13} /> },
    { key: 'coding',       label: 'Coding',       icon: <Code size={13} /> },
    { key: 'participants', label: 'Participants', icon: <Users size={13} /> },
    { key: 'analytics',    label: 'Analytics',    icon: <BarChart3 size={13} /> },
    { key: 'discussions',  label: 'Discussions',  icon: <MessageSquare size={13} /> },
  ]

  const statusClass = course.status === 'PUBLISHED' ? 'published' : course.status === 'ARCHIVED' ? 'archived' : 'draft'

  const recentActivity = [
    { text: 'Course created', time: course.createdAt, color: '#dbeafe', icon: <BookOpen size={11} />, iconColor: '#2563eb' },
    { text: 'Course updated', time: course.updatedAt, color: '#dcfce7', icon: <Pencil size={11} />, iconColor: '#16a34a' },
    { text: `${course.enrolledCount || 0} students enrolled`, time: course.updatedAt, color: '#f3e8ff', icon: <Users size={11} />, iconColor: '#9333ea' },
  ].filter(a => a.time)

  const heroStats = [
    { icon: FileText, label: 'Lessons', value: course.lessonCount || 0, bg: '#f0fdfa', color: '#0d9488' },
    { icon: Sparkles, label: 'Quizzes', value: course.quizCount || 0, bg: '#fffbeb', color: '#d97706' },
    { icon: Users, label: 'Students', value: course.enrolledCount || 0, bg: '#f0fdf4', color: '#16a34a' },
    { icon: Code, label: 'Coding', value: course.codingCount || 0, bg: '#eff6ff', color: '#2563eb' },
  ]

  const overviewRows = [
    { label: 'Status', value: course.status, icon: <CheckCircle2 size={11} /> },
    { label: 'Category', value: course.programTitle || 'General', icon: <Folder size={11} /> },
    { label: 'Level', value: course.level || 'Intermediate', icon: <BarChart3 size={11} /> },
    { label: 'Duration', value: course.duration || 'Self-paced', icon: <Clock size={11} /> },
    { label: 'Created', value: course.createdAt ? new Date(course.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', icon: <Calendar size={11} /> },
    { label: 'Updated', value: course.updatedAt ? new Date(course.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', icon: <Calendar size={11} /> },
  ]

  return (
    <div className="wl-detail-page">
      {/* ── Top Row: Breadcrumb + Back ── */}
      <motion.div
        className="wl-detail-top-row"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <nav className="wl-detail-breadcrumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack() }}>My Courses</a>
          <span className="wl-detail-breadcrumb-sep">/</span>
          <span>{course.title}</span>
        </nav>
        <button className="wl-detail-back" onClick={onBack}>
          <ArrowLeft size={12} /> Back
        </button>
      </motion.div>

      {/* ── Hero Card ── */}
      <motion.div
        className="wl-detail-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left: Thumbnail */}
        <div className="wl-detail-hero-thumb" style={{ background: artwork.gradient }}>
          <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id={`dg-${courseId}`} cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor={artwork.accent} stopOpacity="0.12" />
                <stop offset="100%" stopColor={artwork.accent} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="200" fill="transparent" />
            <rect width="400" height="200" fill={`url(#dg-${courseId})`} />
            {svgContent}
          </svg>
          <div className="wl-detail-hero-thumb-overlay" />
          {course.status && (
            <div className="wl-detail-hero-status">
              <span className={`wl-detail-status-badge wl-detail-status-badge--${statusClass}`}>
                {course.status}
              </span>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="wl-detail-hero-info">
          <div className="wl-detail-hero-top">
            <div className="wl-detail-hero-text">
              <h1 className="wl-detail-hero-title">{course.title}</h1>
              <div className="wl-detail-hero-category">
                <Folder size={11} />
                {course.programTitle || artwork.label || 'General Training'}
              </div>
            </div>
            <button className="wl-detail-hero-more-btn">
              <MoreVertical size={14} />
            </button>
          </div>

          <p className="wl-detail-hero-desc">
            {course.description || 'No description provided.'}
          </p>

          {/* Stats */}
          <div className="wl-detail-hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="wl-detail-hero-stat">
                <div className="wl-detail-hero-stat-icon" style={{ background: stat.bg, color: stat.color }}>
                  <stat.icon size={14} />
                </div>
                <div className="wl-detail-hero-stat-text">
                  <span className="wl-detail-hero-stat-value">{stat.value}</span>
                  <span className="wl-detail-hero-stat-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Tab Navigation ── */}
      <motion.div
        className="wl-detail-tabs"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
      >
        <div className="wl-detail-tabs-list">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`wl-detail-tab ${tab === t.key ? 'wl-detail-tab--active' : ''}`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          className="wl-detail-content-wrapper"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === 'structure' && (
            <div className="wl-detail-content">
              {/* Left: Structure */}
              <div className="wl-detail-structure-card">
                <div className="wl-detail-structure-header">
                  <div className="wl-detail-structure-header-left">
                    <h2 className="wl-detail-structure-title">Course Structure</h2>
                    <span className="wl-detail-structure-badge">
                      <span className="wl-detail-structure-badge-dot" />
                      Module
                    </span>
                  </div>
                  <div className="wl-detail-structure-header-right">
                    <div className="wl-detail-toggle">
                      <button className="wl-detail-toggle-btn wl-detail-toggle-btn--active" title="Grid view">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                      </button>
                      <button className="wl-detail-toggle-btn" title="List view">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                      </button>
                    </div>
                    <button className="wl-training-card-btn-primary" style={{ fontSize: 11, padding: '5px 10px', minHeight: 'auto' }}>
                      <Plus size={12} /> Add Module
                    </button>
                  </div>
                </div>
                <div className="wl-detail-structure-empty">
                  <div className="wl-detail-structure-empty-bg" />
                  <div className="wl-detail-structure-empty-badge">
                    Ready to Build
                  </div>
                  <img
                    src={emptyCourseImg}
                    alt="No modules yet"
                    className="wl-detail-structure-empty-illustration"
                    loading="lazy"
                  />
                  <h3 className="wl-detail-structure-empty-title">No modules added yet</h3>
                  <p className="wl-detail-structure-empty-desc">
                    Start building your course by creating your first learning module.
                  </p>
                  <button className="wl-detail-structure-empty-btn">
                    <Plus size={13} /> Add Your First Module
                  </button>
                </div>
              </div>

              {/* Right: Sidebar */}
              <div className="wl-detail-sidebar">
                {/* Overview Card */}
                <div className="wl-detail-card">
                  <div className="wl-detail-card-header">
                    <h2 className="wl-detail-card-title">Course Overview</h2>
                  </div>
                  <div className="wl-detail-card-body">
                    {overviewRows.map((row) => (
                      <div key={row.label} className="wl-detail-overview-row">
                        <span className="wl-detail-overview-label">
                          <span style={{ color: '#9ca3af' }}>{row.icon}</span>
                          {row.label}
                        </span>
                        <span className="wl-detail-overview-value">{row.value || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity Card */}
                {recentActivity.length > 0 && (
                  <div className="wl-detail-card">
                    <div className="wl-detail-card-header">
                      <h2 className="wl-detail-card-title">Recent Activity</h2>
                    </div>
                    <div className="wl-detail-card-body">
                      <div className="wl-detail-activity-list">
                        {recentActivity.map((a, i) => (
                          <div key={i} className="wl-detail-activity-item">
                            <div className="wl-detail-activity-dot" style={{ background: a.color, color: a.iconColor }}>
                              {a.icon}
                            </div>
                            <div>
                              <div className="wl-detail-activity-text">{a.text}</div>
                              <div className="wl-detail-activity-time">
                                {a.time ? new Date(a.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'lessons' && <LessonsTab user={user} courseId={courseId} onCountChange={fetchCourse} setParentTab={setTab} />}
          {tab === 'quizzes' && <CourseQuizzesTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'coding' && <CourseCodingTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'participants' && <CourseParticipantsTab user={user} courseId={courseId} />}
          {tab === 'analytics' && <CourseAnalyticsTab user={user} courseId={courseId} />}
          {tab === 'discussions' && <DiscussionBoard user={user} trainingId={course.trainingProgramId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StructureTab({ course }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Course Structure</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
              background: '#f0fdfa', color: '#0D9488'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0D9488' }} />
              Module
            </span>
          </div>
        </div>
      </div>

      <div style={{
        padding: '60px 24px', textAlign: 'center',
        background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12,
      }}>
        <BookOpen size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontWeight: 700, fontSize: 16 }}>No structure yet</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
          Course content will appear here once the admin adds it.
        </p>
      </div>
    </div>
  )
}

function PlaceholderTab({ title, subtitle, icon }) {
  return (
    <div style={{
      padding: '60px 24px', textAlign: 'center', background: colors.surface.primary,
      border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
    }}>
      <div style={{ color: colors.slate[300], marginBottom: 16, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px', color: colors.slate[600] }}>{title}</h3>
      <p style={{ margin: 0, color: colors.slate[400], fontSize: 14 }}>{subtitle}</p>
    </div>
  )
}
function getTaxonomyInfo(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('sub module') || t.includes('sub-module') || t.includes('submodule')) {
    return { label: 'Sub Module', bg: '#f0fdfa', fg: '#0D9488' };
  }
  if (t.includes('sub topic') || t.includes('sub-topic') || t.includes('subtopic')) {
    return { label: 'Sub Topic', bg: '#fffbeb', fg: '#d97706' };
  }
  if (t.includes('topic')) {
    return { label: 'Topic', bg: '#f0fdf4', fg: '#16a34a' };
  }
  return { label: 'Module', bg: '#f0fdfa', fg: '#0D9488' };
}

function LessonsTab({ user, courseId, onCountChange, setParentTab }) {
  const { success, error: showError, info } = useToast()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', content: '' })
  const [materialsFor, setMaterialsFor] = useState(null)
  const [expandedRows, setExpandedRows] = useState({})
  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchLessons = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.TRAINER_COURSES.LESSONS(courseId), { headers: auth() })
      const d = await r.json()
      if (d.success) {
        setLessons(d.lessons || [])
        if (d.lessons && d.lessons.length > 0) {
          setExpandedRows({ [d.lessons[0].id]: true });
        }
      }
      else showError(d.error || 'Failed to load lessons')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchLessons() }, [courseId])

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const handleRedirect = (targetTab, message) => {
    info(message);
    if (setParentTab) setParentTab(targetTab);
  }

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', content: '' }); setShowModal(true) }
  const openEdit = (l) => { setEditing(l); setForm({ title: l.title || '', description: l.description || '', content: l.content || '' }); setShowModal(true) }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { showError('Title is required'); return }
    try {
      const url = editing
        ? API.TRAINER_COURSES.LESSON(courseId, editing.id)
        : API.TRAINER_COURSES.LESSONS(courseId)
      const r = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Save failed'); return }
      success(editing ? 'Lesson updated' : 'Lesson created')
      setShowModal(false)
      await fetchLessons()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  const remove = async (l) => {
    if (!window.confirm(`Delete lesson "${l.title}"? This cannot be undone.`)) return
    try {
      const r = await fetch(API.TRAINER_COURSES.LESSON(courseId, l.id), {
        method: 'DELETE', headers: auth(),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Delete failed'); return }
      success('Lesson deleted')
      await fetchLessons()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Learning Content</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Module', bg: '#f0fdfa', fg: '#0D9488' },
              { label: 'Sub Module', bg: '#f0fdfa', fg: '#0D9488' },
              { label: 'Topic', bg: '#f0fdf4', fg: '#16a34a' },
              { label: 'Sub Topic', bg: '#fffbeb', fg: '#d97706' },
            ].map(pill => (
              <span key={pill.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                background: pill.bg, color: pill.fg
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: pill.fg }} />
                {pill.label}
              </span>
            ))}
          </div>
        </div>
        <button onClick={openCreate} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#0D9488', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.2)'
        }}>
          <Plus size={14} /> Add Module
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 64, background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }} />
          ))}
        </div>
      ) : lessons.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12,
        }}>
          <Layers size={40} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: '0 0 6px', color: '#475569', fontWeight: 600 }}>No materials added yet.</p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            Click <strong>Add Module</strong> to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lessons.map((l, i) => {
            const tax = getTaxonomyInfo(l.title);
            const isExpanded = !!expandedRows[l.id];
            const matCount = Object.values(l.materialCounts || {}).reduce((a, b) => a + b, 0);

            return (
              <div 
                key={l.id} 
                style={{ 
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, 
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)', overflow: 'hidden' 
                }}
              >
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  padding: '14px 16px', background: '#f8fafc', borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <button 
                      onClick={() => toggleRow(l.id)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: '#64748b' }}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span style={{
                      display: 'inline-flex', padding: '2px 8px', borderRadius: 9999,
                      fontSize: 10, fontWeight: 700, background: tax.bg, color: tax.fg,
                      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0
                    }}>
                      {tax.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button 
                      title="Edit" 
                      onClick={() => openEdit(l)} 
                      style={{
                        width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6,
                        background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button 
                      title="Delete" 
                      onClick={() => remove(l)} 
                      style={{
                        width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6,
                        background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {l.description && (
                      <p style={{ fontSize: 13, color: '#64748b', margin: 0, paddingBottom: 4 }}>
                        {l.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Folder size={16} style={{ color: '#0D9488' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          Learning Materials ({matCount})
                        </span>
                        {matCount === 0 && (
                          <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginLeft: 4 }}>
                            No materials added yet.
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => setMaterialsFor({ id: l.id, title: l.title })}
                        style={{
                          padding: '6px 12px', background: '#0D9488', color: '#fff', border: 'none',
                          borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        + Add/Manage Materials
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={16} style={{ color: '#f59e0b' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          AI Quiz
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          onClick={() => handleRedirect('quizzes', 'Redirecting to AI Quiz to create quiz...')}
                          style={{
                            padding: '5px 10px', background: '#fff', border: '1px solid #0D9488', color: '#0D9488',
                            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          + Create Quiz
                        </button>
                        <button 
                          onClick={() => handleRedirect('quizzes', 'Redirecting to AI Quiz to link quiz...')}
                          style={{
                            padding: '5px 10px', background: '#fff', border: '1px solid #16a34a', color: '#16a34a',
                            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Link Quiz
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Code size={16} style={{ color: '#0D9488' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          Coding Assessment
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          onClick={() => handleRedirect('coding', 'Redirecting to Coding tab to create assessment...')}
                          style={{
                            padding: '5px 10px', background: '#fff', border: '1px solid #0D9488', color: '#0D9488',
                            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          + Create Coding
                        </button>
                        <button 
                          onClick={() => handleRedirect('coding', 'Redirecting to Coding tab to link assessment...')}
                          style={{
                            padding: '5px 10px', background: '#fff', border: '1px solid #16a34a', color: '#16a34a',
                            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Link Coding
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
            }}
          >
            <motion.form
              onClick={(e) => e.stopPropagation()}
              onSubmit={submit}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 540,
                boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
              }}
            >
              <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {editing ? 'Edit Lesson / Module' : 'Create New Module'}
              </h2>

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Title <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Module 1: Introduction to Machine Learning"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', marginBottom: 14 }}
                autoFocus
              />

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief summary of the module content"
                rows={2}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', resize: 'vertical', marginBottom: 14 }}
              />

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Summary / Content (optional)</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Optional text details shown when viewing lesson content"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', resize: 'vertical', marginBottom: 18 }}
              />

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 18px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '10px 18px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {editing ? 'Save Changes' : 'Create Module'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <MaterialManager
        user={user}
        lessonId={materialsFor?.id}
        lessonTitle={materialsFor?.title}
        open={!!materialsFor}
        onClose={() => setMaterialsFor(null)}
        onSaved={() => fetchLessons()}
      />
    </div>
  )
}

export default function TrainerCourses({ user }) {
  const [openCourseId, setOpenCourseId] = useState(null)

  if (openCourseId) {
    return (
      <CourseDetail
        user={user}
        courseId={openCourseId}
        onBack={() => setOpenCourseId(null)}
      />
    )
  }
  return <CoursesList user={user} onOpenCourse={setOpenCourseId} />
}

export { CoursesList, CourseDetail, LessonsTab, PlaceholderTab }
