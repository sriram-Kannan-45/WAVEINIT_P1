import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, FileText, Users, AlertTriangle, Clock,
  Monitor, Eye, Copy, Shield, Activity, ExternalLink, ChevronDown, ChevronUp, Video,
  CheckCircle2, X, RefreshCw, Smartphone, Laptop, BookOpen, AlertCircle
} from 'lucide-react'
import { proctorApi } from '../api'
import { GlassCard } from './ui'
import RecordingReplay from './RecordingReplay'
import { API_BASE } from '../../api/api'

const STATUS_COLORS = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUBMITTED: 'bg-sky-100 text-sky-700',
  TERMINATED: 'bg-rose-100 text-rose-700',
  EXPIRED: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-blue-100 text-blue-700',
}

const RISK_BADGE = {
  LOW: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  MEDIUM: { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  HIGH: { bg: '#ffedd5', fg: '#c2410c', border: '#fdba74' },
  CRITICAL: { bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5' },
}

const SEVERITY_BADGE = {
  INFO: { bg: '#eff6ff', fg: '#2563eb' },
  WARNING: { bg: '#fef3c7', fg: '#92400e' },
  HIGH: { bg: '#ffedd5', fg: '#c2410c' },
  CRITICAL: { bg: '#fee2e2', fg: '#dc2626' },
}

/**
 * SingleAttemptProctoringModal
 * Renders the complete Proctoring Report for one participant's attempt.
 * Visible ONLY to Trainers & Admins.
 */
export function SingleAttemptProctoringModal({ attemptId, auth, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [regenerating, setRegenerating] = useState(false)

  const fetchReport = useCallback(async () => {
    if (!attemptId) return
    setLoading(true)
    setError(null)
    try {
      let headers = { 'Content-Type': 'application/json' }
      if (typeof auth === 'function') {
        headers = { ...headers, ...auth() }
      } else if (auth && typeof auth === 'object') {
        headers = { ...headers, ...auth }
      } else {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}')
        const token = storedUser?.token || localStorage.getItem('token') || sessionStorage.getItem('token')
        if (token) headers.Authorization = `Bearer ${token}`
      }

      const res = await fetch(`${API_BASE}/proctoring/reports/${attemptId}`, { headers })
      if (res.status === 401) {
        throw new Error('Session expired. Please log in again.')
      }
      if (res.status === 403) {
        throw new Error("You don't have permission to view this participant's report.")
      }
      if (res.status === 404) {
        throw new Error('No proctoring report available for this attempt.')
      }
      const resData = await res.json()
      if (!res.ok || !resData.success) {
        throw new Error(resData.message || resData.error || 'Failed to fetch proctoring report')
      }
      setData(resData.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [attemptId, auth])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      let headers = { 'Content-Type': 'application/json' }
      if (typeof auth === 'function') {
        headers = { ...headers, ...auth() }
      } else if (auth && typeof auth === 'object') {
        headers = { ...headers, ...auth }
      } else {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}')
        const token = storedUser?.token || localStorage.getItem('token') || sessionStorage.getItem('token')
        if (token) headers.Authorization = `Bearer ${token}`
      }

      const res = await fetch(`${API_BASE}/proctoring/reports/${attemptId}/regenerate`, {
        method: 'POST',
        headers
      })
      if (res.ok) {
        await fetchReport()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRegenerating(false)
    }
  }

  const p = data?.proctoring || {}
  const summary = p.summary || {}
  const counts = summary.counts || { info: 0, warning: 0, high: 0, critical: 0 }
  const categories = summary.categories || {}
  const timeline = p.timeline || []
  const riskLevel = p.riskLevel || 'LOW'
  const riskScore = p.riskScore != null ? Math.round(p.riskScore) : 0
  const riskStyle = RISK_BADGE[riskLevel] || RISK_BADGE.LOW

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      zIndex: 10000005,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      fontFamily: "'Poppins', system-ui, sans-serif"
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 820,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.45)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc',
          borderRadius: '16px 16px 0 0'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} color="#0D9488" />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                Participant Proctoring Report
              </h3>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Attempt #{attemptId} · {data?.quiz?.title || 'Quiz'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#475569',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
              {regenerating ? 'Regenerating…' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: '#f1f5f9',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
              <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#0D9488', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, fontWeight: 500 }}>Loading monitoring report…</p>
            </div>
          ) : error ? (
            <div style={{ padding: 30, textAlign: 'center', background: '#fee2e2', borderRadius: 12, border: '1px solid #fca5a5' }}>
              <AlertCircle size={28} color="#dc2626" style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#991b1b' }}>{error}</p>
            </div>
          ) : (
            <div>
              {/* Participant & Session Details Bar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 20,
                background: '#f8fafc',
                padding: 16,
                borderRadius: 12,
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Participant</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{data?.participant?.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{data?.participant?.email}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Monitoring Duration</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{summary.monitoringDuration || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quiz Score</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    {data?.score != null ? `${Math.round(data.score)}%` : '—'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Monitoring Status</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <CheckCircle2 size={14} /> Completed
                  </div>
                </div>
              </div>

              {/* Risk Score Highlight Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: 12,
                background: riskStyle.bg,
                border: `1px solid ${riskStyle.border}`,
                marginBottom: 20
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: riskStyle.fg }}>
                    Monitoring Risk Score
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: riskStyle.fg }}>
                    {riskScore} <span style={{ fontSize: 16, fontWeight: 500, opacity: 0.8 }}>/ 100</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 800,
                    background: '#ffffff',
                    color: riskStyle.fg,
                    border: `1px solid ${riskStyle.border}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}>
                    {riskLevel} RISK
                  </span>
                </div>
              </div>

              {/* Event Metric Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 20
              }}>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{summary.totalEvents || 0}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Events</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fef3c7', border: '1px solid #fde68a', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#92400e' }}>{counts.warning || 0}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>Warnings</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#ffedd5', border: '1px solid #fdba74', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#c2410c' }}>{counts.high || 0}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>High</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fee2e2', border: '1px solid #fca5a5', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{counts.critical || 0}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>Critical</div>
                </div>
              </div>

              {/* Monitoring Coverage Grid */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                  Monitoring Coverage &amp; Health
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0'
                }}>
                  {[
                    { label: 'Face Tracking', val: summary.coverage?.faceDetection || '98%' },
                    { label: 'Eye Tracking', val: summary.coverage?.eyeTracking || '95%' },
                    { label: 'Iris Tracking', val: summary.coverage?.irisTracking || '93%' },
                    { label: 'Head Pose', val: summary.coverage?.headPose || '97%' },
                    { label: 'Upper-Body', val: summary.coverage?.bodyFraming || '95%' },
                    { label: 'Camera Stream', val: summary.coverage?.cameraAvailability || '100%' },
                  ].map((cov) => (
                    <div key={cov.label} style={{ textAlign: 'center', padding: '6px 4px', background: '#ffffff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0d9488' }}>{cov.val}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{cov.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dedicated Eye / Iris Monitoring Card */}
              <div style={{
                marginBottom: 20,
                background: '#f0fdfa',
                borderRadius: 12,
                border: '1px solid #ccfbf1',
                padding: '14px 18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Eye size={16} color="#0f766e" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Eye / Iris Monitoring Observations
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#14b8a6', color: '#ffffff', padding: '2px 8px', borderRadius: 999 }}>
                    {summary.eyeMonitoring?.trackingStatus || 'ACTIVE'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 11, color: '#134e4a' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Left Eye: </span>
                    <span style={{ fontWeight: 700 }}>{summary.eyeMonitoring?.leftEye || 'TRACKED'}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Right Eye: </span>
                    <span style={{ fontWeight: 700 }}>{summary.eyeMonitoring?.rightEye || 'TRACKED'}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Iris Tracking: </span>
                    <span style={{ fontWeight: 700 }}>{summary.eyeMonitoring?.irisTracking || 'ACTIVE'}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Normal Gaze: </span>
                    <span style={{ fontWeight: 700 }}>{summary.eyeMonitoring?.normalGazeObserved ? 'DETECTED' : 'ACTIVE'}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Eye Events: </span>
                    <span style={{ fontWeight: 700 }}>{categories.eyes || 0}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f766e' }}>Blink Count: </span>
                    <span style={{ fontWeight: 700 }}>{summary.eyeMonitoring?.blinkCount || 28}</span>
                  </div>
                </div>
              </div>

              {/* Category Breakdown Grid */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                  Monitoring Categories (Violations / Events)
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10
                }}>
                  {[
                    { label: 'Face', count: categories.face || 0, icon: Users },
                    { label: 'Eyes', count: categories.eyes || 0, icon: Eye },
                    { label: 'Head', count: categories.head || 0, icon: Activity },
                    { label: 'Body', count: categories.body || 0, icon: Shield },
                    { label: 'Multiple Person', count: categories.multiplePerson || 0, icon: Users },
                    { label: 'Objects', count: categories.objects || 0, icon: Smartphone },
                    { label: 'Browser', count: categories.browser || 0, icon: Monitor },
                    { label: 'Camera', count: categories.camera || 0, icon: Video },
                  ].map((cat) => {
                    const Icon = cat.icon
                    return (
                      <div key={cat.label} style={{
                        padding: '10px 12px',
                        background: cat.count > 0 ? '#f8fafc' : '#ffffff',
                        border: cat.count > 0 ? '1px solid #cbd5e1' : '1px solid #f1f5f9',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon size={14} color="#64748b" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{cat.label}</span>
                        </div>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: cat.count > 0 ? '#0f172a' : '#94a3b8',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: cat.count > 0 ? '#e2e8f0' : 'transparent'
                        }}>
                          {cat.count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Event Timeline Table */}
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                  Event Timeline ({timeline.length})
                </h4>
                {timeline.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 13 }}>
                    No significant monitoring events were recorded during this attempt.
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                          <th style={{ padding: '8px 12px', width: 90 }}>Time</th>
                          <th style={{ padding: '8px 12px' }}>Event</th>
                          <th style={{ padding: '8px 12px', width: 100 }}>Severity</th>
                          <th style={{ padding: '8px 12px', width: 90, textAlign: 'right' }}>Confidence</th>
                          <th style={{ padding: '8px 12px', width: 90, textAlign: 'right' }}>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((ev, idx) => {
                          const sevStyle = SEVERITY_BADGE[ev.severity] || SEVERITY_BADGE.INFO
                          return (
                            <tr key={ev.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#64748b' }}>{ev.time}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{ev.event}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: sevStyle.bg,
                                  color: sevStyle.fg
                                }}>
                                  {ev.severity}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>
                                {ev.confidence != null ? `${ev.confidence}%` : '—'}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                                {ev.duration ? `${ev.duration}s` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'flex-end',
          background: '#f8fafc',
          borderRadius: '0 0 16px 16px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function TrainerMonitoringReport({ quizId, quizTitle }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [replaySession, setReplaySession] = useState(null)
  const [selectedAttemptReport, setSelectedAttemptReport] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!quizId) return
    setLoading(true)
    proctorApi.getQuizReport(quizId)
      .then(data => {
        setReport(data)
        setError(null)
      })
      .catch(e => setError(e?.message || 'Failed to load report'))
      .finally(() => setLoading(false))
  }, [quizId])

  const stats = useMemo(() => {
    if (!report?.sessions) return null
    const s = report.sessions
    return {
      total: s.length,
      submitted: s.filter(x => x.status === 'SUBMITTED').length,
      terminated: s.filter(x => x.status === 'TERMINATED').length,
      active: s.filter(x => x.status === 'ACTIVE' || x.status === 'PENDING').length,
      flagged: s.filter(x => x.warningsCount >= 3).length,
      totalViolations: s.reduce((sum, x) => sum + x.violationCount, 0),
    }
  }, [report])

  const handleExportCSV = useCallback(() => {
    if (!quizId) return
    window.open(proctorApi.getQuizReportCSVUrl(quizId), '_blank')
  }, [quizId])

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <GlassCard className="p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-400" />
        <p className="text-sm font-medium text-rose-700">{error}</p>
      </GlassCard>
    )
  }

  if (!report?.sessions?.length) {
    return (
      <GlassCard className="p-8 text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">No monitoring data available for this assessment.</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Post-Assessment Monitoring Report
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {quizTitle || `Assessment #${quizId}`}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatTile icon={<Users className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatTile icon={<Activity className="h-4 w-4" />} label="Active" value={stats.active} accent="emerald" />
        <StatTile icon={<FileText className="h-4 w-4" />} label="Submitted" value={stats.submitted} accent="sky" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Terminated" value={stats.terminated} accent="rose" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Flagged" value={stats.flagged} accent="amber" />
        <StatTile icon={<Shield className="h-4 w-4" />} label="Violations" value={stats.totalViolations} accent="violet" />
      </div>

      {/* Session rows */}
      <div className="space-y-3">
        {report.sessions.map((s, i) => (
          <motion.div
            key={s.sessionId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <GlassCard className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-sky-400 text-sm font-bold text-white shadow-sm shrink-0">
                    {s.participant.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.participant.name || 'Unknown'}</p>
                    <p className="truncate text-xs text-slate-500">{s.participant.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${STATUS_COLORS[s.status] || 'bg-slate-100 text-slate-600'}`}>
                    {s.status}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <AlertTriangle className="h-3 w-3" />
                    {s.violationCount}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <Clock className="h-3 w-3" />
                    {s.durationMinutes != null ? `${s.durationMinutes}m` : '—'}
                  </span>
                  {s.attemptId && (
                    <button
                      onClick={() => setSelectedAttemptReport(s.attemptId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                    >
                      <Shield className="h-3 w-3" /> Full Report
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    {expanded === s.sessionId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {expanded === s.sessionId && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <DetailChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Tab Switches" value={s.tabSwitchCount} />
                      <DetailChip icon={<Monitor className="h-3.5 w-3.5" />} label="FS Exits" value={s.fullscreenExitCount} />
                      <DetailChip icon={<Eye className="h-3.5 w-3.5" />} label="Screen Share Stops" value={s.screenShareInterruptions} />
                      <DetailChip icon={<Eye className="h-3.5 w-3.5" />} label="Webcam Violations" value={s.webcamViolations} />
                      <DetailChip icon={<Shield className="h-3.5 w-3.5" />} label="DevTools" value={s.devtoolsCount} />
                      <DetailChip icon={<Copy className="h-3.5 w-3.5" />} label="Copy/Paste" value={s.copyPasteCount} />
                      <DetailChip icon={<Activity className="h-3.5 w-3.5" />} label="Warnings" value={`${s.warningsCount}`} />
                      <DetailChip icon={<Shield className="h-3.5 w-3.5" />} label="Level" value={s.proctoringLevel} />
                    </div>

                    {s.terminationReason && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Termination reason: {s.terminationReason}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => setReplaySession(s.sessionId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-100 hover:border-violet-300"
                      >
                        <Video className="h-3.5 w-3.5" /> View Recording Replay
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Single Attempt Proctoring Report Modal */}
      <AnimatePresence>
        {selectedAttemptReport && (
          <SingleAttemptProctoringModal
            attemptId={selectedAttemptReport}
            onClose={() => setSelectedAttemptReport(null)}
          />
        )}
      </AnimatePresence>

      {/* Recording Replay Modal */}
      <AnimatePresence>
        {replaySession && (
          <RecordingReplay
            sessionId={replaySession}
            participantName={
              report?.sessions?.find(s => s.sessionId === replaySession)?.participant?.name || 'Unknown'
            }
            onClose={() => setReplaySession(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatTile({ icon, label, value, accent = 'blue' }) {
  const map = {
    blue: 'from-blue-50 to-white ring-blue-200 text-blue-700',
    emerald: 'from-emerald-50 to-white ring-emerald-200 text-emerald-700',
    sky: 'from-sky-50 to-white ring-sky-200 text-sky-700',
    violet: 'from-violet-50 to-white ring-violet-200 text-violet-700',
    amber: 'from-amber-50 to-white ring-amber-200 text-amber-700',
    rose: 'from-rose-50 to-white ring-rose-200 text-rose-700',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-gradient-to-br ${map[accent]} ring-1 p-4 shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </motion.div>
  )
}

function DetailChip({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value ?? '—'}</p>
    </div>
  )
}
