import { useEffect, useMemo, useState } from 'react'
import { Search, X, BookOpen, Sparkles, History, ArrowRight } from 'lucide-react'
import { API_BASE } from '../../../api/api'
import { getAuthHeaders } from '../../../api/request'
import { FILTER_FACETS, isLessonNew, getFileMeta, estimateLessonDuration } from '../../../utils/fileTypes'
import LessonCard from './LessonCard'
import LessonViewer from './LessonViewer'
import { useContinueLearning } from '../../../hooks/useContinueLearning'

/**
 * LessonsSection — student's library of approved learning resources.
 *
 * 2026-05-28 redesign v2 — premium AI-powered learning experience.
 *
 *   • Hero header with stats strip (total / new / continued)
 *   • "Continue learning" rail (real data via useContinueLearning)
 *   • Glassmorphism filter bar (search + segmented type pills)
 *   • Rich lesson card grid with banner, read-time, status pills
 *
 * Backend contract unchanged: GET /api/notes (approved-only for participants).
 */
export default function LessonsSection() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [facet, setFacet] = useState('ALL')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(null)
  const { items: recentItems, track } = useContinueLearning()

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError('')
      try {
        const res = await fetch(`${API_BASE}/notes`, { headers: getAuthHeaders() })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load lessons')
        if (!cancelled) setLessons(data.notes || [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => {
    const c = {}
    FILTER_FACETS.forEach((f) => { c[f.key] = lessons.filter(f.match).length })
    return c
  }, [lessons])

  const filtered = useMemo(() => {
    const f = FILTER_FACETS.find((x) => x.key === facet) || FILTER_FACETS[0]
    const q = search.trim().toLowerCase()
    return lessons.filter((l) => {
      if (!f.match(l)) return false
      if (!q) return true
      return (
        l.title?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.fileName?.toLowerCase().includes(q) ||
        l.trainer?.name?.toLowerCase().includes(q)
      )
    })
  }, [lessons, facet, search])

  // Recent lessons from the continue-learning store, joined to live lesson rows.
  const recentLessonIds = useMemo(
    () => new Set(recentItems.filter((r) => r.type === 'lesson').map((r) => r.id)),
    [recentItems]
  )
  const recentLessons = useMemo(() => {
    if (!recentLessonIds.size || !lessons.length) return []
    // Preserve recentItems order
    const byId = new Map(lessons.map((l) => [l.id, l]))
    return recentItems
      .filter((r) => r.type === 'lesson' && byId.has(r.id))
      .map((r) => byId.get(r.id))
      .slice(0, 4)
  }, [lessons, recentItems, recentLessonIds])

  const newCount = useMemo(() => lessons.filter(isLessonNew).length, [lessons])

  const openLesson = (lesson) => {
    setActive(lesson)
    track({
      type: 'lesson',
      id: lesson.id,
      title: lesson.title,
      subtitle: lesson.trainer?.name ? `By ${lesson.trainer.name}` : undefined,
    })
  }

  const visibleFacets = FILTER_FACETS.filter(
    (f) => f.key === 'ALL' || (counts[f.key] || 0) > 0
  )

  return (
    <div className="ls-shell">
      {/* ─── Hero header ───────────────────────────────────────────── */}
      <header className="ls-hero">
        <span className="ls-hero__bloom" aria-hidden />
        <div className="ls-hero__inner">
          <div className="ls-hero__text">
            <span className="ls-hero__kicker">
              <Sparkles size={11} strokeWidth={2.5} aria-hidden /> Knowledge library
            </span>
            <h1 className="ls-hero__title">Lessons</h1>
            <p className="ls-hero__subtitle">
              Curated learning resources from your instructors. Browse, search, and resume where you left off.
            </p>
          </div>

          {!loading && lessons.length > 0 && (
            <div className="ls-hero__stats" role="list">
              <div className="ls-hero__stat">
                <span className="ls-hero__stat-value mono">{lessons.length}</span>
                <span className="ls-hero__stat-label">Total</span>
              </div>
              <span className="ls-hero__stat-divider" aria-hidden />
              <div className="ls-hero__stat">
                <span className="ls-hero__stat-value mono">{newCount}</span>
                <span className="ls-hero__stat-label">New</span>
              </div>
              <span className="ls-hero__stat-divider" aria-hidden />
              <div className="ls-hero__stat">
                <span className="ls-hero__stat-value mono">{recentLessons.length}</span>
                <span className="ls-hero__stat-label">In progress</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ─── Continue learning rail ─────────────────────────────────── */}
      {!loading && recentLessons.length > 0 && (
        <section className="ls-rail" aria-label="Continue learning">
          <div className="ls-rail__head">
            <h2 className="ls-rail__title">
              <History size={15} strokeWidth={2.25} aria-hidden /> Continue learning
            </h2>
            <span className="ls-rail__count mono">{recentLessons.length} recent</span>
          </div>
          <div className="ls-rail__row">
            {recentLessons.map((lesson) => {
              const meta = getFileMeta(lesson)
              const dur = estimateLessonDuration(lesson)
              const Icon = meta.icon
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => openLesson(lesson)}
                  className="ls-rail-card"
                >
                  <span
                    className="ls-rail-card__icon"
                    style={{ color: meta.color, background: meta.bg }}
                    aria-hidden
                  >
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <div className="ls-rail-card__body">
                    <span className="ls-rail-card__title">{lesson.title}</span>
                    <span className="ls-rail-card__meta">
                      {meta.label} · {dur.label}
                    </span>
                  </div>
                  <ArrowRight size={14} strokeWidth={2.25} className="ls-rail-card__arrow" aria-hidden />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ─── Filter bar ────────────────────────────────────────────── */}
      {!loading && lessons.length > 0 && (
        <section className="ls-filters" aria-label="Filter lessons">
          <div className="ls-search">
            <Search size={15} className="ls-search__icon" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lessons by title, instructor, or content…"
              aria-label="Search lessons"
              className="ls-search__input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="ls-search__clear"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="ls-pills" role="group" aria-label="Filter by type">
            {visibleFacets.map((f) => {
              const active = facet === f.key
              const count = counts[f.key] || 0
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFacet(f.key)}
                  aria-pressed={active}
                  className="ls-filter-pill"
                  data-active={active ? 'true' : 'false'}
                >
                  <span>{f.label}</span>
                  <span className="ls-filter-pill__count mono">{count}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ─── Loading skeleton grid ─────────────────────────────────── */}
      {loading && lessons.length === 0 && (
        <div className="ls-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="ls-card">
              <div className="skeleton" style={{ height: 88, borderRadius: 0, marginBottom: 0 }} />
              <div className="ls-card__body">
                <div className="skeleton" style={{ height: 18, width: '85%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 14, width: '95%', marginBottom: 4 }} />
                <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 1, width: '100%', marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 12, width: '100%', marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 40, width: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty (no lessons at all) ─────────────────────────────── */}
      {!loading && lessons.length === 0 && !error && (
        <div className="ls-empty">
          <div className="ls-empty__icon" aria-hidden>
            <BookOpen size={26} />
          </div>
          <h3 className="ls-empty__title">No lessons yet</h3>
          <p className="ls-empty__desc">
            Your instructors will publish lessons here. Check back soon.
          </p>
        </div>
      )}

      {/* ─── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div className="ls-error" role="alert">
          {error}
        </div>
      )}

      {/* ─── Cards grid ────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="ls-grid">
          {filtered.map((lesson, i) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={openLesson}
              index={i}
              isContinued={recentLessonIds.has(lesson.id)}
            />
          ))}
        </div>
      )}

      {/* ─── No filter match ───────────────────────────────────────── */}
      {!loading && filtered.length === 0 && lessons.length > 0 && (
        <div className="ls-empty ls-empty--inline">
          <p className="ls-empty__desc">No lessons match your filters.</p>
        </div>
      )}

      <LessonViewer lesson={active} onClose={() => setActive(null)} />
    </div>
  )
}
