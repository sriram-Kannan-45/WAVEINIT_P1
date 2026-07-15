import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Search, Plus, Pencil, Trash2,
  BookOpen, FileText, Users, BarChart3, Layers, Sparkles,
  CheckCircle2, AlertCircle, Folder, MessageSquare, Code,
  ChevronDown, ChevronRight, ChevronLeft, User, Calendar, Video, ArrowRight, Play, Eye, Star, Coffee, MoreVertical
} from 'lucide-react'
import { API, assetUrl, API_BASE } from '../api/api'
import { Button, Badge, Table, PageHeader, EmptyState, StatCard } from '../components/ui'

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

function getCourseArtwork(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('node') || t.includes('js') || t.includes('javascript')) {
    return {
      bg: 'url("https://images.unsplash.com/photo-1618477388954-7852f32655ec?q=80&w=600&auto=format&fit=crop") center/cover',
      pattern: '',
      icon: Code,
      accentColor: 'border-emerald-500',
      label: 'JavaScript / Node.js'
    }
  }
  if (t.includes('java') || t.includes('spring') || t.includes('backend')) {
    return {
      bg: 'url("https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=600&auto=format&fit=crop") center/cover',
      pattern: '',
      icon: Coffee,
      accentColor: 'border-amber-500',
      label: 'Java / Backend'
    }
  }
  if (t.includes('react') || t.includes('web') || t.includes('frontend') || t.includes('html') || t.includes('css')) {
    return {
      bg: 'url("https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=600&auto=format&fit=crop") center/cover',
      pattern: '',
      icon: Sparkles,
      accentColor: 'border-blue-500',
      label: 'Frontend / Web'
    }
  }
  if (t.includes('python') || t.includes('django') || t.includes('ml')) {
    return {
      bg: 'url("https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=600&auto=format&fit=crop") center/cover',
      pattern: '',
      icon: Code,
      accentColor: 'border-blue-700',
      label: 'Python / ML'
    }
  }
  return {
    bg: 'url("https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop") center/cover',
    pattern: '',
    icon: BookOpen,
    accentColor: 'border-slate-500',
    label: 'General Training'
  }
}

function patternOverlay() {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 14px)`,
  }
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

function CourseCover({ status, learners, artwork }) {
  const CardIcon = artwork?.icon || BookOpen
  const bg = artwork?.bg || 'linear-gradient(135deg, #334155, #64748b)'
  return (
    <div
      style={{
        height: 130, // Proportional height
        background: bg,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'rgba(255, 255, 255, 0.01)', 
          backdropFilter: 'blur(0.5px)' 
        }} 
      />
      <div className="absolute inset-0 pointer-events-none" style={patternOverlay()} />

      <div className="absolute top-3 left-3 z-10">
        <StatusBadge status={status} />
      </div>

      <div className="absolute top-3 right-3 z-10">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 700,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif'
          }}
        >
          <Users size={11} /> {learners || 0} {learners === 1 ? 'Learner' : 'Learners'}
        </span>
      </div>

      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
          zIndex: 5
        }}
      >
        <CardIcon size={30} style={{ color: '#FFFFFF', opacity: 0.95 }} />
      </div>
    </div>
  )
}

function TrainingCard({ course, artwork, onManage }) {
  return (
    <motion.div
      whileHover={{
        y: -6,
        scale: 1.02,
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)'
      }}
      onClick={() => onManage(course.id)}
      style={{
        height: 220,
        width: '100%',
        maxWidth: 360, // 30-35% size reduction, fits 3 in a row
        borderRadius: 20,
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.04), 0 2px 4px -1px rgba(15, 23, 42, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif'
      }}
    >
      <CourseCover
        status={course.status}
        learners={course.enrolledCount}
        artwork={artwork}
      />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 6 }}>
        {/* Technology Badge */}
        <span
          style={{
            alignSelf: 'flex-start',
            padding: '2px 8px',
            borderRadius: 6,
            background: '#F1F5F9',
            color: '#475569',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.025em',
            fontFamily: '"Plus Jakarta Sans", sans-serif'
          }}
        >
          {artwork?.label || 'General Training'}
        </span>

        {/* Course Title */}
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: '"Plus Jakarta Sans", sans-serif'
          }}
          title={course.title}
        >
          {course.title}
        </h3>
      </div>
    </motion.div>
  )
}

function SearchInput({ value, onChange }) {
  return (
    <div className="relative" style={{ flex: 1, maxWidth: 450, width: '100%' }}>
      <Search
        size={18}
        style={{
          position: 'absolute',
          left: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#9CA3AF',
          pointerEvents: 'none',
          zIndex: 10
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search courses..."
        style={{
          height: 48,
          width: '100%',
          borderRadius: 16,
          paddingLeft: '48px',
          paddingRight: '16px',
          fontSize: '14px',
          fontWeight: 400,
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          outline: 'none',
          fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif',
          boxSizing: 'border-box',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
        }}
        className="focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/10 transition-all outline-none"
      />
    </div>
  )
}

function FilterTabs({ active, onChange }) {
  const options = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED']
  const labelMap = { ALL: 'All', DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const isActive = active === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              height: 38,
              padding: '0 18px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isActive ? '#0D9488' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#6B7280',
              border: `1px solid ${isActive ? '#0D9488' : '#E5E7EB'}`,
              transition: 'all 200ms ease',
              fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
            className="hover:bg-slate-50 hover:text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2"
          >
            {labelMap[opt]}
          </button>
        )
      })}
    </div>
  )
}

function Pagination({ totalItems, itemsPerPage = 10, currentPage = 1 }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 48,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: 14,
      color: '#6B7280'
    }}>
      <div>
        Showing 1 to {totalItems} of {totalItems} courses
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          disabled
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            cursor: 'not-allowed'
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: '#0D9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 700,
            cursor: 'default'
          }}
        >
          1
        </button>
        <button
          disabled
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            cursor: 'not-allowed'
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function CoursesList({ user, onOpenCourse }) {
  const { error: showError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [programs, setPrograms] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCourse, setNewCourse] = useState({ title: '', description: '', trainingProgramId: '', status: 'DRAFT', thumbnailUrl: '' })
  
  // Feedback statistics
  const [feedbackStats, setFeedbackStats] = useState({
    avgRating: 0.0,
    totalFeedbacks: 0
  })

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchCourses = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.TRAINER_COURSES.LIST, { headers: auth() })
      const d = await r.json()
      console.log('DEBUG - API Response (/trainer/courses):', d)
      if (d.success) setCourses(d.courses || [])
      else showError(d.error || 'Failed to load courses')
    } catch (e) {
      console.error('DEBUG - fetchCourses error:', e.message)
      showError(e.message || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  const fetchFeedbacks = async () => {
    try {
      const r = await fetch(`${API_BASE}/trainer/feedbacks`, { headers: auth() })
      const d = await r.json()
      if (d.success) {
        setFeedbackStats({
          avgRating: d.averageTrainerRating || 0.0,
          totalFeedbacks: d.feedbacks?.length || 0
        })
      }
    } catch (e) {
      console.error('Failed to load feedbacks:', e.message)
    }
  }

  useEffect(() => {
    fetchCourses()
    fetchFeedbacks()

    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(`${API.TRAINER_COURSES.LIST.slice(0, -7)}programs`, { headers: auth() })
        const d = await r.json()
        if (!aborted && d.success) {
          setPrograms(d.programs || [])
        }
      } catch (e) {
        console.error('Failed to load programs:', e.message)
      }
    })()

    const handleOpenCreate = () => setShowCreateModal(true)
    window.addEventListener('open-create-course', handleOpenCreate)

    return () => {
      aborted = true
      window.removeEventListener('open-create-course', handleOpenCreate)
    }
  }, [])

  const handleCreateCourse = async (e) => {
    e.preventDefault()
    if (!newCourse.title.trim()) { showError('Title is required'); return }
    if (!newCourse.trainingProgramId) { showError('Training Program is required'); return }

    try {
      const r = await fetch(API.TRAINER_COURSES.LIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(newCourse),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Failed to create course'); return }
      success('Course created successfully!')
      setShowCreateModal(false)
      setNewCourse({ title: '', description: '', trainingProgramId: '', status: 'DRAFT', thumbnailUrl: '' })
      await fetchCourses()
    } catch (e) {
      showError(e.message)
    }
  }

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

  const totalEnrolled = useMemo(() => {
    return courses.reduce((sum, c) => sum + (c.enrolledCount || 0), 0)
  }, [courses])

  return (
    <div
      style={{
        maxWidth: 1440,
        margin: '0 auto',
        padding: '24px 28px 48px', // Horizontal reduced by 15%, vertical by 25%
        background: '#F8FAFC',
        minHeight: '100vh',
        fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif'
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
        <span>Home</span>
        <span>/</span>
        <span style={{ fontWeight: 600, color: '#111827' }}>Trainings</span>
      </div>

      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: '38px', // Premium 38px Title
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            letterSpacing: '-0.025em'
          }}
        >
          My Trainings
        </h1>
        <p
          style={{
            fontSize: '15px', // 15px Body font
            color: '#6B7280',
            margin: '8px 0 0',
            fontWeight: 500
          }}
        >
          Manage your assigned courses.
        </p>
      </div>

      {/* TrainingToolbar: Search + Filters + Create Button */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: 32 // Section gap 32px
        }}
        className="flex-col md:flex-row"
      >
        <SearchInput value={search} onChange={setSearch} />
        <FilterTabs active={statusFilter} onChange={setStatusFilter} />
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            height: 38, // Refined to small elegant 38px
            padding: '0 20px',
            background: 'linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 10, // 10px radius
            fontSize: 14, // 14px button text
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 200ms ease',
            fontFamily: '"Plus Jakarta Sans", "SF Pro Display", -apple-system, sans-serif',
            boxShadow: '0 2px 6px rgba(5,150,105,0.2)',
            outline: 'none'
          }}
          className="hover:scale-102 hover:shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2"
        >
          <Plus size={15} /> Create Training
        </button>
      </div>

      {/* Course Cards Grid - 3-Column Responsive Layout */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px] justify-items-center">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-[20px] overflow-hidden animate-pulse shadow-sm" style={{ height: 220, width: '100%', maxWidth: 360 }}>
              <div className="h-[130px] bg-slate-100" />
              <div className="p-5 space-y-2">
                <div className="h-4 bg-slate-100 rounded w-1/3" />
                <div className="h-6 bg-slate-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 px-6 border border-dashed border-slate-200 rounded-[20px] bg-white shadow-sm">
          <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            {courses.length === 0 ? 'No courses assigned yet' : 'No courses match your filters'}
          </h3>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: 0 }}>
            {courses.length === 0
              ? 'Ask your admin to assign you to a course under a Training Program.'
              : 'Try adjusting your search or status filter.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px] justify-items-center">
            {filtered.map((c) => (
              <TrainingCard
                key={c.id}
                course={c}
                artwork={getCourseArtwork(c.title)}
                onManage={onOpenCourse}
              />
            ))}
          </div>
          <Pagination totalItems={filtered.length} />
        </>
      )}

      {/* ── Create Course Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900">Create New Course</h3>
                <p className="text-sm text-slate-500 mt-1">Add a new training course to a program</p>
              </div>
              <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Course Title</label>
                  <input
                    type="text"
                    value={newCourse.title}
                    onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                    placeholder="e.g. Advanced React Architecture"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={newCourse.description}
                    onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                    placeholder="e.g. Master React performance tuning, custom hooks, and state engines."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Training Program</label>
                  <select
                    value={newCourse.trainingProgramId}
                    onChange={(e) => setNewCourse({ ...newCourse, trainingProgramId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a Program</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors">
                    Create Course
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
      <div style={{ padding: 24 }}>
        <div style={{ height: 40, width: 120, background: colors.slate[100], borderRadius: 8, marginBottom: 16 }} />
        <div style={{ height: 200, background: colors.slate[100], borderRadius: 12 }} />
      </div>
    )
  }
  if (!course) return null

  const TABS = [
    { key: 'structure',    label: 'Structure',    icon: <Layers size={16} /> },
    { key: 'lessons',      label: 'Lessons',      icon: <FileText size={16} /> },
    { key: 'quizzes',      label: 'AI Quiz',      icon: <Sparkles size={16} /> },
    { key: 'coding',       label: 'Coding',       icon: <Code size={16} /> },
    { key: 'participants', label: 'Participants', icon: <Users size={16} /> },
    { key: 'analytics',    label: 'Analytics',    icon: <BarChart3 size={16} /> },
    { key: 'discussions',  label: 'Discussions',  icon: <MessageSquare size={16} /> },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: 9999, fontSize: 13, fontWeight: 600, color: '#475569',
            cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <ArrowLeft size={14} /> My Trainings
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start"
      >
        {/* Left Side: Thumbnail (Horizontal 16:9 box) */}
        {(() => {
          const artwork = getCourseArtwork(course.title)
          const ArtIcon = artwork.icon || BookOpen
          return (
            <div style={{ position: 'relative', width: 220, height: 120, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{
                width: '100%', height: '100%',
                background: course.thumbnailUrl ? `url(${assetUrl(course.thumbnailUrl)}) center/cover` : artwork.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
              }}>
                {!course.thumbnailUrl && <ArtIcon size={36} style={{ opacity: 0.8 }} />}
              </div>
              {course.status && (
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: course.status === 'PUBLISHED' ? '#16a34a' : '#94a3b8',
                  color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5
                }}>
                  {course.status}
                </div>
              )}
            </div>
          )
        })()}

        {/* Right Side: Details */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.1 }}>
              {course.title}
            </h1>
            {course.status && (
              <span style={{
                display: 'inline-flex', padding: '2px 8px', borderRadius: 999,
                fontSize: 10, fontWeight: 700,
                background: '#dcfce7', color: '#166534',
                letterSpacing: 0.4, textTransform: 'uppercase'
              }}>
                {course.status}
              </span>
            )}
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', background: '#f8fafc', padding: '1px 4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              ID: {course.trainingProgramId || courseId}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 10 }}>
            <Folder size={14} />
            <span>{course.programTitle || 'General Training'}</span>
          </div>

          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
            {course.description || 'No description provided.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
            {[
              { icon: FileText, label: 'Lessons', value: course.lessonCount || 0, color: '#0D9488' },
              { icon: Sparkles, label: 'Quizzes', value: course.quizCount || 0, color: '#f59e0b' },
              { icon: Users, label: 'Enrolled', value: course.enrolledCount || 0, color: '#16a34a' },
            ].map((stat) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', fontWeight: 500 }}>
                <stat.icon size={16} style={{ color: stat.color }} />
                <span>{stat.value} {stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 8, marginBottom: 20 }}
      >
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-8 px-5 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2 ${
                tab === t.key ? '' : 'hover:bg-slate-100 hover:text-slate-700'
              }`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                background: tab === t.key ? '#0D9488' : 'transparent',
                color: tab === t.key ? '#fff' : '#64748b',
                outline: 'none'
              }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === 'structure'    && <StructureTab course={course} />}
          {tab === 'lessons'      && <LessonsTab user={user} courseId={courseId} onCountChange={fetchCourse} setParentTab={setTab} />}
          {tab === 'quizzes'      && <CourseQuizzesTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'coding'       && <CourseCodingTab user={user} courseId={courseId} onCountChange={fetchCourse} />}
          {tab === 'participants' && <CourseParticipantsTab user={user} courseId={courseId} />}
          {tab === 'analytics'    && <CourseAnalyticsTab user={user} courseId={courseId} />}
          {tab === 'discussions'  && <DiscussionBoard user={user} trainingId={course.trainingProgramId} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
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
