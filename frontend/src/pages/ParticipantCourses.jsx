import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, BookOpen, FileText, Sparkles, ClipboardList, Folder,
  PlayCircle, CheckCircle2, Clock, ExternalLink, Send, X, Eye,
  Image as ImageIcon, Video, Link as LinkIcon, FilePenLine, Presentation,
  Trophy, AlertCircle, User, Lock, MessageSquare, Code,
  BarChart3, Award, Star, ChevronRight, GraduationCap, Plus, Search, MoreHorizontal, MoreVertical, Layers, Users,
} from 'lucide-react'
import { API, assetUrl, API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import DiscussionBoard from '../components/shared/DiscussionBoard'
import { Button, Badge, Table, PageHeader, EmptyState, StatCard, ProgressBar } from '../components/ui'
import { getCourseThumbnail, getThumbnailSVG } from '../config/courseThumbnailMap'
import CourseArtwork from '../components/common/CourseArtwork'
import '../styles/trainer-my-trainings.css'

function timeAgo(dateString) {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Recently'
  const diffInSeconds = Math.floor((new Date() - date) / 1000)
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
const auth = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })

function getCourseArtwork(title, category) {
  return getCourseThumbnail(title, category)
}

function StatusPill({ status }) {
  const label = status === 'NOT_STARTED' ? 'Not started' : status === 'IN_PROGRESS' ? 'In progress' : status === 'LOCKED' ? 'Locked' : 'Completed';
  const cls = status === 'COMPLETED' ? 'wl-detail-status-badge wl-detail-status-badge--published'
    : status === 'IN_PROGRESS' ? 'wl-detail-status-badge wl-detail-status-badge--draft'
    : 'wl-detail-status-badge wl-detail-status-badge--archived';
  return <span className={cls} style={{ fontSize: 9 }}>{label}</span>;
}

const MAT_ICON = {
  NOTE:  <FilePenLine size={14} />,
  PDF:   <FileText size={14} />,
  PPT:   <Presentation size={14} />,
  VIDEO: <Video size={14} />,
  IMAGE: <ImageIcon size={14} />,
  LINK:  <LinkIcon size={14} />,
}

// ════════════════════════════════════════════════════════════════════════════
// MY COURSES LIST
// ════════════════════════════════════════════════════════════════════════════
function MyCoursesList({ user, onOpen }) {
  const { error: showError } = useToast()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('newest')

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        setLoading(true)
        const r = await fetch(API.PARTICIPANT_COURSES.LIST, { headers: auth(user.token) })
        const d = await r.json()
        if (!aborted) {
          if (d.success) setCourses(d.courses || [])
          else showError(d.error || 'Failed to load courses')
        }
      } catch (e) { if (!aborted) showError(e.message) }
      finally { if (!aborted) setLoading(false) }
    })()
    return () => { aborted = true }
  }, [])

  const activeCourses = useMemo(() => courses || [], [courses])

  const stats = useMemo(() => ({
    total: activeCourses.length,
    published: activeCourses.filter(c => (c.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED').length,
    draft: activeCourses.filter(c => (c.status || '').toUpperCase() === 'DRAFT').length,
    archived: activeCourses.filter(c => (c.status || '').toUpperCase() === 'ARCHIVED').length,
  }), [activeCourses])

  const filtered = useMemo(() => {
    let list = activeCourses.filter(c => {
      if (statusFilter !== 'ALL' && (c.status || 'PUBLISHED').toUpperCase() !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (c.title || '').toLowerCase().includes(q) ||
               (c.description || '').toLowerCase().includes(q)
      }
      return true
    })

    if (sortBy === 'newest') {
      list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    } else if (sortBy === 'title') {
      list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }

    return list
  }, [activeCourses, search, statusFilter, sortBy])

  return (
    <div className="tmt-container" style={{ padding: 0, height: 'auto', background: 'transparent' }}>
      {/* ── 1. Page Header Card ── */}
      <div className="tmt-page-header">
        <div className="tmt-header-left">
          <div className="tmt-header-icon-box">
            <GraduationCap size={20} strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="tmt-header-title">My Trainings</h1>
            <p className="tmt-header-subtitle">Manage your assigned courses efficiently.</p>
          </div>
        </div>

        <button
          className="tmt-create-btn"
          onClick={() => {}}
        >
          <Plus size={15} strokeWidth={2.5} /> Create Course
        </button>
      </div>

      {/* ── 2. Statistics Cards Row (4 Cards) ── */}
      <div className="tmt-stats-grid">
        {/* Card 1: Total Trainings */}
        <div className="tmt-stat-card">
          <div className="tmt-stat-icon-wrap tmt-stat-icon-wrap--green">
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <div className="tmt-stat-text-wrap">
            <span className="tmt-stat-label">Total Trainings</span>
            <div className="tmt-stat-value">{stats.total}</div>
            <span className="tmt-stat-sub">All courses created</span>
          </div>
        </div>

        {/* Card 2: Published */}
        <div className="tmt-stat-card">
          <div className="tmt-stat-icon-wrap tmt-stat-icon-wrap--blue">
            <CheckCircle2 size={18} strokeWidth={2} />
          </div>
          <div className="tmt-stat-text-wrap">
            <span className="tmt-stat-label">Published</span>
            <div className="tmt-stat-value">{stats.published}</div>
            <span className="tmt-stat-sub">Courses live</span>
          </div>
        </div>

        {/* Card 3: Drafts */}
        <div className="tmt-stat-card">
          <div className="tmt-stat-icon-wrap tmt-stat-icon-wrap--amber">
            <FileText size={18} strokeWidth={2} />
          </div>
          <div className="tmt-stat-text-wrap">
            <span className="tmt-stat-label">Drafts</span>
            <div className="tmt-stat-value">{stats.draft}</div>
            <span className="tmt-stat-sub">In progress</span>
          </div>
        </div>

        {/* Card 4: Archived */}
        <div className="tmt-stat-card">
          <div className="tmt-stat-icon-wrap tmt-stat-icon-wrap--purple">
            <Folder size={18} strokeWidth={2} />
          </div>
          <div className="tmt-stat-text-wrap">
            <span className="tmt-stat-label">Archived</span>
            <div className="tmt-stat-value">{stats.archived}</div>
            <span className="tmt-stat-sub">Completed courses</span>
          </div>
        </div>
      </div>

      {/* ── 3. Search + Filter Toolbar ── */}
      <div className="tmt-filter-toolbar">
        <div className="tmt-search-box">
          <Search size={15} color="#94A3B8" />
          <input
            type="text"
            className="tmt-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses by title..."
          />
        </div>

        <div className="tmt-filter-pills">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`tmt-pill ${statusFilter === 'ALL' ? 'tmt-pill--active' : ''}`}
          >
            All <span className="tmt-pill-badge">{stats.total}</span>
          </button>
          <button
            onClick={() => setStatusFilter('PUBLISHED')}
            className={`tmt-pill ${statusFilter === 'PUBLISHED' ? 'tmt-pill--active' : ''}`}
          >
            Published <span className="tmt-pill-badge">{stats.published}</span>
          </button>
          <button
            onClick={() => setStatusFilter('DRAFT')}
            className={`tmt-pill ${statusFilter === 'DRAFT' ? 'tmt-pill--active' : ''}`}
          >
            Draft <span className="tmt-pill-badge">{stats.draft}</span>
          </button>
          <button
            onClick={() => setStatusFilter('ARCHIVED')}
            className={`tmt-pill ${statusFilter === 'ARCHIVED' ? 'tmt-pill--active' : ''}`}
          >
            Archived <span className="tmt-pill-badge">{stats.archived}</span>
          </button>
        </div>
      </div>

      {/* ── 4. Main Course Management Table Card ── */}
      <div className="tmt-courses-card">
        <div className="tmt-card-header">
          <h2 className="tmt-card-title">My Courses</h2>
          <div className="tmt-sort-dropdown">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="tmt-select"
            >
              <option value="newest">Sort by: Newest</option>
              <option value="oldest">Sort by: Oldest</option>
              <option value="title">Sort by: Title</option>
            </select>
          </div>
        </div>

        <div className="tmt-table-wrapper">
          <table className="tmt-table">
            <thead>
              <tr>
                <th className="tmt-th" style={{ width: '42%' }}>COURSE</th>
                <th className="tmt-th" style={{ width: '15%' }}>STATUS</th>
                <th className="tmt-th" style={{ width: '12%' }}>LESSONS</th>
                <th className="tmt-th" style={{ width: '12%' }}>STUDENTS</th>
                <th className="tmt-th" style={{ width: '13%' }}>UPDATED</th>
                <th className="tmt-th" style={{ width: '6%', textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="tmt-empty-cell">
                    <div className="tmt-empty-state">
                      <div className="bulk-spin" style={{ display: 'inline-block', width: 24, height: 24, border: '2.5px solid #e2e8f0', borderTopColor: '#16A34A', borderRadius: '50%' }} />
                      <p style={{ marginTop: 6 }}>Loading your assigned courses...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="tmt-empty-cell">
                    <div className="tmt-empty-state" style={{ padding: '24px 0' }}>
                      <BookOpen size={36} color="#94A3B8" />
                      <p style={{ fontWeight: 600, color: '#334155', fontSize: 13, margin: '4px 0 2px' }}>
                        {search || statusFilter !== 'ALL' ? 'No courses found matching your criteria' : 'No courses assigned yet'}
                      </p>
                      <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                        {search || statusFilter !== 'ALL' ? 'Try adjusting your search or filters.' : 'Courses assigned to you by administrators will appear here.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((course) => {
                  return (
                    <tr
                      key={course.courseId || course.id}
                      className="tmt-tr"
                      onClick={() => onOpen(course.courseId || course.id)}
                    >
                      {/* COURSE COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-course-cell">
                          <div className="tmt-course-cell-thumb">
                            <CourseArtwork title={course.title} category={course.category || course.programTitle} />
                          </div>
                          <div className="tmt-course-cell-info">
                            <span className="tmt-category-pill">
                              {course.category || 'COURSE'}
                            </span>
                            <h3 className="tmt-course-name">{course.title}</h3>
                            <p className="tmt-course-desc">
                              {course.description || `Learn ${course.title} from basics to advanced concepts.`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* STATUS COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-status-cell">
                          <span className={`tmt-status-badge tmt-status-badge--${(course.status || 'PUBLISHED').toLowerCase()}`}>
                            {course.status || 'PUBLISHED'}
                          </span>
                          <span className="tmt-status-sub">
                            {course.status === 'DRAFT' ? 'In progress' : course.status === 'ARCHIVED' ? 'Completed courses' : 'Courses live'}
                          </span>
                        </div>
                      </td>

                      {/* LESSONS COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-metric-cell">
                          <span className="tmt-metric-val">{course.totalLessons || course.lessonCount || 103}</span>
                          <span className="tmt-metric-sub">Lessons</span>
                        </div>
                      </td>

                      {/* STUDENTS COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-metric-cell">
                          <span className="tmt-metric-val">{course.enrolledCount || 1}</span>
                          <span className="tmt-metric-sub">Students</span>
                        </div>
                      </td>

                      {/* UPDATED COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-metric-cell">
                          <span className="tmt-updated-val">{timeAgo(course.updatedAt || course.createdAt)}</span>
                          <span className="tmt-metric-sub">{course.title?.toLowerCase() || 'python'}</span>
                        </div>
                      </td>

                      {/* ACTIONS COLUMN */}
                      <td className="tmt-td" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            className="tmt-more-btn"
                            onClick={() => onOpen(course.courseId || course.id)}
                            title="Actions"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Table Footer / Pagination ── */}
        <div className="tmt-pagination-bar">
          <span className="tmt-pagination-info">
            Showing 1 to {filtered.length} of {filtered.length} courses
          </span>

          <div className="tmt-pagination-controls">
            <button className="tmt-page-btn" disabled>
              ‹
            </button>
            <button className="tmt-page-btn tmt-page-btn--active">
              1
            </button>
            <button className="tmt-page-btn" disabled>
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// COURSE DETAIL — Overview / Lessons / Resources / Quizzes / Coding / Discussions / Certificates / Progress
// ════════════════════════════════════════════════════════════════════════════
function CourseView({ user, courseId, onBack, onOpenLesson }) {
  const { error: showError } = useToast()
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        setLoading(true)
        const r = await fetch(API.PARTICIPANT_COURSES.OVERVIEW(courseId), { headers: auth(user.token) })
        const d = await r.json()
        if (!aborted) {
          if (d.success) setOverview(d)
          else showError(d.error || 'Failed to load course')
        }
      } catch (e) { if (!aborted) showError(e.message) }
      finally { if (!aborted) setLoading(false) }
    })()
    return () => { aborted = true }
  }, [courseId])

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
  if (!overview) return null

  const artwork = getCourseArtwork(overview.course.title)
  const svgContent = getThumbnailSVG(artwork)

  const TABS = [
    { key: 'overview',     label: 'Structure',    icon: <Layers size={17} /> },
    { key: 'lessons',      label: 'Lessons',      icon: <FileText size={17} /> },
    { key: 'quizzes',      label: 'AI Quiz',      icon: <Sparkles size={17} /> },
    { key: 'coding',       label: 'Coding',       icon: <Code size={17} /> },
    { key: 'discussions',  label: 'Discussions',  icon: <MessageSquare size={17} /> },
    { key: 'resources',    label: 'Resources',    icon: <Folder size={17} /> },
    { key: 'certificates', label: 'Certificates', icon: <Award size={17} /> },
    { key: 'progress',     label: 'Progress',     icon: <BarChart3 size={17} /> },
  ]

  const heroStats = [
    { icon: FileText, label: 'Lessons', value: overview.stats.totalLessons || 103, bg: '#EAF8F0', color: '#16A34A' },
    { icon: Sparkles, label: 'Quizzes', value: overview.stats.totalQuizzes !== undefined ? overview.stats.totalQuizzes : 1, bg: '#FFFBEB', color: '#D97706' },
    { icon: Users, label: 'Students', value: overview.stats.enrolledCount || 1, bg: '#FAF5FF', color: '#8B5CF6' },
    { icon: Code, label: 'Coding', value: overview.stats.codingCount || 0, bg: '#EFF6FF', color: '#2563EB' },
  ]

  return (
    <div className="wl-detail-page" style={{ fontFamily: "'Poppins', sans-serif" }}>
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
          <span style={{ color: '#16A34A', fontWeight: 600 }}>{overview.course.title}</span>
        </nav>
        <button className="wl-detail-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
      </motion.div>

      {/* ── Hero Card ── */}
      <motion.div
        className="wl-detail-hero"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Left: Thumbnail */}
        <div className="wl-detail-hero-thumb">
          <div className="wl-detail-hero-status">
            <span className="wl-detail-status-badge wl-detail-status-badge--published">
              PUBLISHED
            </span>
          </div>
          <CourseArtwork title={overview.course.title} category={overview.course.category} />
        </div>

        {/* Right: Info */}
        <div className="wl-detail-hero-info">
          <div className="wl-detail-hero-top">
            <div className="wl-detail-hero-text">
              <h1 className="wl-detail-hero-title">{overview.course.title}</h1>
              <div className="wl-detail-hero-category">
                {overview.course.category || `${overview.course.title} Course`}
              </div>
            </div>
            <button className="wl-detail-hero-more-btn" aria-label="More options">
              <MoreVertical size={18} />
            </button>
          </div>

          <p className="wl-detail-hero-desc">
            {overview.course.description || `Comprehensive course on ${overview.course.title} with structured modules, quizzes, and coding assessments.`}
          </p>

          {/* Stats */}
          <div className="wl-detail-hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="wl-detail-hero-stat">
                <div className="wl-detail-hero-stat-icon" style={{ background: stat.bg, color: stat.color }}>
                  <stat.icon size={17} />
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

      {/* ── Tab Navigation — Segmented Control ── */}
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
              aria-selected={tab === t.key}
              role="tab"
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
          {tab === 'overview' && (
            <div className="wl-detail-content wl-detail-content--full">
              <OverviewView course={overview.course} stats={overview.stats} enrollment={overview.enrollment} onStart={() => setTab('lessons')} />
            </div>
          )}
          {tab === 'lessons' && (
            <div className="wl-detail-content wl-detail-content--full">
              <LessonsView user={user} courseId={courseId} onOpenLesson={onOpenLesson} />
            </div>
          )}
          {tab === 'resources' && (
            <div className="wl-detail-content wl-detail-content--full">
              <ResourcesView user={user} courseId={courseId} />
            </div>
          )}
          {tab === 'quizzes' && (
            <div className="wl-detail-content wl-detail-content--full">
              <QuizzesView user={user} courseId={courseId} trainingId={overview.course.trainingProgramId} />
            </div>
          )}
          {tab === 'coding' && (
            <div className="wl-detail-content wl-detail-content--full">
              <CodingAssessmentsView user={user} courseId={courseId} trainingId={overview.course.trainingProgramId} />
            </div>
          )}
          {tab === 'discussions' && (
            <div className="wl-detail-content wl-detail-content--full">
              <DiscussionBoard user={user} trainingId={overview.course.trainingProgramId} />
            </div>
          )}
          {tab === 'certificates' && (
            <div className="wl-detail-content wl-detail-content--full">
              <CertificatesView user={user} courseId={courseId} stats={overview.stats} />
            </div>
          )}
          {tab === 'progress' && (
            <div className="wl-detail-content wl-detail-content--full">
              <ProgressView user={user} courseId={courseId} stats={overview.stats} enrollment={overview.enrollment} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Overview Tab ────────────────────────────────────────────────────────────
function OverviewView({ course, stats, enrollment, onStart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Poppins', sans-serif" }}>
      {/* Top Banner Card: Generate / Start Learning */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #F1F5F9',
        borderRadius: 14,
        padding: '24px 28px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#EAF8F0',
            color: '#16A34A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: 16.5, fontWeight: 600, color: '#0F172A', margin: 0 }}>
              Course Curriculum & Materials
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', margin: '3px 0 0' }}>
              Explore structured lessons, take AI-powered quizzes, and complete coding assessments.
            </p>
          </div>
        </div>

        <button
          onClick={onStart}
          style={{
            background: '#16A34A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: "'Poppins', sans-serif",
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#15803D'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#16A34A'}
        >
          <PlayCircle size={16} /> Start Learning
        </button>
      </div>

      {/* 2-Column Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
        {/* Description Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #F1F5F9',
          borderRadius: 14,
          padding: '22px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#0F172A', margin: '0 0 10px' }}>
            Course Overview
          </h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13.5, lineHeight: 1.6 }}>
            {course.description || `Comprehensive course on ${course.title} with structured modules, quizzes, and coding assessments.`}
          </p>
        </div>

        {/* Trainer Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #F1F5F9',
          borderRadius: 14,
          padding: '22px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#0F172A', margin: '0 0 14px' }}>
            Instructor
          </h3>
          {course.trainer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#16A34A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 15,
              }}>
                {course.trainer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0F172A' }}>{course.trainer.name}</div>
                <div style={{ fontSize: 12.5, color: '#64748B' }}>Course Trainer</div>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#94A3B8', fontSize: 13 }}>Assigned by Administrator</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Lessons Tab ─────────────────────────────────────────────────────────────
function LessonsView({ user, courseId, onOpenLesson }) {
  const { error: showError } = useToast()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(API.PARTICIPANT_COURSES.LESSONS(courseId), { headers: auth(user.token) })
        const d = await r.json()
        if (!aborted) {
          if (d.success) setLessons(d.lessons || [])
          else showError(d.error || 'Failed to load lessons')
        }
      } catch (e) { if (!aborted) showError(e.message) }
      finally { if (!aborted) setLoading(false) }
    })()
    return () => { aborted = true }
  }, [courseId])

  const completedCount = lessons.filter(l => l.progress?.status === 'COMPLETED').length

  return (
    <div className="wl-lessons-surface">
      {/* Header */}
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Learning Content</h2>
          <p className="wl-lessons-subtitle">Work through each module at your own pace.</p>
          <div className="wl-lessons-pills">
            <span className="wl-lessons-pill" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <span className="wl-lessons-pill-dot" style={{ background: '#16a34a' }} />
              {completedCount} / {lessons.length} Completed
            </span>
            {lessons.some(l => l.hasAssessment) && (
              <span className="wl-lessons-pill" style={{ background: '#fef3c7', color: '#d97706' }}>
                <span className="wl-lessons-pill-dot" style={{ background: '#d97706' }} />
                Has Assessments
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 68, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      ) : lessons.length === 0 ? (
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <FileText size={36} />
          </div>
          <h3>No lessons published yet</h3>
          <p>Check back later for new learning content.</p>
        </div>
      ) : (
        <div className="wl-module-list">
          {lessons.map((l, i) => {
            const isCompleted = l.progress?.status === 'COMPLETED'
            const isInProgress = l.progress?.status === 'IN_PROGRESS'
            const matCount = Object.values(l.materialCounts || {}).reduce((a, b) => a + b, 0)

            return (
              <motion.div
                key={l.lessonId}
                className="wl-module-row"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => {
                  if (l.isLocked) {
                    showError('This lesson is locked. Please complete the previous lesson first.')
                    return
                  }
                  onOpenLesson(l.lessonId)
                }}
                style={{ cursor: l.isLocked ? 'not-allowed' : 'pointer', opacity: l.isLocked ? 0.5 : 1 }}
              >
                <div className="wl-module-row-header">
                  <span className={`wl-module-chevron`}>
                    {isCompleted ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} /> : <ChevronRight size={16} />}
                  </span>
                  <span className={`wl-module-taxonomy`} style={{
                    background: isCompleted ? '#f0fdf4' : isInProgress ? '#fffbeb' : l.isLocked ? '#f1f5f9' : '#f0fdfa',
                    color: isCompleted ? '#16a34a' : isInProgress ? '#d97706' : l.isLocked ? '#9CA3AF' : '#0D9488',
                  }}>
                    {isCompleted ? 'Done' : isInProgress ? 'In Progress' : l.isLocked ? 'Locked' : `Lesson ${i + 1}`}
                  </span>
                  <span className="wl-module-title">{l.title}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {matCount > 0 && (
                      <span style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Folder size={11} /> {matCount}
                      </span>
                    )}
                    {l.hasAssessment && (
                      <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Sparkles size={11} /> Quiz
                      </span>
                    )}
                    {l.isLocked ? (
                      <Lock size={14} style={{ color: '#9CA3AF' }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Resources Tab ───────────────────────────────────────────────────────────
function ResourcesView({ user, courseId }) {
  const { error: showError } = useToast()
  const [resources, setResources] = useState(null)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(API.PARTICIPANT_COURSES.RESOURCES(courseId), { headers: auth(user.token) })
        const d = await r.json()
        if (!aborted) {
          if (d.success) setResources(d.resources || {})
          else showError(d.error || 'Failed to load resources')
        }
      } catch (e) { if (!aborted) showError(e.message) }
    })()
    return () => { aborted = true }
  }, [courseId])

  if (!resources) {
    return (
      <div className="wl-lessons-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 68, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      </div>
    )
  }

  const sections = [
    ['PDF', 'PDFs'], ['VIDEO', 'Videos'], ['IMAGE', 'Images'],
    ['LINK', 'Links'], ['NOTE', 'Notes'], ['PPT', 'Presentations'],
  ].filter(([k]) => (resources[k] || []).length > 0)

  const totalCount = sections.reduce((sum, [k]) => sum + (resources[k]?.length || 0), 0)

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Training Resources</h2>
          <p className="wl-lessons-subtitle">Download materials and reference files from your lessons.</p>
          <div className="wl-lessons-pills">
            <span className="wl-lessons-pill" style={{ background: '#f0fdfa', color: '#0D9488' }}>
              <span className="wl-lessons-pill-dot" style={{ background: '#0D9488' }} />
              {totalCount} Resource{totalCount !== 1 ? 's' : ''} Available
            </span>
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <Folder size={36} />
          </div>
          <h3>No materials posted yet</h3>
          <p>Resources will appear here once your trainer uploads them.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sections.map(([key, label]) => (
            <div key={key} className="enterprise-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: '#f0fdfa', color: '#0D9488',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {MAT_ICON[key]}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{resources[key].length} file{resources[key].length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resources[key].map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: '#f9fafb', borderRadius: 10, border: '1px solid #f1f5f9',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: '#111827',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>From: {m.lessonTitle}</div>
                    </div>
                    {(m.fileUrl || m.linkUrl) && (
                      <a
                        href={m.fileUrl ? assetUrl(m.fileUrl) : m.linkUrl}
                        target="_blank" rel="noreferrer"
                        className="wl-btn-secondary wl-btn-secondary--teal"
                        style={{ height: 32, padding: '0 12px', fontSize: 11, textDecoration: 'none' }}
                      >
                        <ExternalLink size={11} /> Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quizzes Tab ─────────────────────────────────────────────────────────────
function QuizzesView({ user, courseId, trainingId }) {
  const { error: showError } = useToast()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [completedQuizzes, setCompletedQuizzes] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.PARTICIPANT_COURSES.QUIZZES(courseId), { headers: auth(user.token) })
      const d = await r.json()
      if (d.success) {
        setQuizzes(d.quizzes || [])
        setCompletedQuizzes(d.completedQuizzes || [])
      }
      else showError(d.error || 'Failed to load quizzes')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [courseId])

  const handleStart = async (quizId) => {
    const token = user?.token
    try {
      const startUrl = `${API_BASE}/quizzes/${quizId}/start`
      const res = await fetch(startUrl, { method: 'POST', headers: auth(token) })
      const response = await res.json()
      if (!res.ok) { showError(response.error || 'Failed to start quiz'); return }
      if (response.quiz?.proctoringEnabled) {
        navigate(`/participant/exam/${quizId}`, {
          state: { attemptId: response.attemptId, quizData: response.quiz }
        })
      } else {
        navigate(`/trainings/${trainingId}/quizzes/${quizId}/attempt?attemptId=${response.attemptId}&sessionToken=${response.sessionToken}`)
      }
    } catch (err) { showError(err.message) }
  }

  if (loading) {
    return (
      <div className="wl-lessons-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 68, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      </div>
    )
  }

  if (quizzes.length === 0 && completedQuizzes.length === 0) {
    return (
      <div className="wl-lessons-surface">
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <Sparkles size={36} />
          </div>
          <h3>No quizzes published yet</h3>
          <p>Quizzes will appear here once your trainer creates them.</p>
        </div>
      </div>
    )
  }

  const renderQuizGrid = (list, sectionLabel) => (
    <div style={{ marginBottom: 24 }}>
      <div className="wl-lessons-pills" style={{ marginBottom: 12 }}>
        <span className="wl-lessons-pill" style={{
          background: sectionLabel === 'Available' ? '#f0fdf4' : '#f0fdfa',
          color: sectionLabel === 'Available' ? '#16a34a' : '#0D9488',
        }}>
          <span className="wl-lessons-pill-dot" style={{ background: sectionLabel === 'Available' ? '#16a34a' : '#0D9488' }} />
          {sectionLabel} ({list.length})
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {list.map(q => (
          <div key={q.quizId} className="enterprise-card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{q.title}</div>
              {q.myStatus !== 'NOT_STARTED' && (
                q.resultStatus === 'PUBLISHED' ? (
                  <span className="wl-detail-status-badge wl-detail-status-badge--published" style={{ fontSize: 9, flexShrink: 0 }}>
                    Result Available
                  </span>
                ) : (
                  <span className="wl-detail-status-badge wl-detail-status-badge--draft" style={{ fontSize: 9, flexShrink: 0 }}>
                    Pending Result
                  </span>
                )
              )}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12 }}>
              {q.lessonTitle || 'Course-level'} · {q.questionCount} question{q.questionCount !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', justifyContent: 'space-between' }}>
              {q.myStatus === 'IN_PROGRESS' ? (
                <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>In Progress</span>
              ) : q.myStatus !== 'NOT_STARTED' ? (
                q.resultStatus === 'PUBLISHED' ? (
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    ✓ Submitted{q.myScore != null ? ` · ${q.myScore.toFixed(0)}%` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Result Pending</span>
                )
              ) : (
                <span style={{ fontSize: 11, color: '#6B7280' }}>Not started</span>
              )}
              <button
                onClick={() => {
                  if (q.myStatus === 'IN_PROGRESS') handleStart(q.quizId)
                  else if (q.myStatus !== 'NOT_STARTED' && q.resultStatus === 'PUBLISHED') navigate(`/trainings/${trainingId}/quizzes/${q.quizId}/result`)
                  else handleStart(q.quizId)
                }}
                disabled={q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS' && q.resultStatus !== 'PUBLISHED'}
                className="wl-btn-primary"
                style={{
                  height: 32, padding: '0 14px', fontSize: 11,
                  opacity: (q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS' && q.resultStatus !== 'PUBLISHED') ? 0.5 : 1,
                  cursor: (q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS' && q.resultStatus !== 'PUBLISHED') ? 'not-allowed' : 'pointer',
                }}
              >
                {q.myStatus === 'IN_PROGRESS' ? <><PlayCircle size={11} /> Resume</>
                  : q.myStatus !== 'NOT_STARTED' ? (q.resultStatus === 'PUBLISHED' ? <><Eye size={11} /> View Result</> : 'Attempted')
                  : <><PlayCircle size={11} /> Start</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Quizzes</h2>
          <p className="wl-lessons-subtitle">Test your knowledge with quizzes created for this training.</p>
        </div>
      </div>
      {quizzes.length > 0 && renderQuizGrid(quizzes, 'Available')}
      {completedQuizzes.length > 0 && renderQuizGrid(completedQuizzes, 'Completed')}
    </div>
  )
}

// ── Coding Assessments Tab ──────────────────────────────────────────────────
function CodingAssessmentsView({ user, courseId, trainingId }) {
  const { error: showError } = useToast()
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [completedAssessments, setCompletedAssessments] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.PARTICIPANT_COURSES.CODING_ASSESSMENTS(courseId), { headers: auth(user.token) })
      const d = await r.json()
      if (d.success) {
        setAssessments(d.assessments || [])
        setCompletedAssessments(d.completedAssessments || [])
      }
      else showError(d.error || 'Failed to load coding assessments')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [courseId])

  const handleStart = async (assessmentId) => {
    const token = user?.token
    try {
      const startUrl = `${API_BASE}/coding/participant/start/${assessmentId}`
      const res = await fetch(startUrl, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          participant_id: user?.id,
          training_id: trainingId,
          lesson_id: null,
          coding_assessment_id: assessmentId,
        })
      })
      const response = await res.json()
      if (!res.ok) { showError(response.error || 'Failed to start coding assessment'); return }
      navigate(`/trainings/${trainingId}/coding/${assessmentId}/attempt?attemptId=${response.attemptId}&sessionToken=${response.sessionToken}`)
    } catch (err) { showError(err.message) }
  }

  if (loading) {
    return (
      <div className="wl-lessons-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 68, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      </div>
    )
  }

  if (assessments.length === 0 && completedAssessments.length === 0) {
    return (
      <div className="wl-lessons-surface">
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <Code size={36} />
          </div>
          <h3>No coding assessments published yet</h3>
          <p>Coding assessments will appear here once your trainer creates them.</p>
        </div>
      </div>
    )
  }

  const renderAssessmentGrid = (list, sectionLabel) => (
    <div style={{ marginBottom: 24 }}>
      <div className="wl-lessons-pills" style={{ marginBottom: 12 }}>
        <span className="wl-lessons-pill" style={{
          background: sectionLabel === 'Available' ? '#eff6ff' : '#f0fdfa',
          color: sectionLabel === 'Available' ? '#2563eb' : '#0D9488',
        }}>
          <span className="wl-lessons-pill-dot" style={{ background: sectionLabel === 'Available' ? '#2563eb' : '#0D9488' }} />
          {sectionLabel} ({list.length})
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {list.map(a => (
          <div key={a.assessmentId} className="enterprise-card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{a.title}</div>
              {a.myStatus !== 'NOT_STARTED' && (
                a.resultStatus === 'PUBLISHED' ? (
                  <span className="wl-detail-status-badge wl-detail-status-badge--published" style={{ fontSize: 9, flexShrink: 0 }}>
                    Result Available
                  </span>
                ) : (
                  <span className="wl-detail-status-badge wl-detail-status-badge--draft" style={{ fontSize: 9, flexShrink: 0 }}>
                    Pending Result
                  </span>
                )
              )}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12 }}>
              {a.problemCount} problem{a.problemCount !== 1 ? 's' : ''} · Coding Challenge
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', justifyContent: 'space-between' }}>
              {a.myStatus === 'IN_PROGRESS' ? (
                <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>In Progress</span>
              ) : a.myStatus !== 'NOT_STARTED' ? (
                a.resultStatus === 'PUBLISHED' ? (
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    ✓ Submitted{a.myScore != null ? ` · ${a.myScore.toFixed(0)}%` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Result Pending</span>
                )
              ) : (
                <span style={{ fontSize: 11, color: '#6B7280' }}>Not started</span>
              )}
              <button
                onClick={() => {
                  if (a.myStatus === 'IN_PROGRESS') handleStart(a.assessmentId)
                  else if (a.myStatus !== 'NOT_STARTED' && a.resultStatus === 'PUBLISHED') navigate(`/trainings/${trainingId}/coding/${a.assessmentId}/result`)
                  else handleStart(a.assessmentId)
                }}
                disabled={a.myStatus !== 'NOT_STARTED' && a.myStatus !== 'IN_PROGRESS' && a.resultStatus !== 'PUBLISHED'}
                className="wl-btn-primary"
                style={{
                  height: 32, padding: '0 14px', fontSize: 11,
                  background: '#2563eb',
                  opacity: (a.myStatus !== 'NOT_STARTED' && a.myStatus !== 'IN_PROGRESS' && a.resultStatus !== 'PUBLISHED') ? 0.5 : 1,
                  cursor: (a.myStatus !== 'NOT_STARTED' && a.myStatus !== 'IN_PROGRESS' && a.resultStatus !== 'PUBLISHED') ? 'not-allowed' : 'pointer',
                }}
              >
                {a.myStatus === 'IN_PROGRESS' ? <><PlayCircle size={11} /> Resume</>
                  : a.myStatus !== 'NOT_STARTED' ? (a.resultStatus === 'PUBLISHED' ? <><Eye size={11} /> View Result</> : 'Attempted')
                  : <><PlayCircle size={11} /> Start</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Coding Assessments</h2>
          <p className="wl-lessons-subtitle">Solve coding challenges to demonstrate your skills.</p>
        </div>
      </div>
      {assessments.length > 0 && renderAssessmentGrid(assessments, 'Available')}
      {completedAssessments.length > 0 && renderAssessmentGrid(completedAssessments, 'Completed')}
    </div>
  )
}

// ── Certificates Tab ────────────────────────────────────────────────────────
function CertificatesView({ user, courseId, stats }) {
  const navigate = useNavigate()
  const allCompleted = stats.totalLessons > 0 && stats.completedLessons === stats.totalLessons

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Certificates</h2>
          <p className="wl-lessons-subtitle">Your training completion certificates.</p>
        </div>
      </div>

      {allCompleted ? (
        <div className="enterprise-card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Award size={36} style={{ color: '#16a34a' }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            Congratulations!
          </h3>
          <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 20px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
            You have completed all {stats.totalLessons} lessons in this training. Your certificate is ready!
          </p>
          <button className="wl-btn-primary" style={{ height: 44, padding: '0 28px' }}>
            <Award size={16} /> Download Certificate
          </button>
        </div>
      ) : (
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <Award size={36} />
          </div>
          <h3>Certificate not yet available</h3>
          <p>
            Complete all {stats.totalLessons} lessons ({stats.completedLessons} of {stats.totalLessons} done) to earn your certificate.
          </p>
          <div style={{ width: 240, marginTop: 12 }}>
            <ProgressBar value={stats.completedLessons} max={stats.totalLessons} showLabel color="primary" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Progress Tab ────────────────────────────────────────────────────────────
function ProgressView({ user, courseId, stats, enrollment }) {
  const completionPct = stats.totalLessons > 0 ? Math.round((stats.completedLessons / stats.totalLessons) * 100) : 0
  const quizPct = stats.totalQuizzes > 0 ? Math.round((stats.attemptedQuizzes / stats.totalQuizzes) * 100) : 0

  const chartData = [
    { name: 'Lessons', completed: stats.completedLessons, remaining: stats.totalLessons - stats.completedLessons },
    { name: 'Quizzes', completed: stats.attemptedQuizzes, remaining: stats.totalQuizzes - stats.attemptedQuizzes },
    { name: 'Coding', completed: stats.submittedAssessments, remaining: Math.max(0, 3 - stats.submittedAssessments) },
  ]

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">My Progress</h2>
          <p className="wl-lessons-subtitle">Track your learning journey through this training.</p>
        </div>
      </div>

      {/* Progress Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="enterprise-card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{completionPct}%</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Lesson Completion</div>
          <ProgressBar value={stats.completedLessons} max={stats.totalLessons} showLabel color="primary" style={{ marginTop: 8 }} />
        </div>
        <div className="enterprise-card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{quizPct}%</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Quiz Attempted</div>
          <ProgressBar value={stats.attemptedQuizzes} max={stats.totalQuizzes} showLabel color="warning" style={{ marginTop: 8 }} />
        </div>
        <div className="enterprise-card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>
            {stats.avgQuizScore != null ? `${stats.avgQuizScore.toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Avg Quiz Score</div>
        </div>
        <div className="enterprise-card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#8b5cf6' }}>{stats.submittedAssessments}</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Coding Submissions</div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="enterprise-card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Overall Progress</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              <span>Lessons Completed</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>{stats.completedLessons} / {stats.totalLessons}</span>
            </div>
            <ProgressBar value={stats.completedLessons} max={stats.totalLessons} showLabel color="primary" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              <span>Quizzes Attempted</span>
              <span style={{ fontWeight: 700, color: '#d97706' }}>{stats.attemptedQuizzes} / {stats.totalQuizzes}</span>
            </div>
            <ProgressBar value={stats.attemptedQuizzes} max={stats.totalQuizzes} showLabel color="warning" />
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="enterprise-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Activity Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {chartData.map(item => (
            <div key={item.name} style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>{item.name}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{item.completed}</div>
                  <div style={{ fontSize: 10, color: '#6B7280' }}>Done</div>
                </div>
                <div style={{ width: 1, background: '#e5e7eb' }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#9CA3AF' }}>{item.remaining}</div>
                  <div style={{ fontSize: 10, color: '#6B7280' }}>Remaining</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// LESSON DETAIL — Materials / Quiz / Assessment
// ════════════════════════════════════════════════════════════════════════════
function LessonView({ user, lessonId, onBack }) {
  const { error: showError, success } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('materials')
  const [openAssessmentId, setOpenAssessmentId] = useState(null)

  const fetchLesson = async () => {
    try {
      const r = await fetch(API.PARTICIPANT_COURSES.LESSON(lessonId), { headers: auth(user.token) })
      const d = await r.json()
      if (d.success) setData(d)
      else showError(d.error || 'Failed to load lesson')
    } catch (e) { showError(e.message) }
  }
  useEffect(() => { fetchLesson() }, [lessonId])

  const handleStartQuiz = async (quizId) => {
    const token = user?.token
    const currentTrainingId = data?.trainingProgramId
    try {
      const startUrl = `${API_BASE}/quizzes/${quizId}/start`
      const res = await fetch(startUrl, { method: 'POST', headers: auth(token) })
      const response = await res.json()
      if (!res.ok) { showError(response.error || 'Failed to start quiz'); return }
      if (response.quiz?.proctoringEnabled) {
        navigate(`/participant/exam/${quizId}`, {
          state: { attemptId: response.attemptId, quizData: response.quiz }
        })
      } else {
        navigate(`/trainings/${currentTrainingId}/quizzes/${quizId}/attempt?attemptId=${response.attemptId}&sessionToken=${response.sessionToken}`)
      }
    } catch (err) { showError(err.message) }
  }

  const markViewed = async () => {
    try {
      const r = await fetch(API.PARTICIPANT_COURSES.VIEW_LESSON(lessonId), {
        method: 'POST', headers: auth(user.token),
      })
      const d = await r.json()
      if (d.success) {
        success('Lesson marked as viewed')
        fetchLesson()
      }
    } catch (e) { showError(e.message) }
  }

  if (!data) {
    return (
      <div className="wl-detail-page">
        <div className="wl-detail-loading-row">
          <div className="skeleton" style={{ height: 24, width: 100 }} />
        </div>
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 36, borderRadius: 8, marginTop: 8 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 12, marginTop: 8 }} />
      </div>
    )
  }

  const SUBTABS = [
    { key: 'materials',  label: 'Materials',  icon: <Folder size={13} /> },
    { key: 'quiz',       label: 'Quiz',       icon: <Sparkles size={13} /> },
    { key: 'assessment', label: 'Assessment', icon: <ClipboardList size={13} /> },
  ]

  return (
    <div className="wl-detail-page">
      {/* Top Row */}
      <motion.div
        className="wl-detail-top-row"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <nav className="wl-detail-breadcrumb">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack() }}>Course</a>
          <span className="wl-detail-breadcrumb-sep">/</span>
          <span>{data.lesson.title}</span>
        </nav>
        <button className="wl-detail-back" onClick={onBack}>
          <ArrowLeft size={12} /> Back to course
        </button>
      </motion.div>

      {/* Hero Card — Lesson */}
      <motion.div
        className="wl-detail-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="wl-detail-hero-info" style={{ width: '100%' }}>
          <div className="wl-detail-hero-top">
            <div className="wl-detail-hero-text">
              <h1 className="wl-detail-hero-title">{data.lesson.title}</h1>
              {data.lesson.description && (
                <p className="wl-detail-hero-desc" style={{ marginBottom: 0 }}>{data.lesson.description}</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <StatusPill status={data.progress.status} />
            {!data.progress.contentViewed && (
              <button
                onClick={markViewed}
                className="wl-btn-primary"
                style={{ height: 34, padding: '0 16px', fontSize: 12 }}
              >
                <CheckCircle2 size={12} /> Mark as viewed
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Sub-tabs */}
      <motion.div
        className="wl-detail-tabs"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
      >
        <div className="wl-detail-tabs-list">
          {SUBTABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`wl-detail-tab ${tab === t.key ? 'wl-detail-tab--active' : ''}`}
              aria-selected={tab === t.key}
              role="tab"
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          className="wl-detail-content-wrapper"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === 'materials' && (
            <div className="wl-detail-content wl-detail-content--full">
              <div className="wl-lessons-surface">
                {data.lesson.content && (
                  <div className="enterprise-card" style={{ padding: 20, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Lesson Summary
                    </div>
                    <div style={{ fontSize: 14, color: '#4B5563', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{data.lesson.content}</div>
                  </div>
                )}
                {(data.materials || []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.materials.map(m => (
                      <MaterialCard key={m.id} material={m} />
                    ))}
                  </div>
                ) : !data.lesson.content ? (
                  <div className="wl-lessons-empty">
                    <div className="wl-lessons-empty-icon">
                      <Folder size={32} />
                    </div>
                    <h3>No materials posted yet</h3>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {tab === 'quiz' && (
            <div className="wl-detail-content wl-detail-content--full">
              <div className="wl-lessons-surface">
                {(data.quizzes || []).length === 0 ? (
                  <div className="wl-lessons-empty">
                    <div className="wl-lessons-empty-icon">
                      <Sparkles size={32} />
                    </div>
                    <h3>No quiz attached</h3>
                    <p>This lesson does not have a quiz yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.quizzes.map(q => (
                      <div key={q.quizId} className="enterprise-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{q.title}</div>
                            {q.myStatus !== 'NOT_STARTED' && (
                              q.resultStatus === 'PUBLISHED' ? (
                                <span className="wl-detail-status-badge wl-detail-status-badge--published" style={{ fontSize: 9 }}>Result Available</span>
                              ) : (
                                <span className="wl-detail-status-badge wl-detail-status-badge--draft" style={{ fontSize: 9 }}>Pending Result</span>
                              )
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                            {q.questionCount} questions · {q.isMandatory ? 'Mandatory' : 'Optional'}
                            {q.myStatus !== 'NOT_STARTED' && (
                              <> · <span style={{ fontWeight: 600, color: q.myStatus === 'IN_PROGRESS' ? '#d97706' : q.resultStatus === 'PUBLISHED' ? '#16a34a' : '#d97706' }}>
                                {q.myStatus === 'IN_PROGRESS' ? 'In Progress' : q.resultStatus === 'PUBLISHED' ? `Submitted${q.myScore != null ? ` (${q.myScore.toFixed(0)}%)` : ''}` : 'Result Pending'}
                              </span></>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (q.myStatus === 'IN_PROGRESS') handleStartQuiz(q.quizId)
                            else if (q.myStatus !== 'NOT_STARTED' && q.resultStatus === 'PUBLISHED') navigate(`/trainings/${data.trainingProgramId}/quizzes/${q.quizId}/result`)
                            else handleStartQuiz(q.quizId)
                          }}
                          disabled={q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS' && q.resultStatus !== 'PUBLISHED'}
                          className="wl-btn-primary"
                          style={{
                            height: 36, padding: '0 16px', fontSize: 12,
                            opacity: (q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS' && q.resultStatus !== 'PUBLISHED') ? 0.5 : 1,
                          }}
                        >
                          {q.myStatus === 'IN_PROGRESS' ? <><PlayCircle size={12} /> Resume</>
                            : q.myStatus !== 'NOT_STARTED' ? (q.resultStatus === 'PUBLISHED' ? <><Eye size={12} /> View Result</> : 'Attempted')
                            : <><PlayCircle size={12} /> Start Quiz</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'assessment' && (
            <div className="wl-detail-content wl-detail-content--full">
              <div className="wl-lessons-surface">
                {(data.assessments || []).length === 0 ? (
                  <div className="wl-lessons-empty">
                    <div className="wl-lessons-empty-icon">
                      <ClipboardList size={32} />
                    </div>
                    <h3>No assessment for this lesson</h3>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.assessments.map(a => (
                      <div key={a.assessmentId} className="enterprise-card" style={{ padding: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{a.title}</div>
                            <div style={{ fontSize: 11, color: '#6B7280' }}>
                              Max score: {a.maxScore} · Status: <strong>{a.myStatus}</strong>
                            </div>
                          </div>
                          <button
                            onClick={() => setOpenAssessmentId(a.assessmentId)}
                            className={a.myStatus === 'NOT_STARTED' ? 'wl-btn-primary' : 'wl-btn-secondary wl-btn-secondary--teal'}
                            style={{ height: 36, padding: '0 16px', fontSize: 12 }}
                          >
                            {a.myStatus === 'NOT_STARTED' ? 'Submit' : 'View / Resubmit'}
                          </button>
                        </div>
                        {a.instructions && (
                          <div style={{
                            marginTop: 12, padding: 14, background: '#f9fafb', borderRadius: 10,
                            fontSize: 13, color: '#4B5563', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                          }}>
                            {a.instructions}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {openAssessmentId && (
          <AssessmentModal
            user={user}
            assessmentId={openAssessmentId}
            onClose={() => { setOpenAssessmentId(null); fetchLesson() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MaterialCard({ material }) {
  const m = material
  return (
    <div className="enterprise-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#f0fdfa', color: '#0D9488',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {MAT_ICON[m.materialType]}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{m.title}</span>
        </div>
        {(m.fileUrl || m.linkUrl) && (
          <a
            href={m.fileUrl ? assetUrl(m.fileUrl) : m.linkUrl}
            target="_blank" rel="noreferrer"
            className="wl-btn-secondary wl-btn-secondary--teal"
            style={{ height: 30, padding: '0 10px', fontSize: 11, textDecoration: 'none' }}
          >
            <ExternalLink size={11} /> Open
          </a>
        )}
      </div>
      {m.materialType === 'NOTE' && m.content && (
        <div
          dangerouslySetInnerHTML={{ __html: m.content }}
          style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.6 }}
        />
      )}
      {m.materialType === 'IMAGE' && m.fileUrl && (
        <img src={assetUrl(m.fileUrl)} alt={m.title} style={{ maxWidth: '100%', borderRadius: 10, marginTop: 4 }} />
      )}
      {m.materialType === 'VIDEO' && m.fileUrl && (
        <video src={assetUrl(m.fileUrl)} controls style={{ maxWidth: '100%', borderRadius: 10, marginTop: 4 }} />
      )}
      {m.materialType === 'LINK' && m.content && (
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 13 }}>{m.content}</p>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ASSESSMENT MODAL — submit and view result
// ════════════════════════════════════════════════════════════════════════════
function AssessmentModal({ user, assessmentId, onClose }) {
  const { error: showError, success } = useToast()
  const [content, setContent] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(API.PARTICIPANT_COURSES.ASSESSMENT_RESULT(assessmentId), { headers: auth(user.token) })
        const d = await r.json()
        if (!aborted && d.success) setResult(d)
      } catch {}
    })()
    return () => { aborted = true }
  }, [assessmentId])

  const submit = async () => {
    if (!content.trim() && !fileUrl.trim()) {
      showError('Please write a response or paste a file URL')
      return
    }
    try {
      setSubmitting(true)
      const r = await fetch(API.PARTICIPANT_COURSES.ASSESSMENT_SUBMIT(assessmentId), {
        method: 'POST', headers: auth(user.token),
        body: JSON.stringify({ content, fileUrl: fileUrl || null }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Submit failed'); return }
      success('Assessment submitted')
      onClose()
    } catch (e) { showError(e.message) }
    finally { setSubmitting(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="enterprise-card"
        style={{ width: '100%', maxWidth: 540, padding: 24 }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
          Assessment Submission
        </h3>

        {result && result.status === 'PUBLISHED' ? (
          <div style={{
            padding: 16, background: '#f0fdf4', borderRadius: 12, marginBottom: 16, border: '1px solid #dcfce7',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Result published
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a', margin: '4px 0' }}>
              {result.score} / {result.maxScore}
            </div>
            {result.feedback && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#16a34a' }}>
                <strong>Feedback:</strong> {result.feedback}
              </div>
            )}
          </div>
        ) : result && result.status !== 'NOT_STARTED' && (
          <div style={{
            padding: 14, background: '#fffbeb', color: '#92400e', borderRadius: 10,
            fontSize: 12, marginBottom: 16, border: '1px solid #fef3c7',
          }}>
            <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {result.message || 'Submission received. Trainer will review and publish soon.'}
          </div>
        )}

        <label style={lblStyle}>Your response</label>
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Write your response here…"
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <label style={lblStyle}>Or paste a file URL (optional)</label>
        <input
          value={fileUrl} onChange={(e) => setFileUrl(e.target.value)}
          placeholder="https://drive.google.com/…"
          style={inputStyle}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={submitting} style={btnSecondary}>Close</button>
          <button onClick={submit} disabled={submitting} style={btnPrimary}>
            <Send size={14} style={{ marginRight: 6 }} />
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// EXPLORE CATALOG
// ════════════════════════════════════════════════════════════════════════════
function ExploreCatalog({ user, onEnrollSuccess }) {
  const { error: showError, success } = useToast()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrollingId, setEnrollingId] = useState(null)

  const fetchExplore = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.PARTICIPANT_COURSES.EXPLORE, { headers: auth(user.token) })
      const d = await r.json()
      if (d.success) setCourses(d.courses || [])
      else showError(d.error || 'Failed to load courses')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchExplore() }, [])

  const handleEnroll = async (courseId) => {
    try {
      setEnrollingId(courseId)
      const r = await fetch(API.PARTICIPANT_COURSES.ENROLL, {
        method: 'POST',
        headers: auth(user.token),
        body: JSON.stringify({ courseId }),
      })
      const d = await r.json()
      if (d.success) {
        success(d.message || 'Enrolled successfully!')
        onEnrollSuccess?.()
        await fetchExplore()
      } else {
        showError(d.error || 'Enrollment failed')
      }
    } catch (e) { showError(e.message) }
    finally { setEnrollingId(null) }
  }

  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Explore Trainings</h2>
          <p className="wl-lessons-subtitle">Discover and enroll in published trainings.</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-72 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="wl-lessons-empty">
          <div className="wl-lessons-empty-icon">
            <BookOpen size={48} />
          </div>
          <h3>No new trainings to explore</h3>
          <p>You're already enrolled in all published trainings!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((c, i) => {
            const artwork = getCourseArtwork(c.title)
            const svgContent = getThumbnailSVG(artwork)
            return (
              <motion.div
                key={c.courseId}
                className="wl-training-card"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -4 }}
              >
                <div className="wl-training-card-thumb">
                  <CourseArtwork title={c.title} category={c.category || c.programTitle} />
                </div>
                <div className="wl-training-card-body">
                  <h3 className="wl-training-card-title">{c.title}</h3>
                  <div className="wl-training-card-meta">
                    <Folder size={12} /> {c.programTitle || '—'}
                  </div>
                  {c.description && (
                    <p className="wl-training-card-desc">
                      {c.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B7280', fontSize: 11.5, marginTop: 8, marginBottom: 12 }}>
                    <User size={12} /> <span style={{ fontWeight: 600 }}>{c.trainerName || 'TBA'}</span>
                  </div>
                  <button
                    disabled={enrollingId === c.courseId}
                    onClick={() => handleEnroll(c.courseId)}
                    className="wl-btn-primary"
                    style={{
                      width: '100%', height: 40,
                      opacity: enrollingId === c.courseId ? 0.7 : 1,
                    }}
                  >
                    Request Enrollment
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ENTRY — switches between list / course / lesson
// ════════════════════════════════════════════════════════════════════════════
export default function ParticipantCourses({ user }) {
  const [view, setView] = useState({ mode: 'list', courseId: null, lessonId: null })

  if (view.mode === 'lesson') {
    return (
      <LessonView
        user={user}
        lessonId={view.lessonId}
        onBack={() => setView({ mode: 'course', courseId: view.courseId })}
      />
    )
  }
  if (view.mode === 'course') {
    return (
      <CourseView
        user={user}
        courseId={view.courseId}
        onBack={() => setView({ mode: 'list' })}
        onOpenLesson={(lessonId) => setView({ mode: 'lesson', courseId: view.courseId, lessonId })}
      />
    )
  }
  return (
    <MyCoursesList user={user} onOpen={(courseId) => setView({ mode: 'course', courseId })} />
  )
}

// ── shared style helpers ────────────────────────────────────────────────────
const lblStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
}
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center',
  padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary = {
  padding: '10px 18px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
