import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, GraduationCap, Loader2, Pencil, Trash2, X } from 'lucide-react'

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
const selectStyle = { ...inputStyle, appearance: 'none', background: '#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 10px center', paddingRight: 30 }

const cardHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '16px 20px',
  borderBottom: '1px solid #e2e8f0',
}

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-'

const getTrainingStatus = (t) => {
  const now = new Date()
  const start = t.startDate ? new Date(t.startDate) : null
  const end = t.endDate ? new Date(t.endDate) : null
  if (start && now < start) return 'UPCOMING'
  if (end && now > end) return 'COMPLETED'
  return 'ACTIVE'
}

const STATUS_STYLES = {
  ACTIVE: { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
  UPCOMING: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  COMPLETED: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
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
    <div style={{ position: 'relative', minWidth: 0 }} ref={rootRef}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          padding: '8px 40px 8px 12px',
          border: `1px solid ${open ? '#16A34A' : '#e2e8f0'}`,
          borderRadius: 8,
          background: '#fff',
          cursor: 'text',
          boxSizing: 'border-box',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          ...(open && { boxShadow: '0 0 0 3px rgba(22, 163, 74, 0.15)' }),
        }}
        onClick={() => { inputRef.current?.focus(); setOpen(true) }}
      >
        {selectedIds.map(id => {
          const t = trainers.find(x => x.id === id)
          if (!t) return null
          return (
            <span key={id} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f0fdf4',
              color: '#15803D',
              border: '1px solid #bbf7d0',
              borderRadius: '9999px',
              padding: '3px 8px 3px 10px',
              fontSize: 12,
              fontWeight: 600,
              maxWidth: '100%',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              <span style={{ overflowWrap: 'anywhere' }}>{t.name}</span>
              <button
                type="button"
                aria-label={`Remove ${t.name}`}
                onClick={(e) => { e.stopPropagation(); remove(id) }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  border: 'none',
                  borderRadius: '50%',
                  background: 'rgba(21, 128, 61, 0.12)',
                  color: '#15803D',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(21, 128, 61, 0.22)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(21, 128, 61, 0.12)' }}
              >
                <X size={12} />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selectedIds.length ? 'Add more trainers...' : 'Search trainers by name or email...'}
          autoComplete="off"
          style={{
            flex: '1 1 120px',
            minWidth: 120,
            height: 30,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            color: '#111827',
            padding: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        />
      </div>
      <span style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#94a3b8',
        pointerEvents: 'none',
        display: 'flex',
      }} aria-hidden="true">
        <ChevronDown size={18} />
      </span>

      {open && (
        <div
          role="listbox"
          aria-label="Assign trainers"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
            maxHeight: 240,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: '16px 12px',
              textAlign: 'center',
              fontSize: 13,
              color: '#94a3b8',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              No trainers match your search.
            </div>
          ) : filtered.map(t => {
            const checked = selectedIds.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  background: checked ? '#f0fdf4' : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: '#111827',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = checked ? '#f0fdf4' : '#f8fafc' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = checked ? '#f0fdf4' : 'transparent' }}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: `1px solid ${checked ? '#16A34A' : '#e2e8f0'}`,
                  background: checked ? '#16A34A' : '#fff',
                  color: '#fff',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }} aria-hidden="true">
                  {checked && <Check size={13} />}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#64748b', overflowWrap: 'anywhere' }}>{t.email}</span>
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
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
          <CalendarDays size={22} color="#fff" />
        </div>
        <div>
          <h2 className="reg-admin-title">Create Training</h2>
          <p className="reg-admin-subtitle">Set up a new training session and review your recent sessions</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Trainings
        </button>
      </div>

      <div className="interview-form-grid" style={{ alignItems: 'start' }}>
        {/* ── Create Training Form ─────────────────────────────────────── */}
        <div className="reg-admin-table-wrap">
          <div style={cardHeaderStyle}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Create Training Session</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Add a new session to the platform</div>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <form onSubmit={onSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={labelStyle}>Training Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. React Fundamentals"
                    value={form.title}
                    onChange={set('title')}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    rows={4}
                    placeholder="Training objectives and content overview..."
                    value={form.description}
                    onChange={set('description')}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Assign Trainer(s)</label>
                  <TrainerPicker
                    trainers={trainers}
                    selectedIds={Array.isArray(form.trainerIds) ? form.trainerIds : []}
                    onChange={setTrainerIds}
                  />
                </div>

                <div className="interview-form-grid">
                  <div>
                    <label style={labelStyle}>Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={form.startDate}
                      onChange={set('startDate')}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={form.endDate}
                      onChange={set('endDate')}
                      style={inputStyle}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Capacity</label>
                  <input
                    type="number"
                    value={form.capacity}
                    onChange={set('capacity')}
                    placeholder="e.g. 30"
                    min="1"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    className={`interview-toggle ${form.sequentialLearning ? 'interview-toggle--active' : ''}`}
                    onClick={() => onFormChange(p => ({ ...p, sequentialLearning: !p.sequentialLearning }))}
                  >
                    <div className="interview-toggle-knob" />
                  </button>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Enable Sequential Learning Lock</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Participants must complete each module before moving to the next</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack} style={{ flex: '0 0 auto' }}>
                    Cancel
                  </button>
                  <div style={{ flex: 1 }} />
                  <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading}>
                    {loading ? <><Loader2 size={14} className="reg-spin" /> Creating...</> : 'Create Training Session'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* ── Recent Trainings ─────────────────────────────────────────── */}
        <div className="reg-admin-table-wrap">
          <div style={cardHeaderStyle}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Recent Trainings</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>View, edit or remove recent sessions</div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: '999px',
              background: '#f0fdf4',
              color: '#15803D',
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {trainings.length} session{trainings.length === 1 ? '' : 's'}
            </span>
          </div>

          {initialLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainings...</p></div>
          ) : trainings.length === 0 ? (
            <div className="reg-admin-empty">
              <GraduationCap size={40} />
              <h3>No Training Sessions Yet</h3>
              <p>Create your first training session using the form.</p>
            </div>
          ) : (
            <div>
              {trainings.slice(0, 10).map(t => {
                const status = getTrainingStatus(t)
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        color: '#111827',
                        fontSize: 13,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }} title={t.title}>
                        {t.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span className="reg-admin-status" style={STATUS_STYLES[status]}>{status}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{t.trainerName || 'Unassigned'}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDateTime(t.startDate)} — {fmtDateTime(t.endDate)}</span>
                      </div>
                    </div>
                    <div className="reg-admin-actions">
                      <button type="button" className="reg-admin-action" title="Edit Training" aria-label={`Edit ${t.title}`} onClick={() => onEdit(t)}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="reg-admin-action reg-admin-action--reject" title="Delete Training" aria-label={`Delete ${t.title}`} onClick={() => onDelete(t.id, t.title)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
