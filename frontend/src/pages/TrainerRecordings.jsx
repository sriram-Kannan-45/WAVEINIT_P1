import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Filter, Monitor, Video, AlertTriangle, Play, Clock } from 'lucide-react'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { colors, cardStyle, skeletonStyle, typography } from '../theme/tokens'

const auth = (user) => ({ Authorization: `Bearer ${user.token}` })

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
};

const formatDuration = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : "—";

export default function TrainerRecordings({ user }) {
  const navigate = useNavigate()
  const { error: showError } = useToast()

  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [quizzes, setQuizzes] = useState([])

  const [search, setSearch] = useState('')
  const [quizFilter, setQuizFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedQuizFilter, setAppliedQuizFilter] = useState('')
  const [appliedDateFrom, setAppliedDateFrom] = useState('')
  const [appliedDateTo, setAppliedDateTo] = useState('')

  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(7)


  const fetchRecordings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 1000 })
      const r = await fetch(`${API_BASE}/recordings?${params}`, { headers: auth(user) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.message || 'Failed to fetch')
      setRecordings(d.data.recordings || [])
    } catch (e) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user, showError])

  const fetchQuizzes = async () => {
    try {
      const r = await fetch(`${API_BASE}/quizzes`, { headers: auth(user) })
      const d = await r.json()
      if (r.ok) setQuizzes(d.quizzes || d.data?.quizzes || [])
    } catch {}
  }

  useEffect(() => {
    fetchRecordings()
    fetchQuizzes()
  }, [])

  const applyFilters = () => {
    setAppliedSearch(search)
    setAppliedQuizFilter(quizFilter)
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setQuizFilter('')
    setDateFrom('')
    setDateTo('')
    setAppliedSearch('')
    setAppliedQuizFilter('')
    setAppliedDateFrom('')
    setAppliedDateTo('')
    setPage(1)
  }



  const filtered = recordings.filter(rec => {
    if (appliedSearch) {
      const q = appliedSearch.toLowerCase()
      const name = (rec.participant?.name || '').toLowerCase()
      const email = (rec.participant?.email || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q)) return false
    }
    if (appliedQuizFilter) {
      if (String(rec.quizId) !== String(appliedQuizFilter)) return false
    }
    if (appliedDateFrom) {
      const dFrom = new Date(appliedDateFrom)
      dFrom.setHours(0, 0, 0, 0)
      if (new Date(rec.recordedAt) < dFrom) return false
    }
    if (appliedDateTo) {
      const dTo = new Date(appliedDateTo)
      dTo.setHours(23, 59, 59, 999)
      if (new Date(rec.recordedAt) > dTo) return false
    }
    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.recordedAt) - new Date(a.recordedAt)
    if (sortBy === 'oldest') return new Date(a.recordedAt) - new Date(b.recordedAt)
    if (sortBy === 'participant') return (a.participant?.name || '').localeCompare(b.participant?.name || '')
    return 0
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const totalCount = recordings.length
  const readyCount = recordings.filter(r => r.status === 'ready').length
  const processingCount = recordings.filter(r => r.status === 'processing').length

  return (
    <div className="dashboard">
      <div className="reg-admin-header" style={{ marginBottom: 24 }}>
        <div className="reg-admin-header-icon">
          <Monitor size={26} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="reg-admin-title">Session Recordings</h1>
          <p className="reg-admin-subtitle">View screen recordings from your quiz sessions</p>
        </div>
      </div>

      <div className="reg-admin-stats" style={{ marginBottom: 24 }}>
        <div className="reg-admin-stat">
          <div className="reg-admin-stat-icon" style={{ background: '#f0f9ff', color: '#0284c7' }}>
            <Monitor size={20} />
          </div>
          <div>
            <span className="reg-admin-stat-num">{totalCount}</span>
            <span className="reg-admin-stat-label">Total Recordings</span>
          </div>
        </div>
        <div className="reg-admin-stat">
          <div className="reg-admin-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Video size={20} />
          </div>
          <div>
            <span className="reg-admin-stat-num">{readyCount}</span>
            <span className="reg-admin-stat-label">Ready to Watch</span>
          </div>
        </div>
        <div className="reg-admin-stat">
          <div className="reg-admin-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
            <Clock size={20} />
          </div>
          <div>
            <span className="reg-admin-stat-num">{processingCount}</span>
            <span className="reg-admin-stat-label">Processing</span>
          </div>
        </div>
      </div>

      <div className="reg-admin-table-wrap" style={{ marginBottom: 24 }}>
        <div className="reg-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} style={{ color: '#64748b' }} />
            <span className="reg-card-title">Filters</span>
          </div>
        </div>
        <div className="reg-card-body">
          <div className="form-grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="reg-admin-search" style={{ minWidth: 0 }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search participant..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select
              value={quizFilter}
              onChange={e => setQuizFilter(e.target.value)}
              className="reg-select"
            >
              <option value="">All My Quizzes</option>
              {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="reg-select"
            />

            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="reg-select"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={applyFilters}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{ cursor: 'pointer' }}
            >
              Apply Filters
            </button>
            <button
              onClick={clearFilters}
              className="reg-admin-btn reg-admin-btn--secondary"
              style={{ cursor: 'pointer' }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <div className="reg-card-header">
            <div>
              <h3 className="reg-card-title">Recordings ({total})</h3>
              <span className="reg-card-subtitle">Screen recordings from your quiz sessions</span>
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="reg-select"
              style={{ width: 180 }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="participant">By Participant Name</option>
            </select>
          </div>

          {total === 0 ? (
            <div className="reg-admin-empty">
              <Video size={40} />
              <h3>No Recordings Found</h3>
              <p>Recordings will appear here after participants complete your proctored quiz sessions with screen sharing enabled.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Quiz</th>
                      <th>Recorded</th>
                      <th>Duration</th>
                      <th>Violations</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(rec => {
                      const pName = rec.participant?.name || `User #${rec.participantId}`
                      const pEmail = rec.participant?.email || ''
                      const qTitle = rec.quiz?.title || (rec.quizId ? `Quiz #${rec.quizId}` : 'Unknown Quiz')
                      return (
                        <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                          <td>
                            <div className="reg-admin-participant">
                              <div className="reg-admin-avatar">
                                {pName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="reg-admin-name">{pName}</p>
                                {pEmail && <p style={{ fontSize: 11, color: '#94a3b8' }}>{pEmail}</p>}
                              </div>
                            </div>
                          </td>
                          <td style={{ color: '#475569' }}>{qTitle}</td>
                          <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(rec.recordedAt)}</td>
                          <td style={{ color: '#64748b' }}>{formatDuration(rec.durationSeconds)}</td>
                          <td>
                            {rec.violationCount > 0
                              ? <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> {rec.violationCount}</span>
                              : <span style={{ color: '#d1d5db' }}>—</span>
                            }
                          </td>
                          <td>
                            <span className={`reg-admin-status ${rec.status === 'ready' ? 'reg-admin-status--green' : rec.status === 'processing' ? 'reg-admin-status--amber' : 'reg-admin-status--red'}`}>
                              {rec.status === "ready" ? "Ready"
                               : rec.status === "processing" ? "Processing"
                               : "Failed"}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => navigate(`/trainer/recordings/${rec.id}`)}
                              className="reg-admin-btn reg-admin-btn--primary" style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}>
                              <Play size={12} /> Watch
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2" style={{ padding: '12px 16px' }}>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Show Data</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                      className="reg-select"
                      style={{ width: 70 }}
                    >
                      <option value={7}>7</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={page === 1}
                      className="px-2 py-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                    {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
                      const n = totalPages <= 5 ? idx + 1
                        : page <= 3 ? idx + 1
                        : page >= totalPages - 2 ? totalPages - 4 + idx
                        : page - 2 + idx
                      return (
                        <button key={n} onClick={() => setPage(n)}
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            n === page ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                          }`}>{n}</button>
                      )
                    })}
                    {totalPages > 5 && page < totalPages - 2 && (
                      <>
                        <span className="px-2 text-gray-400 text-sm">...</span>
                        <button onClick={() => setPage(totalPages)}
                          className="px-3 py-1 rounded text-gray-500 hover:bg-gray-100 text-sm">{totalPages}</button>
                      </>
                    )}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2 py-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                      className="px-2 py-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
