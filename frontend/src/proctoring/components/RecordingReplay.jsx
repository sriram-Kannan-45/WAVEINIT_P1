import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Pause, SkipBack, SkipForward, Download, X,
  AlertTriangle, Camera, Monitor, Mic, Shield,
} from 'lucide-react'
import { proctorApi } from '../api'

const VIOLATION_ICONS = {
  TAB_SWITCH: '🚨',
  SCREEN_SHARE_STOPPED: '📺',
  FULLSCREEN_EXIT: '🖥️',
  FACE_ABSENT: '👤',
  FACE_MULTIPLE: '👥',
  FACE_NOT_VISIBLE: '👤',
  CAMERA_OFF: '📷',
  MIC_MUTED: '🎤',
  LOOKING_AWAY: '👀',
  DEVTOOLS_OPENED: '🔧',
  COPY_ATTEMPT: '📋',
  NETWORK_LOST: '🌐',
  DEFAULT: '⚠️',
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function RecordingReplay({ sessionId, participantName, onClose }) {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedRecording, setSelectedRecording] = useState(null)
  const [violations, setViolations] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef(null)
  const timelineRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    Promise.all([
      proctorApi.getRecordings(sessionId),
      proctorApi.getViolations(sessionId),
    ])
      .then(([recs, viols]) => {
        setRecordings(Array.isArray(recs) ? recs : [])
        setViolations(Array.isArray(viols) ? viols : [])
        if (recs?.length > 0) setSelectedRecording(recs[0])
      })
      .catch(e => setError(e?.message || 'Failed to load recordings'))
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleSelectRecording = useCallback((rec) => {
    setSelectedRecording(rec)
    setCurrentTime(0)
    setPlaying(false)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0)
    }
  }, [])

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play().catch(() => {})
    }
    setPlaying(!playing)
  }, [playing])

  const seek = useCallback((time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration))
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [duration])

  const seekRelative = useCallback((delta) => {
    seek((videoRef.current?.currentTime || 0) + delta)
  }, [seek])

  const handleTimelineClick = useCallback((e) => {
    if (!timelineRef.current || !duration) return
    const rect = timelineRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(pct * duration)
  }, [duration, seek])

  const violationTimelineMarkers = useMemo(() => {
    if (!duration || !violations.length) return []
    return violations
      .filter(v => v.occurredAt)
      .map(v => ({
        ...v,
        pct: Math.min(100, Math.max(0,
          ((new Date(v.occurredAt).getTime() - new Date(recordings[0]?.createdAt || v.occurredAt).getTime()) / 1000 / duration) * 100
        )),
      }))
  }, [violations, duration, recordings])

  const violationGroups = useMemo(() => {
    const groups = {}
    violations.forEach(v => {
      const type = v.type || 'OTHER'
      if (!groups[type]) groups[type] = 0
      groups[type]++
    })
    return Object.entries(groups).sort((a, b) => b[1] - a[1])
  }, [violations])

  const matchedViolations = useMemo(() => {
    if (!duration || !violations.length || !selectedRecording?.createdAt) return []
    const recStart = new Date(selectedRecording.createdAt).getTime()
    return violations.filter(v => {
      if (!v.occurredAt) return false
      const vTime = new Date(v.occurredAt).getTime()
      const elapsed = (vTime - recStart) / 1000
      return elapsed >= 0 && elapsed <= duration + 60
    })
  }, [violations, duration, selectedRecording])

  const streamUrl = selectedRecording
    ? proctorApi.getRecordingStreamUrl(sessionId, selectedRecording.id)
    : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Recording Replay — {participantName || 'Unknown'}
            </h2>
            <p className="text-xs text-slate-500">
              {recordings.length} recording{recordings.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-rose-600">
            <AlertTriangle className="mr-2 h-5 w-5" />
            <span>{error}</span>
          </div>
        ) : !recordings.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Camera className="mb-3 h-12 w-12 opacity-50" />
            <p className="text-sm font-medium">No recordings for this session</p>
            <p className="mt-1 text-xs">Recordings appear after the participant submits their assessment.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
            {/* Left: Video Player */}
            <div className="flex flex-1 flex-col bg-black lg:w-3/4">
              {streamUrl ? (
                <div className="relative flex-1">
                  <video
                    ref={videoRef}
                    src={streamUrl}
                    className="h-full w-full object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setPlaying(false)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    playsInline
                    controls={false}
                  />

                  {/* Timeline with violation markers */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
                    {/* Timeline bar */}
                    <div
                      ref={timelineRef}
                      className="group relative mb-2 h-2 cursor-pointer rounded-full bg-white/20 transition-all hover:h-3"
                      onClick={handleTimelineClick}
                    >
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                      />
                      {violationTimelineMarkers.map((v, i) => (
                        <div
                          key={i}
                          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-rose-400 shadow-sm"
                          style={{ left: `${v.pct}%` }}
                          title={`${v.type}: ${v.message || ''}`}
                        />
                      ))}
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-3">
                      <button onClick={() => seekRelative(-10)} className="text-white/70 hover:text-white transition">
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        onClick={togglePlay}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
                      >
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                      </button>
                      <button onClick={() => seekRelative(10)} className="text-white/70 hover:text-white transition">
                        <SkipForward className="h-4 w-4" />
                      </button>

                      <span className="font-mono text-xs text-white/80">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>

                      <div className="ml-auto flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={volume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setVolume(v)
                            if (videoRef.current) videoRef.current.volume = v
                          }}
                          className="h-1 w-20 accent-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-white/50">
                  <Monitor className="h-12 w-12" />
                  <p className="ml-3 text-sm">Select a recording to preview</p>
                </div>
              )}
            </div>

            {/* Right: Violation sidebar + recording selector */}
            <div className="flex w-full flex-col border-t border-slate-200 lg:w-1/4 lg:border-t-0 lg:border-l">
              {/* Recording selector */}
              <div className="border-b border-slate-200 p-3">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Recordings
                </h3>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {recordings.map((rec) => (
                    <button
                      key={rec.id}
                      onClick={() => handleSelectRecording(rec)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        selectedRecording?.id === rec.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Monitor className="h-3 w-3 shrink-0" />
                        {rec.assessmentType || 'Recording'} — {new Date(rec.createdAt).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Violation summary */}
              <div className="flex-1 overflow-y-auto p-3">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  AI Proctoring Violations ({violations.length})
                </h3>

                {violationGroups.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No violations recorded</p>
                ) : (
                  <div className="space-y-2">
                    {violationGroups.map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span>{VIOLATION_ICONS[type] || VIOLATION_ICONS.DEFAULT}</span>
                          <span className="font-medium text-slate-700">{type}</span>
                        </span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {matchedViolations.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Timeline Events
                    </h3>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {matchedViolations.slice(0, 30).map((v, i) => (
                        <div key={v.id || i} className="rounded-lg border border-slate-100 bg-white p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              {v.type}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {v.occurredAt ? new Date(v.occurredAt).toLocaleTimeString() : ''}
                            </span>
                          </div>
                          {v.message && (
                            <p className="mt-0.5 text-[11px] text-slate-600">{v.message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Download button */}
              {streamUrl && (
                <div className="border-t border-slate-200 p-3">
                  <a
                    href={proctorApi.getRecordingDownloadUrl(sessionId, selectedRecording?.id)}
                    download
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Recording
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
