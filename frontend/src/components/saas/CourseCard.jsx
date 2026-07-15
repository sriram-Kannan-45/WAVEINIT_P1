import { motion } from 'framer-motion'
import { BookOpen, Sparkles, Users, MoreVertical, Folder } from 'lucide-react'
import { colors } from '../../theme/tokens'
import StatusBadge from './StatusBadge'
import ProgressBar from './ProgressBar'
import ActionButton from './ActionButton'

function patternOverlay() {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 14px)`,
  }
}

export default function CourseCard({ course, artwork, onManage, onPreview, onMore }) {
  const CardIcon = artwork?.icon || BookOpen
  const bg = artwork?.bg || 'linear-gradient(135deg, #334155, #64748b)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{
        y: -4,
        scale: 1.015,
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)'
      }}
      style={{
        borderRadius: '20px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'default',
        overflow: 'hidden',
        transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Banner Cover (Gradient) */}
      <div
        className="relative flex items-center justify-center text-white overflow-hidden"
        style={{ height: 130, background: bg, flexShrink: 0 }}
      >
        <div className="absolute inset-0 pointer-events-none" style={patternOverlay()} />

        {/* Top-left status badge */}
        <div className="absolute top-4 left-4 z-10">
          <StatusBadge status={course.status} />
        </div>

        {/* Top-right learner count badge (dark glass) */}
        <div
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full text-white text-[11px] font-semibold"
          style={{ 
            padding: '4px 12px', 
            background: 'rgba(15, 23, 42, 0.6)', 
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <Users size={12} />
          {course.enrolledCount || 0} Learners
        </div>

        {/* Center technology logo with glass effect */}
        <div
          className="relative z-10 flex items-center justify-center rounded-2xl"
          style={{
            width: 52,
            height: 52,
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          }}
        >
          <CardIcon size={26} style={{ color: '#fff' }} />
        </div>
      </div>

      {/* Body Area with 24px padding */}
      <div className="flex flex-col flex-1" style={{ padding: '24px', minHeight: 0 }}>
        {/* Title (20px Card Title) */}
        <h3 className="font-bold line-clamp-1" style={{ color: '#0f172a', fontSize: '20px', margin: 0, letterSpacing: '-0.02em' }}>
          {course.title}
        </h3>

        {/* Category (13px Caption) */}
        <div className="flex items-center gap-1.5 mt-1">
          <Folder size={12} className="text-slate-400" />
          <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            {course.programTitle || 'General Training'}
          </span>
        </div>

        {/* Short Description (15px Body) */}
        <p className="line-clamp-2" style={{ color: '#475569', fontSize: '15px', fontWeight: 400, margin: '12px 0 0', lineHeight: 1.5 }}>
          {course.description || 'No description provided.'}
        </p>

        {/* Statistics Row (13px Caption) */}
        <div className="flex items-center gap-4 mt-4" style={{ color: '#6b7280', fontSize: '13px' }}>
          <div className="flex items-center gap-1.5 font-medium">
            <BookOpen size={14} style={{ color: '#6366f1' }} />
            <span>{course.lessonCount || 0} Lessons</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <Sparkles size={14} style={{ color: '#f59e0b' }} />
            <span>{course.quizCount || 0} Quizzes</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <Users size={14} style={{ color: '#10b981' }} />
            <span>{course.enrolledCount || 0} Enrolled</span>
          </div>
        </div>

        {/* Progress Bar (dense layout) */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>Progress</span>
            <span style={{ color: '#0f172a', fontSize: '13px', fontWeight: 700 }}>{course.progress || 0}%</span>
          </div>
          <ProgressBar value={course.progress || 0} />
        </div>

        {/* Footer Quick Actions */}
        <div className="flex items-center gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
          <ActionButton variant="primary" fullWidth height={40} radius={10} onClick={() => onManage(course.id)}>
            Manage
          </ActionButton>
          <ActionButton variant="secondary" height={40} radius={10} onClick={() => onPreview(course.id)}>
            Preview
          </ActionButton>
          <ActionButton
            variant="icon"
            square
            height={40}
            radius={10}
            ariaLabel="More options"
            onClick={() => onMore && onMore(course.id)}
            icon={MoreVertical}
          />
        </div>
      </div>
    </motion.div>
  )
}

