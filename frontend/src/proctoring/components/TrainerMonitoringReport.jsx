import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, FileText, Users, AlertTriangle, Clock,
  Monitor, Eye, Copy, Shield, Activity, ExternalLink, ChevronDown, ChevronUp, Video,
} from 'lucide-react'
import { proctorApi } from '../api'
import { GlassCard } from './ui'
import RecordingReplay from './RecordingReplay'

const STATUS_COLORS = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUBMITTED: 'bg-sky-100 text-sky-700',
  TERMINATED: 'bg-rose-100 text-rose-700',
  EXPIRED: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-blue-100 text-blue-700',
}

export default function TrainerMonitoringReport({ quizId, quizTitle }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [replaySession, setReplaySession] = useState(null)
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
