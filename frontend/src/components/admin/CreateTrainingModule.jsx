import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Trash2, X } from 'lucide-react'
import { PageHeader } from '../ui'
import '../../styles/create-training.css'

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-'

function RecentSkeleton({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ct-skel">
          <div className="ct-skel__line" />
          <div className="ct-skel__line ct-skel__line--short" />
        </div>
      ))}
    </div>
  )
}

function TrainerPicker({ trainers, selectedIds, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return trainers
    return trainers.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q)
    )
  }, [trainers, query])

  const toggle = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  const remove = (id) => onChange(selectedIds.filter(x => x !== id))

  return (
    <div className="ct-picker" ref={rootRef}>
      <div
        className="ct-picker__box"
        onClick={() => { inputRef.current?.focus(); setOpen(true) }}
      >
        {selectedIds.map(id => {
          const t = trainers.find(x => x.id === id)
          if (!t) return null
          return (
            <span key={id} className="ct-picker__chip">
              <span className="ct-picker__chip-text">{t.name}</span>
              <button
                type="button"
                className="ct-picker__chip-x"
                aria-label={`Remove ${t.name}`}
                onClick={(e) => { e.stopPropagation(); remove(id) }}
              >
                <X size={12} />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          id="ct-trainers"
          className="ct-picker__input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selectedIds.length ? 'Add more trainers...' : 'Search trainers by name or email...'}
          autoComplete="off"
        />
      </div>
      <span className="ct-picker__caret" aria-hidden="true"><ChevronDown size={18} /></span>

      {open && (
        <div className="ct-picker__dropdown" role="listbox" aria-label="Assign trainers">
          {filtered.length === 0 ? (
            <div className="ct-picker__empty">No trainers match your search.</div>
          ) : filtered.map(t => {
            const checked = selectedIds.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={checked}
                className={`ct-picker__option${checked ? ' ct-picker__option--selected' : ''}`}
                onClick={() => toggle(t.id)}
              >
                <span className="ct-picker__check" aria-hidden="true">{checked && <Check size={13} />}</span>
                <span className="ct-picker__option-main">
                  <span className="ct-picker__option-name">{t.name}</span>
                  <span className="ct-picker__option-mail">{t.email}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CreateTrainingModule({
  trainers = [],
  trainings = [],
  form,
  onFormChange,
  onSubmit,
  onEdit,
  onDelete,
  loading = false,
  initialLoading = false,
  onBack,
}) {
  const set = (key) => (e) => onFormChange(p => ({ ...p, [key]: e.target.value }))

  const setTrainerIds = (ids) => onFormChange(p => ({ ...p, trainerIds: ids, trainerId: ids[0] || '' }))

  return (
    <div className="ct-page">
      <PageHeader
        title="Create Training"
        subtitle="Set up a new training session and review your recent sessions"
        onBack={onBack}
      />

      <div className="ct-grid">
        {/* ── Create Training Form ─────────────────────────────── */}
        <section className="ct-card" aria-label="Create training session">
          <div className="ct-card__head">
            <div>
              <h3 className="ct-card__title">Create Training Session</h3>
              <p className="ct-card__sub">Add a new session to the platform</p>
            </div>
          </div>

          <form className="ct-form" onSubmit={onSubmit}>
            <div className="ct-field ct-field--full">
              <label className="ct-label" htmlFor="ct-title">Training Title</label>
              <input
                id="ct-title"
                className="ct-input"
                type="text"
                value={form.title}
                onChange={set('title')}
                required
                placeholder="e.g. React Fundamentals"
              />
            </div>

            <div className="ct-field ct-field--full">
              <label className="ct-label" htmlFor="ct-desc">Description</label>
              <textarea
                id="ct-desc"
                className="ct-input ct-input--area"
                value={form.description}
                onChange={set('description')}
                placeholder="Training objectives and content overview..."
              />
            </div>

            <div className="ct-field ct-field--full">
              <label className="ct-label" htmlFor="ct-trainers">Assign Trainer(s)</label>
              <TrainerPicker
                trainers={trainers}
                selectedIds={Array.isArray(form.trainerIds) ? form.trainerIds : []}
                onChange={setTrainerIds}
              />
            </div>

            <div className="ct-field ct-field--full">
              <label className="ct-check-row">
                <input
                  type="checkbox"
                  className="ct-check"
                  checked={!!form.sequentialLearning}
                  onChange={(e) => onFormChange(p => ({ ...p, sequentialLearning: e.target.checked }))}
                />
                <span className="ct-check-text">Enable Sequential Learning Lock</span>
              </label>
            </div>

            <div className="ct-field">
              <label className="ct-label" htmlFor="ct-start">Start Date &amp; Time</label>
              <div className="ct-date">
                <input
                  id="ct-start"
                  className="ct-input"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={set('startDate')}
                  required
                />
              </div>
            </div>

            <div className="ct-field">
              <label className="ct-label" htmlFor="ct-end">End Date &amp; Time</label>
              <div className="ct-date">
                <input
                  id="ct-end"
                  className="ct-input"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={set('endDate')}
                  required
                />
              </div>
            </div>

            <div className="ct-field">
              <label className="ct-label" htmlFor="ct-cap">Capacity</label>
              <input
                id="ct-cap"
                className="ct-input"
                type="number"
                value={form.capacity}
                onChange={set('capacity')}
                placeholder="e.g. 30"
                min="1"
              />
            </div>

            <div className="ct-actions">
              <button type="submit" className="ct-btn ct-btn--primary" disabled={loading}>
                {loading && <span className="ct-btn__spin" aria-hidden="true" />}
                {loading ? 'Creating...' : 'Create Training Session'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Recent Trainings ─────────────────────────────────── */}
        <section className="ct-card ct-card--recent" aria-label="Recent trainings">
          <div className="ct-card__head">
            <div>
              <h3 className="ct-card__title">Recent Trainings</h3>
              <p className="ct-card__sub">{trainings.length} session{trainings.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          {initialLoading ? (
            <RecentSkeleton />
          ) : trainings.length === 0 ? (
            <div className="ct-empty">
              <span className="ct-empty__icon" role="img" aria-hidden="true">📘</span>
              <p className="ct-empty__title">No training sessions yet</p>
              <p className="ct-empty__text">Create your first training session to get started.</p>
            </div>
          ) : (
            <ul className="ct-recent">
              {trainings.slice(0, 10).map(t => (
                <li key={t.id} className="ct-recent__item">
                  <div className="ct-recent__main">
                    <p className="ct-recent__title" title={t.title}>{t.title}</p>
                    <div className="ct-recent__meta">
                      <span className={`ct-badge ${t.trainerName ? 'ct-badge--info' : 'ct-badge--neutral'}`}>
                        {t.trainerName || 'Unassigned'}
                      </span>
                      <span className="ct-recent__dates">
                        {fmtDateTime(t.startDate)} — {fmtDateTime(t.endDate)}
                      </span>
                    </div>
                  </div>
                  <div className="ct-recent__actions">
                    <button type="button" className="ct-btn ct-btn--secondary ct-btn--sm" onClick={() => onEdit(t)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button type="button" className="ct-btn ct-btn--danger ct-btn--sm" onClick={() => onDelete(t.id, t.title)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
