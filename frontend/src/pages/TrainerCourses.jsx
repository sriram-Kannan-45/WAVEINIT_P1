import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Search, Plus, Pencil, Trash2,
  BookOpen, FileText, Users, BarChart3, Layers, Sparkles,
  CheckCircle2, Folder, MessageSquare, Code,
  ChevronRight, MoreHorizontal, MoreVertical, GripVertical,
  GraduationCap, ChevronDown, Trophy
} from 'lucide-react'
import { API } from '../api/api'
import { fetchWithTimeout } from '../api/request'
import { StatCard } from '../components/ui'
import { getCourseThumbnail, getThumbnailSVG } from '../config/courseThumbnailMap'
import emptyCourseImg from '../assets/illustrations/empty-course.png'

import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ui/AlertModal'
import MaterialManager from '../components/trainer/MaterialManager'
import CourseQuizzesTab from '../components/trainer/CourseQuizzesTab'
import CourseCodingTab from '../components/trainer/CourseCodingTab'
import CourseParticipantsTab from '../components/trainer/CourseParticipantsTab'
import CourseAnalyticsTab from '../components/trainer/CourseAnalyticsTab'
import DiscussionBoard from '../components/shared/DiscussionBoard'
import AIStructureGenerator from '../components/trainer/AIStructureGenerator'
import CourseArtwork from '../components/common/CourseArtwork'
import TrainingProgressBar from '../components/common/TrainingProgressBar'
import '../styles/trainer-my-trainings.css'
import '../styles/course-tabs.css'

function getCourseArtwork(title, category) {
  return getCourseThumbnail(title, category)
}


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

function CoursesList({ user, onOpenCourse, onLogout, onTabChange }) {
  const navigate = useNavigate()
  const { error: showError, success } = useToast()
  const [courses, setCourses] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`trainer_courses_${user?.id || 'me'}`)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`trainer_courses_${user?.id || 'me'}`)
      return !cached
    } catch {
      return true
    }
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('newest')
  const [actionMenuOpen, setActionMenuOpen] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [quickJumpOpen, setQuickJumpOpen] = useState(false)
  const [quickJumpSearch, setQuickJumpSearch] = useState('')
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 4

  const auth = () => ({ Authorization: `Bearer ${user?.token || ''}` })

  const fetchCourses = async (signal) => {
    try {
      if (courses.length === 0) setLoading(true)
      setError(null)
      const r = await fetchWithTimeout(API.TRAINER_COURSES.LIST, { headers: auth(), signal }, 12000)
      const d = await r.json().catch(() => ({}))
      if (d.success && Array.isArray(d.courses)) {
        setCourses(d.courses)
        try {
          sessionStorage.setItem(`trainer_courses_${user?.id || 'me'}`, JSON.stringify(d.courses))
        } catch (_) {}
      } else {
        throw new Error(d.error || 'Failed to load courses')
      }
    } catch (e) {
      if (e.name === 'AbortError') return
      console.error('Failed to load courses:', e.message)
      if (courses.length === 0) {
        setError(e.message || 'Failed to load courses')
        showError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchCourses(controller.signal)
    return () => controller.abort()
  }, [])

  // Assigned courses for current trainer
  const activeCourses = useMemo(() => {
    return courses || []
  }, [courses])

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

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedCourses = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safeCurrentPage, PAGE_SIZE])

  return (
    <div className="tmt-container">
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
            <div className="tmt-stat-value">{loading && courses.length === 0 ? '—' : stats.total}</div>
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
            <div className="tmt-stat-value">{loading && courses.length === 0 ? '—' : stats.published}</div>
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
            <div className="tmt-stat-value">{loading && courses.length === 0 ? '—' : stats.draft}</div>
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
            <div className="tmt-stat-value">{loading && courses.length === 0 ? '—' : stats.archived}</div>
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
            All <span className="tmt-pill-badge">{loading && courses.length === 0 ? '…' : stats.total}</span>
          </button>
          <button
            onClick={() => setStatusFilter('PUBLISHED')}
            className={`tmt-pill ${statusFilter === 'PUBLISHED' ? 'tmt-pill--active' : ''}`}
          >
            Published <span className="tmt-pill-badge">{loading && courses.length === 0 ? '…' : stats.published}</span>
          </button>
          <button
            onClick={() => setStatusFilter('DRAFT')}
            className={`tmt-pill ${statusFilter === 'DRAFT' ? 'tmt-pill--active' : ''}`}
          >
            Draft <span className="tmt-pill-badge">{loading && courses.length === 0 ? '…' : stats.draft}</span>
          </button>
          <button
            onClick={() => setStatusFilter('ARCHIVED')}
            className={`tmt-pill ${statusFilter === 'ARCHIVED' ? 'tmt-pill--active' : ''}`}
          >
            Archived <span className="tmt-pill-badge">{loading && courses.length === 0 ? '…' : stats.archived}</span>
          </button>
        </div>
      </div>

      {/* ── 4. Main Course Management Table Card ── */}
      <div className="tmt-courses-card">
        <div className="tmt-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 className="tmt-card-title">My Courses</h2>
            {activeCourses.length > 0 && (
              <div className="tmt-quick-jump">
                <button
                  type="button"
                  className="tmt-quick-jump-btn"
                  onClick={() => setQuickJumpOpen(prev => !prev)}
                >
                  <BookOpen size={14} color="#16A34A" />
                  <span>Select Course ({activeCourses.length})</span>
                  <ChevronDown size={14} style={{ transform: quickJumpOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }} />
                </button>

                <AnimatePresence>
                  {quickJumpOpen && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setQuickJumpOpen(false)} />
                      <motion.div
                        className="tmt-quick-jump-dropdown"
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                      >
                        <div className="tmt-quick-jump-search">
                          <Search size={13} color="#94A3B8" />
                          <input
                            type="text"
                            placeholder="Search all assigned courses..."
                            value={quickJumpSearch}
                            onChange={(e) => setQuickJumpSearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="tmt-quick-jump-list">
                          {activeCourses
                            .filter(c => !quickJumpSearch || (c.title || '').toLowerCase().includes(quickJumpSearch.toLowerCase()))
                            .map(c => (
                              <button
                                key={c.id}
                                type="button"
                                className="tmt-quick-jump-item"
                                onClick={() => {
                                  setQuickJumpOpen(false)
                                  onOpenCourse(c.id)
                                }}
                              >
                                <div className="tmt-quick-jump-thumb">
                                  <CourseArtwork title={c.title} category={c.category} />
                                </div>
                                <div className="tmt-quick-jump-info">
                                  <div className="tmt-quick-jump-title">{c.title}</div>
                                  <div className="tmt-quick-jump-meta">
                                    <span>{c.lessonCount || 0} Lessons</span>
                                    <span>·</span>
                                    <span style={{ color: c.status === 'PUBLISHED' ? '#16A34A' : '#64748B' }}>{c.status || 'PUBLISHED'}</span>
                                  </div>
                                </div>
                                <ChevronRight size={14} color="#94A3B8" />
                              </button>
                            ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
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
                paginatedCourses.map((course) => {
                  return (
                    <tr
                      key={course.id}
                      className="tmt-tr"
                      onClick={() => onOpenCourse(course.id)}
                    >
                      {/* COURSE COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-course-cell">
                          <div className="tmt-course-cell-thumb">
                            <CourseArtwork title={course.title} category={course.category} />
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
                          <span className="tmt-metric-val">{course.lessonCount || 0}</span>
                          <span className="tmt-metric-sub">Lessons</span>
                        </div>
                      </td>

                      {/* STUDENTS COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-metric-cell">
                          <span className="tmt-metric-val">{course.enrolledCount || 0}</span>
                          <span className="tmt-metric-sub">Students</span>
                        </div>
                      </td>

                      {/* UPDATED COLUMN */}
                      <td className="tmt-td">
                        <div className="tmt-metric-cell">
                          <span className="tmt-updated-val">{timeAgo(course.updatedAt || course.createdAt)}</span>
                          <span className="tmt-metric-sub">{course.programTitle || 'by Admin'}</span>
                        </div>
                      </td>

                      {/* ACTIONS COLUMN */}
                      <td className="tmt-td" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            className="tmt-table-action-btn"
                            aria-label="Course options"
                            onClick={() => setActionMenuOpen(actionMenuOpen === course.id ? null : course.id)}
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          <AnimatePresence>
                            {actionMenuOpen === course.id && (
                              <>
                                <div
                                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                  onClick={() => setActionMenuOpen(null)}
                                />
                                <motion.div
                                  className="tmt-action-dropdown"
                                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                  transition={{ duration: 0.12 }}
                                >
                                  <button
                                    className="tmt-action-dropdown-item"
                                    onClick={() => { setActionMenuOpen(null); onOpenCourse(course.id) }}
                                  >
                                    <Pencil size={13} /> Open Course Editor
                                  </button>
                                  <button
                                    className="tmt-action-dropdown-item"
                                    onClick={() => {
                                      setActionMenuOpen(null)
                                      const programId = course.trainingProgramId || course.id
                                      navigate(`/trainer/trainings/${programId}/leaderboard`)
                                    }}
                                  >
                                    <Trophy size={13} color="#16A34A" /> View Leaderboard
                                  </button>
                                  <button
                                    className="tmt-action-dropdown-item"
                                    onClick={() => {
                                      setActionMenuOpen(null)
                                      onOpenCourse(course.id)
                                    }}
                                  >
                                    <Users size={13} /> View Participants
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── 5. Pagination Bar ── */}
        <div className="tmt-pagination-bar">
          <span className="tmt-showing-text">
            {filtered.length === 0
              ? 'Showing 0 courses'
              : `Showing ${(safeCurrentPage - 1) * PAGE_SIZE + 1} to ${Math.min(filtered.length, safeCurrentPage * PAGE_SIZE)} of ${filtered.length} courses`}
          </span>
          <div className="tmt-page-controls">
            <button
              className="tmt-page-btn"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              &lt;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                className={`tmt-page-btn ${pageNum === safeCurrentPage ? 'tmt-page-btn--active' : ''}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              className="tmt-page-btn"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* ── Bulk Import Modal ── */}
      <AnimatePresence>
        {bulkImportOpen && (
          <motion.div
            className="wl-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 1000 }}
          >
            <motion.div
              className="wl-modal-card"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="wl-modal-title">Bulk Import Course Content</h2>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                Upload curriculum structure, lesson notes, or quiz questions via JSON or CSV.
              </p>
              <div style={{
                border: '2px dashed #E2E8F0',
                borderRadius: 14,
                padding: '32px 20px',
                textAlign: 'center',
                background: '#F8FAFC',
                cursor: 'pointer'
              }}>
                <Folder size={36} color="#8B5CF6" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Drop curriculum files here or click to browse</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Supports .json, .csv, .docx formats</div>
              </div>
              <div className="wl-modal-actions" style={{ marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setBulkImportOpen(false)}
                  className="wl-btn-secondary"
                  style={{ height: 42 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkImportOpen(false)
                    success('Bulk import template ready.')
                  }}
                  className="wl-btn-primary"
                  style={{ height: 42 }}
                >
                                Import Files
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CourseDetail({ user, courseId, onBack }) {
  const { error: showError, success } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentSection = searchParams.get('section') || 'structure'
  const [tab, setTab] = useState(currentSection)
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const auth = () => ({ Authorization: `Bearer ${user?.token || ''}` })

  useEffect(() => {
    const sec = searchParams.get('section')
    if (sec && sec !== tab) {
      setTab(sec)
    }
  }, [searchParams.get('section')])

  const handleTabSelect = (tabKey) => {
    setTab(tabKey)
    const next = new URLSearchParams(searchParams)
    next.set('section', tabKey)
    setSearchParams(next, { replace: true })
  }

  const fetchCourse = async (signal) => {
    try {
      setLoading(true)
      setError(null)
      const r = await fetchWithTimeout(API.TRAINER_COURSES.DETAIL(courseId), { headers: auth(), signal }, 12000)
      const d = await r.json().catch(() => ({}))
      if (signal?.aborted) return
      if (d.success && d.course) {
        setCourse(d.course)
        setError(null)
      } else {
        throw new Error(d.error || 'Failed to load course details')
      }
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) return
      console.error('CourseDetail fetch error:', e.message)
      setError(e.message || 'Failed to load course details')
      showError(e.message)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    setLoading(true)
    setCourse(null)
    setError(null)
    const controller = new AbortController()
    fetchCourse(controller.signal)
    return () => {
      controller.abort()
    }
  }, [courseId])

  if (loading || (!course && !error)) {
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

  if (error || !course) {
    return (
      <div className="wl-detail-page" style={{ padding: '48px 0' }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', display: 'grid', placeItems: 'center', color: '#EF4444' }}>
            <BookOpen size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>
              {error ? 'Unable to Load Course' : 'Course Not Found'}
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', maxWidth: 400, margin: '6px auto 0' }}>
              {error || 'The requested course could not be found or you do not have permission to view it.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={onBack}
              style={{ height: 38, padding: '0 16px', borderRadius: 8, fontSize: 13 }}
            >
              <ArrowLeft size={14} /> Back to Courses
            </button>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--primary"
              onClick={() => fetchCourse()}
              style={{ height: 38, padding: '0 18px', borderRadius: 8, fontSize: 13, background: '#16A34A' }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  const TABS = [
    { key: 'structure',    label: 'Structure',    icon: <Layers size={17} /> },
    { key: 'lessons',      label: 'Lessons',      icon: <FileText size={17} /> },
    { key: 'quizzes',      label: 'AI Quiz',      icon: <Sparkles size={17} /> },
    { key: 'coding',       label: 'Coding',       icon: <Code size={17} /> },
    { key: 'participants', label: 'Participants', icon: <Users size={17} /> },
    { key: 'analytics',    label: 'Analytics',    icon: <BarChart3 size={17} /> },
    { key: 'discussions',  label: 'Discussions',  icon: <MessageSquare size={17} /> },
  ]

  const statusClass = (course.status || 'PUBLISHED').toLowerCase()

  const heroStats = [
    { icon: FileText, label: 'Lessons', value: course?.lessonCount ?? 0, bg: '#EAF8F0', color: '#16A34A' },
    { icon: Sparkles, label: 'Quizzes', value: course?.quizCount ?? 0, bg: '#FFFBEB', color: '#D97706' },
    { icon: Users, label: 'Students', value: course?.enrolledCount ?? 0, bg: '#FAF5FF', color: '#8B5CF6' },
    { icon: Code, label: 'Coding', value: course?.codingCount ?? 0, bg: '#EFF6FF', color: '#2563EB' },
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
          <span style={{ color: '#16A34A', fontWeight: 600 }}>{course.title}</span>
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
            <span className={`wl-detail-status-badge wl-detail-status-badge--${statusClass}`}>
              {course.status || 'PUBLISHED'}
            </span>
          </div>
          <CourseArtwork title={course.title} category={course.category} />
        </div>

        {/* Right: Info */}
        <div className="wl-detail-hero-info">
          <div className="wl-detail-hero-top">
            <div className="wl-detail-hero-text">
              <h1 className="wl-detail-hero-title">{course.title}</h1>
              <div className="wl-detail-hero-category">
                {course.category || `${course.title} Course`}
              </div>
            </div>
            <button className="wl-detail-hero-more-btn" aria-label="More options">
              <MoreVertical size={18} />
            </button>
          </div>

          <p className="wl-detail-hero-desc">
            {course.description || `Comprehensive course on ${course.title} with structured modules, quizzes, and coding assessments.`}
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

          {/* Training Structure Completion Progress */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
            <TrainingProgressBar
              percentage={course.structureProgress?.completionPercentage ?? course.completionPercentage ?? 0}
              completedItems={course.structureProgress?.completedStructureItems ?? 0}
              totalItems={course.structureProgress?.totalStructureItems ?? 0}
              inProgressItems={course.structureProgress?.inProgressStructureItems ?? 0}
              hasStructure={course.structureProgress?.hasStructure ?? ((course.structureProgress?.totalStructureItems || 0) > 0)}
              title="Course Structure Completion"
              size="sm"
            />
          </div>
        </div>
      </motion.div>

      {/* ── Tab Navigation Bar ── */}
      <motion.div
        className="wl-detail-tabs"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="wl-detail-tabs-list">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabSelect(t.key)}
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
          {tab === 'structure' && (
            <div className="wl-detail-content wl-detail-content--full">
              <AIStructureGenerator
                user={user}
                courseId={courseId}
                onStructureSaved={fetchCourse}
              />
            </div>
          )}

          {tab === 'lessons' && <LessonsTab user={user} courseId={courseId} onCountChange={fetchCourse} setParentTab={setTab} />}
          {tab === 'quizzes' && <CourseQuizzesTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'coding' && <CourseCodingTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'participants' && <CourseParticipantsTab user={user} courseId={courseId} course={course} />}
          {tab === 'analytics' && <CourseAnalyticsTab user={user} courseId={courseId} />}
          {tab === 'discussions' && <DiscussionBoard user={user} trainingId={course.trainingProgramId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StructureTab({ course }) {
  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Course Structure</h2>
          <div className="wl-lessons-pills">
            <span className="wl-lessons-pill" style={{ background: '#f0fdfa', color: '#0D9488' }}>
              <span className="wl-lessons-pill-dot" style={{ background: '#0D9488' }} />
              Module
            </span>
          </div>
        </div>
      </div>
      <div className="wl-lessons-empty">
        <div className="wl-lessons-empty-icon">
          <BookOpen size={36} />
        </div>
        <h3>No learning content yet</h3>
        <p>Create your first module to start building this course.</p>
        <button className="wl-btn-primary">
          <Plus size={16} /> Add Module
        </button>
      </div>
    </div>
  )
}

function PlaceholderTab({ title, subtitle, icon }) {
  return (
    <div className="wl-lessons-surface">
      <div className="wl-lessons-empty">
        <div className="wl-lessons-empty-icon">
          {icon}
        </div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
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
  const confirm = useConfirm()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', content: '', status: 'PENDING' })
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

  const handleToggleLessonStatus = async (lesson, e) => {
    if (e) e.stopPropagation()
    const cycle = { PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING' }
    const nextStatus = cycle[lesson.status || 'PENDING'] || 'PENDING'

    // Optimistic UI update
    setLessons(prev => prev.map(item => item.id === lesson.id ? { ...item, status: nextStatus } : item))

    try {
      const r = await fetch(API.TRAINER_COURSES.UPDATE_LESSON_STATUS(courseId, lesson.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ status: nextStatus }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) throw new Error(d.error || 'Failed to update status')
      success(`Lesson marked as ${nextStatus.replace('_', ' ')}`)
      onCountChange?.()
    } catch (err) {
      showError(err.message)
      await fetchLessons()
    }
  }

  const openCreate = () => { setEditing(null); setForm({ title: '', description: '', content: '', status: 'PENDING' }); setShowModal(true) }
  const openEdit = (l) => { setEditing(l); setForm({ title: l.title || '', description: l.description || '', content: l.content || '', status: l.status || 'PENDING' }); setShowModal(true) }

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
    const ok = await confirm({
      title: 'Delete Lesson',
      message: `Are you sure you want to delete lesson "${l.title}"? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Lesson',
    })
    if (!ok) return
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

  const taxonomyPills = [
    { label: 'Module', bg: '#f0fdfa', fg: '#0D9488' },
    { label: 'Sub Module', bg: '#f0fdfa', fg: '#0D9488' },
    { label: 'Topic', bg: '#f0fdf4', fg: '#16a34a' },
    { label: 'Sub Topic', bg: '#fffbeb', fg: '#d97706' },
  ]

  return (
    <div className="wl-lessons-surface">
      {/* Header */}
      <div className="wl-lessons-header">
        <div className="wl-lessons-header-left">
          <h2 className="wl-lessons-title">Learning Content</h2>
          <p className="wl-lessons-subtitle">Manage your course structure.</p>
          <div className="wl-lessons-pills">
            {taxonomyPills.map(pill => (
              <span key={pill.label} className="wl-lessons-pill" style={{ background: pill.bg, color: pill.fg }}>
                <span className="wl-lessons-pill-dot" style={{ background: pill.fg }} />
                {pill.label}
              </span>
            ))}
          </div>
        </div>
        <button onClick={openCreate} className="wl-btn-primary">
          <Plus size={16} /> Add Module
        </button>
      </div>

      {/* Progress Header */}
      {lessons.length > 0 && (
        <div style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          {(() => {
            const completedCount = lessons.filter(l => l.status === 'COMPLETED').length
            const inProgressCount = lessons.filter(l => l.status === 'IN_PROGRESS').length
            const pct = lessons.length > 0 ? Number(((completedCount / lessons.length) * 100).toFixed(2)) : 0
            return (
              <TrainingProgressBar
                percentage={pct}
                completedItems={completedCount}
                totalItems={lessons.length}
                inProgressItems={inProgressCount}
                hasStructure={true}
                title="Learning Content Progress"
                size="sm"
              />
            )
          })()}
        </div>
      )}

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
            <Layers size={36} />
          </div>
          <h3>No learning content yet</h3>
          <p>Create your first module to start building this course.</p>
          <button onClick={openCreate} className="wl-btn-primary">
            <Plus size={16} /> Add Module
          </button>
        </div>
      ) : (
        <div className="wl-module-list">
          {lessons.map((l) => {
            const tax = getTaxonomyInfo(l.title);
            const isExpanded = !!expandedRows[l.id];
            const matCount = Object.values(l.materialCounts || {}).reduce((a, b) => a + b, 0);
            const status = l.status || 'PENDING';
            const statusConfig = {
              COMPLETED: { label: 'Completed', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
              IN_PROGRESS: { label: 'In Progress', bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
              PENDING: { label: 'Pending', bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' },
            }[status] || { label: 'Pending', bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' };

            return (
              <div key={l.id} className="wl-module-row">
                {/* Row Header */}
                <div className="wl-module-row-header" onClick={() => toggleRow(l.id)}>
                  <span className="wl-module-drag">
                    <GripVertical size={16} />
                  </span>
                  <span className={`wl-module-chevron${isExpanded ? ' wl-module-chevron--open' : ''}`}>
                    <ChevronRight size={16} />
                  </span>
                  <span className="wl-module-taxonomy" style={{ background: tax.bg, color: tax.fg }}>
                    {tax.label}
                  </span>
                  <span className="wl-module-title">{l.title}</span>

                  <button
                    type="button"
                    onClick={(e) => handleToggleLessonStatus(l, e)}
                    style={{
                      marginLeft: 'auto',
                      marginRight: 10,
                      background: statusConfig.bg,
                      color: statusConfig.text,
                      border: `1px solid ${statusConfig.border}`,
                      borderRadius: 9999,
                      padding: '2px 9px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title="Click to toggle status (Pending → In Progress → Completed)"
                  >
                    {status === 'COMPLETED' ? <CheckCircle2 size={11} /> : null}
                    {statusConfig.label}
                  </button>

                  <div className="wl-module-actions" onClick={(e) => e.stopPropagation()}>
                    <button title="Edit" onClick={() => openEdit(l)} className="wl-module-action-btn wl-module-action-btn--edit">
                      <Pencil size={14} />
                    </button>
                    <button title="Delete" onClick={() => remove(l)} className="wl-module-action-btn wl-module-action-btn--delete">
                      <Trash2 size={14} />
                    </button>
                    <button title="More" className="wl-module-action-btn wl-module-action-btn--more">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="wl-module-expanded">
                    {l.description && (
                      <p className="wl-module-description">{l.description}</p>
                    )}

                    {/* Materials Section */}
                    <div className="wl-module-section">
                      <div className="wl-module-section-left">
                        <Folder size={16} style={{ color: '#0D9488' }} />
                        <span className="wl-module-section-label">Learning Materials</span>
                        {matCount > 0 ? (
                          <span className="wl-module-section-count">({matCount})</span>
                        ) : (
                          <span className="wl-module-section-empty">No materials added yet</span>
                        )}
                      </div>
                      <div className="wl-module-section-btns">
                        <button onClick={() => setMaterialsFor({ id: l.id, title: l.title })} className="wl-btn-primary" style={{ height: 40, padding: '0 18px', fontSize: 13 }}>
                          <Plus size={14} /> Add/Manage Materials
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

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="wl-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.form
              onClick={(e) => e.stopPropagation()}
              onSubmit={submit}
              className="wl-modal-card"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            >
              <h2 className="wl-modal-title">
                {editing ? 'Edit Lesson / Module' : 'Create New Module'}
              </h2>

              <label className="wl-modal-label">Title <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Module 1: Introduction to Machine Learning"
                className="wl-modal-input"
                autoFocus
              />

              <label className="wl-modal-label">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief summary of the module content"
                rows={2}
                className="wl-modal-textarea"
              />

              <label className="wl-modal-label">Summary / Content (optional)</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Optional text details shown when viewing lesson content"
                rows={3}
                className="wl-modal-textarea"
              />

              <div className="wl-modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="wl-btn-secondary" style={{ height: 44 }}>
                  Cancel
                </button>
                <button type="submit" className="wl-btn-primary" style={{ height: 44 }}>
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

export default function TrainerCourses({ user, onLogout, onTabChange, initialCourseId }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // URL search params are the single source of truth for courseId.
  // Read from ?courseId= first, then fall back to location.state for backward compat.
  const urlCourseId = searchParams.get('courseId')
  const stateCourseId = location.state?.courseId

  const openCourseId = urlCourseId
    ? Number(urlCourseId)
    : (initialCourseId ? Number(initialCourseId) : null)

  // One-time migration: if location.state has a courseId but URL doesn't, sync it to URL
  useEffect(() => {
    if (stateCourseId && !urlCourseId) {
      const next = new URLSearchParams(searchParams)
      next.set('courseId', String(stateCourseId))
      setSearchParams(next, { replace: true })
    }
  }, [stateCourseId])

  const handleOpenCourse = (courseId) => {
    if (!courseId) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'courses')
    next.set('courseId', String(courseId))
    next.delete('lessonId')
    next.delete('subtab')
    setSearchParams(next, { replace: false })
  }

  const handleBack = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('courseId')
    next.delete('lessonId')
    next.delete('subtab')
    setSearchParams(next, { replace: false })
  }

  if (openCourseId) {
    return (
      <CourseDetail
        user={user}
        courseId={openCourseId}
        onBack={handleBack}
      />
    )
  }
  return <CoursesList user={user} onOpenCourse={handleOpenCourse} onLogout={onLogout} onTabChange={onTabChange} />
}

export { CoursesList, CourseDetail, LessonsTab, PlaceholderTab }
