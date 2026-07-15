import { motion } from 'framer-motion'
import { ArrowRight, Clock, Sparkles, RotateCcw, User } from 'lucide-react'
import {
  getFileMeta,
  formatDate,
  estimateLessonDuration,
  isLessonNew,
} from '../../../utils/fileTypes'

/**
 * LessonCard — premium SaaS lesson tile (2026-05-28 redesign v2).
 *
 *   ┌─────────────────────────────────────────┐
 *   │                                         │
 *   │   [softly tinted gradient banner]       │  ← color-keyed to file type
 *   │   [outlined giant icon, centered]       │
 *   │   [Type · Read-time chip top-right]     │
 *   │                                         │
 *   ├─────────────────────────────────────────┤
 *   │ [• New] / [↻ Continued] (optional pill) │  ← status row
 *   │ Lesson title — prominent 2-line clamp   │
 *   │ Description — 2 lines, muted            │
 *   │ ─────────────────────────────────────── │
 *   │ 👤 By Sriram               May 5, 2026  │  ← author + date
 *   │ [    Open lesson  →    ]                │  ← gradient on hover
 *   └─────────────────────────────────────────┘
 */
export default function LessonCard({ lesson, onOpen, index = 0, isContinued = false }) {
  const meta = getFileMeta(lesson)
  const { icon: Icon, label } = meta
  const duration = estimateLessonDuration(lesson)
  const isNew = isLessonNew(lesson)

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -5 }}
      className="ls-card"
    >
      {/* ── Banner ──────────────────────────────────────────────── */}
      <div
        className="ls-card__banner"
        style={{
          background:
            `linear-gradient(135deg, ${meta.bg}, rgba(255,255,255,0) 70%), ` +
            `linear-gradient(225deg, ${meta.bg}, rgba(255,255,255,0) 70%), ` +
            `linear-gradient(180deg, #ffffff 0%, ${meta.bg} 100%)`,
        }}
        aria-hidden
      >
        {/* Decorative grid dots */}
        <span className="ls-card__banner-dots" aria-hidden />

        {/* Big outlined icon centered */}
        <span className="ls-card__banner-icon" style={{ color: meta.color }}>
          <Icon size={42} strokeWidth={1.4} aria-hidden />
        </span>

        {/* Top-right meta strip on banner */}
        <div className="ls-card__banner-meta">
          <span
            className="ls-card__type-pill"
            style={{ color: meta.color, background: 'rgba(255,255,255,0.85)', borderColor: meta.bg }}
          >
            {label}
          </span>
          <span className="ls-card__time-pill">
            <Clock size={11} strokeWidth={2.25} aria-hidden />
            {duration.label}
          </span>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="ls-card__body">
        {/* Status row (only renders when there is something to show) */}
        {(isNew || isContinued) && (
          <div className="ls-card__status-row">
            {isContinued && (
              <span className="ls-card__status-pill ls-card__status-pill--continue">
                <RotateCcw size={10} strokeWidth={2.5} aria-hidden /> Continue
              </span>
            )}
            {isNew && (
              <span className="ls-card__status-pill ls-card__status-pill--new">
                <Sparkles size={10} strokeWidth={2.5} aria-hidden /> Just added
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h3 className="ls-card__title clamp-2" title={lesson.title}>
          {lesson.title}
        </h3>

        {/* Description */}
        {lesson.description && (
          <p className="ls-card__desc">{lesson.description}</p>
        )}

        {/* Hairline divider */}
        <div className="ls-card__divider" aria-hidden />

        {/* Author + date */}
        <div className="ls-card__meta">
          <span className="ls-card__author">
            <User size={11} strokeWidth={2.25} aria-hidden />
            {lesson.trainer?.name || 'Instructor'}
          </span>
          <span className="ls-card__date">
            {formatDate(lesson.created_at || lesson.createdAt)}
          </span>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => onOpen?.(lesson)}
          className="ls-card__cta"
        >
          <span>{isContinued ? 'Resume lesson' : 'Open lesson'}</span>
          <ArrowRight size={14} strokeWidth={2.25} className="ls-card__cta-arrow" aria-hidden />
        </button>
      </div>
    </motion.article>
  )
}
