import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, ChevronRight, Clock, Video, Calendar, Mail, Check, Loader2, X } from 'lucide-react'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import VideoPlayer from '../components/shared/VideoPlayer'
import { colors, SEVERITY_STYLES, skeletonStyle, typography, cardStyle } from '../theme/tokens'

const auth = (user) => ({ Authorization: `Bearer ${user.token}` })

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const violationLabels = {
  FULLSCREEN_EXIT: 'Fullscreen Exit',
  TAB_SWITCH: 'Tab Switch',
  WINDOW_BLUR: 'Window Blur',
  BROWSER_MINIMIZE: 'Browser Minimize',
  SCREEN_SHARE_STOPPED: 'Screen Share Stopped',
  SCREEN_SHARE_DENIED: 'Screen Share Denied',
  COPY_ATTEMPT: 'Copy Attempt',
  PASTE_ATTEMPT: 'Paste Attempt',
  RIGHT_CLICK: 'Right Click',
  BLOCKED_SHORTCUT: 'Blocked Shortcut',
  DEVTOOLS_OPENED: 'DevTools Opened',
  REFRESH_ATTEMPT: 'Refresh Attempt',
  NAVIGATION_ATTEMPT: 'Navigation Attempt',
  MULTIPLE_LOGIN: 'Multiple Login',
  NETWORK_LOST: 'Network Lost',
  HEARTBEAT_LOST: 'Heartbeat Lost',
  TERMINATED: 'Terminated',
  SCREENSHOT_ATTEMPT: 'Screenshot Attempt',
  MOUSE_LEAVE: 'Mouse Leave',
  CLIPBOARD_ATTEMPT: 'Clipboard Attempt',
  NETWORK_TIMEOUT: 'Network Timeout',
  FACE_ABSENT: 'Face Absent',
  FACE_MULTIPLE: 'Multiple Faces',
  LOOKING_AWAY: 'Looking Away',
  MOBILE_DETECTED: 'Mobile Detected',
  TRAINER_WARNING: 'Trainer Warning',
}

function Timeline({ markers, recordingStart, recordingDuration, onSeek }) {
  const barRef = useRef(null)

  const handleClick = (e) => {
    if (!barRef.current || !recordingDuration) return
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek?.(ratio * recordingDuration)
  }

  return (
    <div className="relative">
      <div
        ref={barRef}
        className="relative h-2 rounded-full cursor-pointer overflow-hidden group"
        style={{ background: colors.slate[200] }}
        onClick={handleClick}
      >
        <div className="absolute inset-0 bg-primary-500/10 group-hover:bg-primary-500/20 transition-colors" />
        {markers.map((m, i) => {
          const sev = SEVERITY_STYLES[m.severity]
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm cursor-pointer hover:scale-150 transition-transform z-10"
              style={{ left: `${Math.max(0, Math.min(100, m.position))}%`, background: sev ? sev.fg : colors.slate[400] }}
              title={`${violationLabels[m.type] || m.type} at ${fmtTime(m.occurredAt)}`}
              onClick={(e) => { e.stopPropagation(); onSeek?.(m.seekTime) }}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0:00</span>
        <span>{recordingDuration ? `${Math.floor(recordingDuration / 60)}:${String(Math.floor(recordingDuration % 60)).padStart(2, '0')}` : '-:--'}</span>
      </div>
    </div>
  )
}

export default function TrainerRecordingDetail({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { error: showError, success } = useToast()
  const videoRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(null)
  const [quizResult, setQuizResult] = useState(null)
  const [violations, setViolations] = useState([])
  const [streamUrl, setStreamUrl] = useState('')
  const [durationPatched, setDurationPatched] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`${API_BASE}/recordings/${id}`, { headers: auth(user) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.message || 'Failed to load')
        setRecording(d.data.recording)
        setQuizResult(d.data.quizResult)
        const MONITORING_EVENTS = new Set(['HEARTBEAT_LOST', 'HEARTBEAT_RESTORED', 'SESSION_STARTED', 'SESSION_RESUMED'])
        setViolations((d.data.violations || []).filter(v => !MONITORING_EVENTS.has(v.type)))
        setStreamUrl(`${API_BASE}/recordings/${id}/stream?token=${user.token}`)
      } catch (e) {
        showError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, user, showError])

  const handleDownload = async () => {
    try {
      const r = await fetch(`${API_BASE}/recordings/${id}/stream?token=${user.token}`)
      if (!r.ok) throw new Error('Download failed')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording_${id}.webm`
      a.click()
      URL.revokeObjectURL(url)
      success('Recording downloaded')
    } catch (e) {
      showError(e.message)
    }
  }

  const handleSeekTo = (time) => {
    videoRef.current?.seekTo(time)
  }

  const handleDurationUpdate = useCallback(async (seconds) => {
    if (durationPatched || recording?.durationSeconds) return
    try {
      const r = await fetch(`${API_BASE}/recordings/${id}`, {
        method: 'PATCH',
        headers: { ...auth(user), 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: seconds })
      })
      if (r.ok) {
        setDurationPatched(true)
        setRecording(prev => prev ? { ...prev, durationSeconds: seconds } : prev)
      }
    } catch {}
  }, [id, user, recording?.durationSeconds, durationPatched])

  const timelineMarkers = useMemo(() => {
    if (!violations.length || !recording?.recordedAt || !recording?.durationSeconds) return []
    const start = new Date(recording.recordedAt).getTime()
    const durationMs = recording.durationSeconds * 1000
    if (!durationMs) return []

    return violations
      .filter(v => {
        const t = new Date(v.occurredAt).getTime()
        return t >= start && t <= start + durationMs
      })
      .map(v => ({
        ...v,
        position: ((new Date(v.occurredAt).getTime() - start) / durationMs) * 100,
        seekTime: (new Date(v.occurredAt).getTime() - start) / 1000,
      }))
  }, [violations, recording?.recordedAt, recording?.durationSeconds])

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div className="spinner mx-auto mb-2" />
        <p style={{ fontSize: 13, color: colors.slate[500] }}>Loading recording...</p>
      </div>
    )
  }

  if (!recording) {
    return (
      <div className="dashboard">
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-icon"><Video size={48} /></div>
          <h3>Recording Not Found</h3>
          <p>The recording you're looking for doesn't exist or has been removed.</p>
          <button onClick={() => navigate('/trainer/recordings')} className="btn btn-primary" style={{ marginTop: 16 }}>
            Back to Recordings
          </button>
        </div>
      </div>
    )
  }

  const correct = quizResult?.totalScore ?? null
  const total = quizResult?.maxScore ?? null
  const pct = quizResult?.percentage ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="dashboard"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button onClick={() => navigate('/trainer/recordings')}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, color: colors.slate[500], marginBottom: 2, fontWeight: 500 }}>Trainer Portal › Recordings › Detail</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text.primary, fontFamily: typography.fontFamily }} className="truncate">
              {recording.quiz?.title || 'Quiz Recording'} &mdash; {recording.participant?.name || 'Unknown'}
            </h1>
          </div>
        </div>
        <RecordingStatusBadge status={recording.status} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: colors.slate[500], display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={14} /> {fmtDate(recording.recordedAt)}</span>
        {recording.durationSeconds && (
          <span style={{ fontSize: 13, color: colors.slate[500], display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> {Math.floor(recording.durationSeconds / 60)}m {recording.durationSeconds % 60}s</span>
        )}
        {recording.fileSizeMb && (
          <span style={{ fontSize: 13, color: colors.slate[500], display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={14} /> {Number(recording.fileSizeMb).toFixed(1)} MB</span>
        )}
        {recording.participant?.email && (
          <span style={{ fontSize: 13, color: colors.slate[400], display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={14} /> {recording.participant.email}</span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        <div className="flex flex-col gap-3">
          <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: colors.slate[900] }}>
            <div className="aspect-video">
              {streamUrl ? (
                <VideoPlayer ref={videoRef} src={streamUrl} className="w-full h-full" onDuration={handleDurationUpdate} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">Loading video...</div>
              )}
            </div>
          </div>

          {violations.length > 0 && recording?.durationSeconds && (
            <div style={{ ...cardStyle, padding: '14px 16px' }}>
              <div style={{ padding: 0, marginBottom: 10, border: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Violation Timeline</h3>
                <span style={{ fontSize: 13, color: colors.text.secondary }}>{violations.length} event{violations.length > 1 ? 's' : ''}</span>
              </div>
              <Timeline
                markers={timelineMarkers}
                recordingStart={recording.recordedAt}
                recordingDuration={recording.durationSeconds}
                onSeek={handleSeekTo}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>

          <div style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={{ padding: 0, marginBottom: 12, border: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Quiz Performance</h3>
            </div>
            {quizResult ? (
              <div className="flex items-center gap-2">
                <div style={{ flex: 1, background: colors.primary[50], borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.primary[600] }}>{pct != null ? `${Math.round(pct)}%` : '-'}</div>
                  <div style={{ fontSize: 12, color: colors.primary[600], fontWeight: 500, marginTop: 2 }}>Score</div>
                </div>
                <div style={{ flex: 1, background: colors.success[50], borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.success[500] }}>{correct != null ? `${correct}/${total}` : '-'}</div>
                  <div style={{ fontSize: 12, color: colors.success[500], fontWeight: 500, marginTop: 2 }}>Correct</div>
                </div>
                {quizResult.attempt?.timeTaken && (
                  <div style={{ flex: 1, background: colors.surface.secondary, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary }}>{Math.floor(quizResult.attempt.timeTaken / 60)}m</div>
                    <div style={{ fontSize: 12, color: colors.slate[500], fontWeight: 500, marginTop: 2 }}>Time</div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: colors.slate[400] }}>No quiz result data available.</p>
            )}
          </div>

          <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ padding: 0, marginBottom: 10, border: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Violation Log</h3>
              {violations.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.danger[600], background: colors.danger[50], padding: '2px 10px', borderRadius: 100 }}>{violations.length}</span>
              )}
            </div>
            {violations.length > 0 ? (
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ fontSize: 11, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 8, paddingRight: 8 }}>Type</th>
                      <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 8, paddingRight: 8 }}>Severity</th>
                      <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 8, paddingRight: 8 }}>Time</th>
                      <th style={{ paddingBottom: 8 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((v) => {
                      const seekTime = recording?.recordedAt && recording?.durationSeconds
                        ? (new Date(v.occurredAt).getTime() - new Date(recording.recordedAt).getTime()) / 1000
                        : null
                      const canSeek = seekTime != null && seekTime >= 0 && seekTime <= (recording?.durationSeconds || 0)
                      const sev = SEVERITY_STYLES[v.severity] || { bg: colors.slate[100], fg: colors.slate[600] }
                      return (
                        <tr
                          key={v.id}
                          onClick={() => canSeek && handleSeekTo(seekTime)}
                          style={{ cursor: canSeek ? 'pointer' : 'default', borderBottom: `1px solid ${colors.slate[100]}` }}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td style={{ padding: '7px 8px 7px 0' }}>
                            <div className="flex items-center gap-2">
                              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: sev.fg }} />
                              <span style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary }}>{violationLabels[v.type] || v.type}</span>
                            </div>
                          </td>
                          <td style={{ padding: '7px 8px 7px 0' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 100, border: '1px solid', whiteSpace: 'nowrap', display: 'inline-block', background: sev.bg, color: sev.fg, borderColor: sev.bg }}>
                              {v.severity}
                            </span>
                          </td>
                          <td style={{ padding: '7px 8px 7px 0', fontSize: 14, color: colors.slate[500], whiteSpace: 'nowrap' }}>{fmtTime(v.occurredAt)}</td>
                          <td style={{ padding: '7px 0', color: colors.slate[300] }}>{canSeek && <ChevronRight size={14} />}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 14, color: colors.slate[400] }}>No violations recorded</p>
              </div>
            )}
          </div>

          <button
            onClick={handleDownload}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
            style={{ padding: '12px 20px', fontSize: 14 }}
          >
            <Download size={16} /> Download Recording
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function RecordingStatusBadge({ status }) {
  const styles = {
    ready: { bg: colors.success[100], fg: colors.success[700], border: colors.success[200] },
    processing: { bg: colors.warning[100], fg: colors.warning[700], border: colors.warning[200] },
    failed: { bg: colors.danger[100], fg: colors.danger[700], border: colors.danger[200] },
  }
  const labels = {
    ready: <><Check size={12} /> Ready</>,
    processing: <><Loader2 size={12} className="animate-spin" /> Processing</>,
    failed: <><X size={12} /> Failed</>,
  }
  const s = styles[status] || { bg: colors.slate[100], fg: colors.slate[600], border: colors.slate[200] }
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 100, border: '1px solid', background: s.bg, color: s.fg, borderColor: s.border, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {labels[status] || status}
    </span>
  )
}
