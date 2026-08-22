import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, Loader2, X } from 'lucide-react'

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }
const inputStyle = { width: '100%', height: 40, padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }

const cardHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 20px',
  borderBottom: '1px solid #e2e8f0',
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
          minHeight: 40,
          padding: '4px 36px 4px 10px',
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
              gap: 5,
              background: '#f0fdf4',
              color: '#15803D',
              border: '1px solid #bbf7d0',
              borderRadius: '9999px',
              padding: '2px 6px 2px 8px',
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
                  width: 14,
                  height: 14,
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
                <X size={10} />
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
            height: 28,
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
        right: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#94a3b8',
        pointerEvents: 'none',
        display: 'flex',
      }} aria-hidden="true">
        <ChevronDown size={16} />
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
            maxHeight: 200,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: '12px 10px',
              textAlign: 'center',
              fontSize: 12.5,
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
                  gap: 8,
                  width: '100%',
                  padding: '7px 10px',
                  border: 'none',
                  background: checked ? '#f0fdf4' : 'transparent',
                  borderRadius: 6,
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
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1px solid ${checked ? '#16A34A' : '#e2e8f0'}`,
                  background: checked ? '#16A34A' : '#fff',
                  color: '#fff',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }} aria-hidden="true">
                  {checked && <Check size={11} />}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{t.name}</span>
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
  form,
  onFormChange,
  onSubmit,
  loading = false,
  onBack,
}) {
  const set = (key) => (e) => onFormChange(p => ({ ...p, [key]: e.target.value }))
  const setTrainerIds = (ids) => onFormChange(p => ({ ...p, trainerIds: ids, trainerId: ids[0] || '' }))

  return (
    <div className="reg-admin" style={{ paddingBottom: 0 }}>
      <div style={{ maxWidth: 920, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div className="reg-admin-header">
          <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
            <CalendarDays size={26} color="#16A34A" />
          </div>
          <div>
            <h2 className="reg-admin-title">Create Training</h2>
            <p className="reg-admin-subtitle">Set up a new training session</p>
          </div>
          <div style={{ flex: 1 }} />
          <button className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack} style={{ height: 42, padding: '0 16px', fontSize: 13, borderRadius: 10 }}>
            <ArrowLeft size={15} /> Back to Trainings
          </button>
        </div>

        {/* ── Single Centered Form Card ─────────────────────────────────────── */}
        <div className="reg-admin-table-wrap">
          <div style={cardHeaderStyle}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>Create Training Session</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>Fill in the session details below</div>
            </div>
          </div>
          <div style={{ padding: '16px 22px' }}>
            <form onSubmit={onSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    rows={2}
                    placeholder="Training objectives and content overview..."
                    value={form.description}
                    onChange={set('description')}
                    style={{ ...inputStyle, height: 68, minHeight: 68, padding: '8px 12px', resize: 'none' }}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'center' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                    <button
                      type="button"
                      className={`interview-toggle ${form.sequentialLearning ? 'interview-toggle--active' : ''}`}
                      onClick={() => onFormChange(p => ({ ...p, sequentialLearning: !p.sequentialLearning }))}
                      style={{ flexShrink: 0 }}
                    >
                      <div className="interview-toggle-knob" />
                    </button>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Enable Sequential Learning Lock</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Require module completion before proceeding</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={onBack} style={{ height: 38, padding: '0 16px', fontSize: 13 }}>
                    Cancel
                  </button>
                  <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading} style={{ height: 38, padding: '0 20px', fontSize: 13, fontWeight: 600 }}>
                    {loading ? <><Loader2 size={14} className="reg-spin" /> Creating...</> : 'Create Training Session'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
