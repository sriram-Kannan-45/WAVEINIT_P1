import { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, Loader2 } from 'lucide-react'
import { API_BASE } from '../../../api/api'

function getAuthHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const token = user?.token || user?.accessToken || ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export default function NotesSection({ user }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchNotes = async () => {
      try {
        const res = await fetch(`${API_BASE}/notes/trainer/notes`, {
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        })
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        if (!cancelled) setNotes(data.notes || data || [])
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchNotes()
    return () => { cancelled = true }
  }, [])

  const handleAdd = async () => {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/notes/trainer/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ content: newNote.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setNotes(prev => [data.note || data, ...prev])
      setNewNote('')
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE}/notes/trainer/notes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      setNotes(prev => prev.filter(n => n.id !== id))
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="enterprise-card">
        <div className="enterprise-card__body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '72px', borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="enterprise-card">
      <div className="enterprise-card__header">
        <div>
          <h2 className="enterprise-card__title">Notes & Resources</h2>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Private notes and teaching resources</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--brand-trainer-bg)', borderRadius: 'var(--radius-md)' }}>
          <FileText size={14} style={{ color: 'var(--brand-trainer)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-trainer)' }}>{notes.length} notes</span>
        </div>
      </div>
      <div className="enterprise-card__body">
        {/* Add Note Form */}
        <div style={{ padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-150)', background: 'var(--neutral-50)', marginBottom: '20px' }}>
          <div className="field-group" style={{ marginBottom: '12px' }}>
            <textarea
              className="field-input"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Write a note..."
              rows={3}
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn-enterprise btn-enterprise--primary"
              onClick={handleAdd}
              disabled={saving || !newNote.trim()}
              style={{ fontSize: '13px' }}
            >
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Add Note
            </button>
          </div>
        </div>

        {/* Notes List */}
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', border: '2px dashed var(--neutral-200)', borderRadius: 'var(--radius-xl)', background: 'var(--neutral-50)' }}>
            <FileText size={32} style={{ color: 'var(--neutral-300)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>No notes yet. Start writing!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notes.map(note => (
              <div
                key={note.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 18px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--neutral-150)',
                  transition: 'border-color 150ms ease'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', color: 'var(--neutral-800)', lineHeight: 1.6 }}>{note.content}</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-400)', marginTop: '6px' }}>
                    {note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  style={{
                    width: '32px', height: '32px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--neutral-150)',
                    background: 'var(--neutral-0)',
                    color: 'var(--neutral-400)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 150ms ease'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
