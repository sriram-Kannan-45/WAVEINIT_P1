import { useEffect, useMemo, useState } from 'react'
import {
  Search, ChevronUp, ChevronDown, Download, X, Star, Award,
  TrendingUp, Eye, RefreshCw, Users, Loader2, Clock, UserPlus, Check,
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import { downloadCSV } from '../../utils/export'
import { LineAreaChart } from '../ui/ChartWrappers'

const PAGE_SIZE = 10

function InviteParticipantsModal({ courseId, user, onClose, onSuccess }) {
  const { error: showError, success: showSuccess } = useToast()
  const [availableParticipants, setAvailableParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchAvailable()
  }, [courseId])

  const fetchAvailable = async () => {
    setLoading(true)
    try {
      const res = await fetch(API.TRAINER_COURSES.AVAILABLE_PARTICIPANTS(courseId), {
        headers: { Authorization: `Bearer ${user.token}` }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAvailableParticipants(data.participants || [])
      } else {
        showError(data.error || 'Failed to fetch approved participants')
      }
    } catch (e) {
      showError(e.message || 'Network error fetching approved participants')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!searchTerm) return availableParticipants
    const q = searchTerm.toLowerCase()
    return availableParticipants.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    )
  }, [availableParticipants, searchTerm])

  const handleToggleParticipant = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map(p => p.id || p.participantId || p.userId))
    }
  }

  const handleInvite = async () => {
    if (selectedIds.length === 0) return
    setInviting(true)
    try {
      const res = await fetch(API.TRAINER_COURSES.PARTICIPANTS(courseId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          participantId: selectedIds[0],
          participantIds: selectedIds
        })
      })
      const data = await res.json()
      if (res.ok && (data.success || data.enrolledCount > 0)) {
        showSuccess(data.message || `Successfully invited ${selectedIds.length} participant(s)`)
        onSuccess()
        onClose()
      } else {
        showError(data.error || data.message || 'Failed to invite participants')
      }
    } catch (e) {
      showError(e.message || 'Error inviting participants')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="reg-modal-overlay" onClick={onClose}>
      <div className="reg-modal" style={{ maxWidth: 580, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="reg-modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Approved Participants</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Select approved participants to invite to this training</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="reg-modal-body" style={{ padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#0d9488', gap: 12 }}>
              <Loader2 size={28} className="bulk-spin" />
              <span style={{ fontSize: 14, color: '#64748b' }}>Loading approved participants...</span>
            </div>
          ) : availableParticipants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <Users size={36} style={{ color: '#94a3b8', marginBottom: 12 }} />
              <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#334155' }}>No approved participants available</h4>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Either all approved participants are already enrolled or no participants have been approved by admin yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Search & Select All row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div className="reg-admin-search" style={{ flex: 1 }}>
                  <Search size={14} />
                  <input
                    className="reg-admin-search-input"
                    placeholder="Search approved participants..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
                    background: '#f8fafc', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer'
                  }}
                >
                  {selectedIds.length === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Participant List */}
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 0' }}>
                {filtered.map(p => {
                  const pId = p.id || p.participantId || p.userId
                  const isChecked = selectedIds.includes(pId)
                  return (
                    <label
                      key={pId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                        cursor: 'pointer', background: isChecked ? '#f0fdf4' : 'transparent',
                        borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleParticipant(pId)}
                        style={{ width: 18, height: 18, accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                        <div style={{ fontSize: 12.5, color: '#64748b' }}>{p.email}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 999 }}>
                        APPROVED
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* Selection Summary */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Selected: <span style={{ color: '#16a34a' }}>{selectedIds.length}</span>
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1',
                      background: '#fff', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={selectedIds.length === 0 || inviting}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none',
                      background: selectedIds.length > 0 ? '#16a34a' : '#cbd5e1',
                      color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 8
                    }}
                  >
                    {inviting ? <Loader2 size={16} className="bulk-spin" /> : null}
                    <span>Invite Selected Participants</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sortableHeaders = [
  { key: 'name', label: 'Participant' },
  { key: 'joinedAt', label: 'Joined', defaultSort: true },
  { key: 'lessonsCompleted', label: 'Lessons', sortable: true },
  { key: 'avgScore', label: 'Avg Score', sortable: true },
]

function sortParticipants(participants, sortConfig) {
  if (!sortConfig) return participants
  return [...participants].sort((a, b) => {
    const av = a[sortConfig.key]
    const bv = b[sortConfig.key]
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''))
    return sortConfig.direction === 'asc' ? cmp : -cmp
  })
}

function ProgressBar({ value, color = '#0d9488' }) {
  return (
    <div style={{
      width: '100%', height: 6, background: '#f1f5f9',
      borderRadius: 999, overflow: 'hidden', minWidth: 60,
    }}>
      <div style={{
        width: `${Math.min(value, 100)}%`, height: '100%',
        background: color, borderRadius: 999, transition: 'width 0.3s',
      }} />
    </div>
  )
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function StatusBadge({ status }) {
  const map = {
    COMPLETED:    { bg: '#dcfce7', fg: '#15803d', label: 'Completed' },
    IN_PROGRESS:  { bg: '#dbeafe', fg: '#1d4ed8', label: 'In Progress' },
    NOT_STARTED:  { bg: '#f1f5f9', fg: '#475569', label: 'Not Started' },
    DISQUALIFIED: { bg: '#fee2e2', fg: '#dc2626', label: 'Disqualified' },
    RESULT_PUBLISHED: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Result Published' },
  }
  const s = map[status] || { bg: '#f1f5f9', fg: '#475569', label: status || '—' }
  return (
    <span className="reg-admin-status" style={{
      background: s.bg, color: s.fg, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
    }}>
      {s.label}
    </span>
  )
}

function StatCard({ icon, label, value, color, progress }) {
  return (
    <div className="reg-admin-stat">
      <div className="reg-admin-stat-icon" style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="reg-admin-stat-label">{label}</div>
        <div className="reg-admin-stat-num" style={{ fontSize: 22 }}>
          {value}
          {progress !== undefined && (
            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{progress}%</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ParticipantDetailModal({ participant, course, onClose }) {


  const progressColor = participant.avgScore >= 75 ? '#16a34a' : participant.avgScore >= 50 ? '#F59E0B' : '#dc2626'
  const avgScore = participant.avgScore || 0
  const ringDeg = Math.min(avgScore, 100) * 3.6

  return (
    <div className="reg-modal-overlay" onClick={onClose}>
      <div className="reg-modal" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="reg-modal-header">
          <div>
            <h3>{participant.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b', fontFamily: 'var(--font-primary)' }}>
              {participant.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="reg-modal-body">
          <div className="reg-admin-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
            <StatCard
              icon={<Users size={16} />} label="Lessons Completed"
              value={participant.lessonsCompleted ?? '—'} color="#0d9488"
            />
            <StatCard
              icon={<TrendingUp size={16} />} label="Avg Score"
              value={avgScore ? `${avgScore.toFixed(1)}%` : '—'} color="#2563eb"
            />
            <StatCard
              icon={<Clock size={16} />} label="Joined"
              value={participant.joinedAt ? new Date(participant.joinedAt).toLocaleDateString() : '—'} color="#F59E0B"
            />
            <StatCard
              icon={<Award size={16} />} label="Quizzes Attempted"
              value={participant.quizzesAttempted ?? '—'} color="#16a34a"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <h3 className="reg-card-title">Performance</h3>
              </div>
              <div className="reg-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 140, height: 140 }}>
                  <svg viewBox="0 0 140 140" width={140} height={140}>
                    <circle cx={70} cy={70} r={62} fill="none" stroke="#f1f5f9" strokeWidth={12} />
                    <circle
                      cx={70} cy={70} r={62} fill="none"
                      stroke={progressColor} strokeWidth={12} strokeLinecap="round"
                      strokeDasharray={`${ringDeg} ${360 - ringDeg}`} transform="rotate(-90 70 70)"
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
                      {avgScore ? `${avgScore.toFixed(1)}%` : '—'}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-primary)' }}>Avg Score</span>
                  </div>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[{ label: 'Lessons Completed', value: participant.lessonsCompleted ?? 0, max: course?.lessonCount ?? 100, color: '#0d9488' }].map(r => (
                    <div key={r.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4, fontFamily: 'var(--font-primary)' }}>
                        <span>{r.label}</span>
                        <span>{r.value} / {r.max}</span>
                      </div>
                      <ProgressBar value={r.max ? (r.value / r.max) * 100 : 0} color={r.color} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <h3 className="reg-card-title">Quiz Results</h3>
              </div>
              <div className="reg-card-body" style={{ padding: 0 }}>
                {participant.quizResults?.length ? (
                  <table className="reg-admin-table">
                    <thead>
                      <tr>
                        <th>Quiz</th>
                        <th>Score</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participant.quizResults.map((q, i) => (
                        <tr key={`${q.title}-${i}`}>
                          <td>{q.title}</td>
                          <td>{q.score}</td>
                          <td><StatusBadge status={q.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ padding: 16, color: '#94a3b8', fontSize: 12, fontFamily: 'var(--font-primary)' }}>
                    No quiz results yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {participant.progressTrend?.length > 1 && (
            <div className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <h3 className="reg-card-title">Progress Trend</h3>
              </div>
              <div className="reg-card-body" style={{ height: 200 }}>
                <LineAreaChart data={participant.progressTrend} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CourseParticipantsTab({ courseId, user, course }) {
  const { error: showError, success: showSuccess } = useToast()
  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: 'joinedAt', direction: 'desc' })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detail, setDetail] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const loadParticipants = async (targetPage = page, targetSearch = search) => {
    setLoading(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.PARTICIPANTS(courseId, targetPage, PAGE_SIZE, targetSearch), {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      const d = await r.json()
      if (d.success) {
        setParticipants(d.participants)
        setTotal(d.total)
        if (targetPage > Math.max(1, Math.ceil(d.total / PAGE_SIZE))) setPage(Math.max(1, Math.ceil(d.total / PAGE_SIZE)))
      } else showError(d.error || 'Failed to load participants')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadParticipants()
  }, [courseId, user.token])

  const handleSearch = (e) => {
    const v = e.target.value
    setSearch(v)
    setPage(1)
    loadParticipants(1, v)
  }

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev?.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { key, direction: key === 'name' ? 'asc' : 'desc' }
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadParticipants()
    setRefreshing(false)
    showSuccess('Participant list refreshed')
  }

  const handleExport = () => {
    downloadCSV(participants, `participants-${courseId}.csv`)
    showSuccess('CSV exported')
  }

  const filtered = useMemo(
    () => sortParticipants(participants, sortConfig),
    [participants, sortConfig]
  )

  const avgCompletion = participants.length
    ? (participants.reduce((a, p) => a + (p.lessonsCompleted || 0), 0) / participants.length / Math.max(course?.lessonCount || 1, 1)) * 100
    : 0
  const avgScore = participants.length
    ? participants.reduce((a, p) => a + (p.avgScore || 0), 0) / participants.length
    : 0
  const topScore = participants.length
    ? Math.max(...participants.map(p => p.avgScore || 0))
    : 0

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="reg-admin-stats">
        <StatCard icon={<Users size={18} />} label="Total Participants" value={total} color="#0d9488" />
        <StatCard icon={<TrendingUp size={18} />} label="Avg Completion" value={`${avgCompletion.toFixed(1)}%`} color="#16a34a" progress={avgCompletion.toFixed(0)} />
        <StatCard icon={<Star size={18} />} label="Avg Score" value={avgScore ? `${avgScore.toFixed(1)}%` : '—'} color="#2563eb" />
        <StatCard icon={<Award size={18} />} label="Top Score" value={topScore ? `${topScore.toFixed(1)}%` : '—'} color="#F59E0B" />
      </div>

      <div className="reg-admin-table-wrap">
        <div className="reg-card-header">
          <div>
            <h3 className="reg-card-title">Participants</h3>
            <p className="reg-card-subtitle">{total} enrolled participants</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="reg-admin-search">
              <Search size={14} />
              <input
                className="reg-admin-search-input"
                placeholder="Search participants..."
                value={search}
                onChange={handleSearch}
              />
            </div>
            <button
              className="reg-admin-action"
              onClick={() => setShowInviteModal(true)}
              title="Invite Approved Participants"
              style={{
                background: '#16a34a', color: '#ffffff', border: 'none',
                padding: '0 14px', borderRadius: 8, display: 'flex',
                alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5,
                cursor: 'pointer'
              }}
            >
              <UserPlus size={14} />
              <span>Invite Participants</span>
            </button>
            <button
              className="reg-admin-action"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'bulk-spin' : ''} />
            </button>
            <button
              className="reg-admin-action"
              onClick={handleExport}
              title="Export CSV"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="reg-admin-table">
            <thead>
              <tr>
                {sortableHeaders.map(h => (
                  <th key={h.key}>
                    {h.sortable || h.defaultSort ? (
                      <button
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          textTransform: 'inherit', letterSpacing: 'inherit', fontSize: 'inherit',
                          fontWeight: 600, color: 'inherit',
                        }}
                        onClick={() => h.key !== 'name' && handleSort(h.key)}
                      >
                        {h.label}
                        {sortConfig?.key === h.key && (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        )}
                      </button>
                    ) : h.label}
                  </th>
                ))}
                <th>Progress</th>
                <th>Status</th>
                <th>Quiz Results</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>
                    <Loader2 size={20} className="bulk-spin" style={{ color: '#0d9488' }} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="reg-admin-empty" style={{ padding: '32px 16px' }}>
                      <Users size={24} />
                      <h3>No participants found</h3>
                      <p>{search ? 'Try a different search term.' : 'No participants have enrolled yet.'}</p>
                      <button
                        onClick={() => setShowInviteModal(true)}
                        style={{
                          marginTop: 12, padding: '8px 16px', borderRadius: 8,
                          background: '#16a34a', color: '#fff', border: 'none',
                          fontWeight: 600, fontSize: 13, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <UserPlus size={15} />
                        <span>Invite Participants</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id || p.email}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="reg-admin-avatar" style={{ width: 30, height: 30, fontSize: 11, borderRadius: '50%' }}>
                          {initials(p.name)}
                        </div>
                        <div>
                          <div className="reg-admin-name" style={{ fontSize: 13 }}>{p.name}</div>
                          <div className="reg-admin-email">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="reg-admin-date">{p.joinedAt ? new Date(p.joinedAt).toLocaleDateString() : '—'}</span>
                    </td>
                    <td>
                      <span className="reg-admin-score">{p.lessonsCompleted ?? '—'}</span>
                    </td>
                    <td>
                      <span className="reg-admin-score">
                        {p.avgScore != null ? `${p.avgScore.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ minWidth: 110 }}>
                        <ProgressBar
                          value={course?.lessonCount ? ((p.lessonsCompleted || 0) / course.lessonCount) * 100 : 0}
                        />
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: p.quizResults?.length ? '#0d9488' : '#94a3b8', fontFamily: 'var(--font-primary)' }}>
                        {p.quizResults?.length ?? 0}
                      </span>
                    </td>
                    <td>
                      <button
                        className="reg-admin-action"
                        onClick={() => setDetail(p)}
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="reg-card-footer" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b',
        }}>
          <span>
            {total === 0 ? '0 participants' : `Page ${Math.min(page, totalPages)} of ${totalPages} · ${total} total`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="reg-admin-action"
              disabled={page <= 1}
              onClick={() => { const np = page - 1; setPage(np); loadParticipants(np) }}
            >
              Prev
            </button>
            <button
              className="reg-admin-action"
              disabled={page >= totalPages}
              onClick={() => { const np = page + 1; setPage(np); loadParticipants(np) }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {detail && (
        <ParticipantDetailModal participant={detail} course={course} onClose={() => setDetail(null)} />
      )}

      {showInviteModal && (
        <InviteParticipantsModal
          courseId={courseId}
          user={user}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => loadParticipants()}
        />
      )}
    </div>
  )
}
