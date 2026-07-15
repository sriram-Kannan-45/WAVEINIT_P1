/**
 * TrainerProctoringDashboard — full live monitoring grid for one quiz.
 *
 *   <TrainerProctoringDashboard quizId={42} quizTitle="Final Exam" />
 *
 * Features:
 *  - Search + status filter grid of participant cards
 *  - Click card to open expanded single-view modal
 *  - Modal: live screen feed (WebRTC), webcam PiP, violation feed, action buttons
 *  - Observe/unobserve participants to receive their live screen stream
 *  - Send warning messages to participants
 *  - Force-terminate participants
 *
 * Theme: white surfaces, slate borders, blue accents.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, RefreshCw, Search, Users, X,
  Send, Power, Flag, Eye, EyeOff, MessageSquare, Monitor, Camera,
  FileText, Video,
} from 'lucide-react';

import useProctorMonitor from '../hooks/useProctorMonitor';
import ParticipantMonitorCard from './ParticipantMonitorCard';
import { GlassCard, GhostButton } from './ui';
import { useSocket, useSocketEvent } from '../../hooks/useSocket';
import { useToast } from '../../components/Toast';
import RecordingReplay from './RecordingReplay';

const VIOLATION_ICONS = {
  TAB_SWITCH: '🚨',
  SCREEN_SHARE_STOPPED: '📺',
  SCREEN_SHARE_DENIED: '📺',
  FULLSCREEN_EXIT: '🖥️',
  FACE_ABSENT: '👤',
  FACE_MULTIPLE: '👥',
  DEVTOOLS_OPENED: '🔧',
  COPY_ATTEMPT: '📋',
  PASTE_ATTEMPT: '📋',
  RIGHT_CLICK: '🖱️',
  NETWORK_LOST: '🌐',
  HEARTBEAT_LOST: '💔',
  MULTIPLE_LOGIN: '🚫',
  DEFAULT: '⚠️',
};

const ALERT_TYPES = [
  'TAB_SWITCH', 'SCREEN_SHARE_STOPPED', 'SCREEN_SHARE_DENIED',
  'FACE_ABSENT', 'FACE_MULTIPLE', 'DEVTOOLS_OPENED',
  'MULTIPLE_LOGIN', 'NETWORK_LOST',
];

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'PENDING', 'SUBMITTED', 'TERMINATED'];

export default function TrainerProctoringDashboard({ quizId, quizTitle }) {
  const navigate = useNavigate();
  const {
    sessions, refresh, forceTerminate, isLoading,
    observedStreams, observe, unobserve, observedSessions,
  } = useProctorMonitor(quizId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [selectedSession, setSelectedSession] = useState(null);
  const [violations, setViolations] = useState([]);
  const [showWarningInput, setShowWarningInput] = useState(false);
  const [warningText, setWarningText] = useState('');
  const [trainerMessages, setTrainerMessages] = useState([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [replaySession, setReplaySession] = useState(null);
  const modalVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const [liveStreamObj, setLiveStreamObj] = useState({ screen: null, webcam: null });
  const { socket } = useSocket();
  const { warning, info } = useToast();

  // Map sessionId -> participant name for toast alerts
  const participantNameMap = useMemo(() => {
    const map = new Map();
    sessions.forEach(s => {
      if (s.sessionId && s.participant?.name) {
        map.set(s.sessionId, s.participant.name);
      }
    });
    return map;
  }, [sessions]);

  // Incoming violation updates via proctor:update
  useSocketEvent('proctor:update', (msg) => {
    if (msg?.type === 'violation' && msg?.violation) {
      setViolations(prev => [msg.violation, ...prev].slice(0, 200));

      // Live alert toast for important violations
      const v = msg.violation;
      const pName = participantNameMap.get(v.sessionId) || 'Participant';
      const icon = VIOLATION_ICONS[v.type] || VIOLATION_ICONS.DEFAULT;
      if (ALERT_TYPES.includes(v.type)) {
        warning(`${icon} ${pName}: ${v.message || v.type}`, { duration: 6000 });
      }
    }
    if (msg?.type === 'disconnected') {
      const pName = participantNameMap.get(msg.session?.sessionId) || 'Participant';
      warning(`📵 ${pName} disconnected`, { duration: 6000 });
    }
    if (msg?.type === 'reconnected') {
      const pName = participantNameMap.get(msg.session?.sessionId) || 'Participant';
      info(`🔗 ${pName} reconnected`);
    }
    if (msg?.type === 'terminated') {
      const pName = participantNameMap.get(msg.session?.sessionId) || 'Participant';
      warning(`⛔ ${pName} session terminated`, { duration: 8000 });
    }
  }, [participantNameMap, warning, info]);

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (filter !== 'ALL' && s.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (s.participant?.name || '').toLowerCase();
        const email = (s.participant?.email || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, search, filter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    active: sessions.filter(s => s.status === 'ACTIVE').length,
    terminated: sessions.filter(s => s.status === 'TERMINATED').length,
    flagged: sessions.filter(s => (s.warningsCount || 0) >= 3).length,
    observed: observedSessions.length,
  }), [sessions, observedSessions]);

  // Auto-observe any active screen-sharing session so the trainer receives
  // the live stream without clicking "Observe".
  useEffect(() => {
    sessions.forEach(s => {
      if (s.status === 'ACTIVE' && s.isScreenSharing && !observedSessions.includes(s.sessionId)) {
        console.log('[TrainerProctoringDashboard] Auto-observing session', s.sessionId);
        observe(s.sessionId);
      }
    });
  }, [sessions, observedSessions, observe]);

  const handleTerminate = async (s) => {
    if (!window.confirm(`Force-terminate ${s.participant?.name}'s exam?`)) return;
    await forceTerminate(s.sessionId, 'Trainer terminated');
    if (selectedSession?.sessionId === s.sessionId) setSelectedSession(null);
  };

  // ── Open modal for a session ──────────────────────────────────────────
  const openDetail = useCallback(async (s) => {
    setSelectedSession(s);
    setShowWarningInput(false);
    setWarningText('');
    setLoadingViolations(true);

    // Fetch violation history
    try {
      const data = await proctorApi.getViolations(s.sessionId);
      setViolations(Array.isArray(data) ? data.reverse() : []);
    } catch {
      setViolations([]);
    }
    setLoadingViolations(false);

    // Auto-observe if screen sharing
    if (s.isScreenSharing && s.status === 'ACTIVE') {
      observe(s.sessionId);
    }
  }, [observe]);

  const closeDetail = useCallback(() => {
    // Stop observing when closing modal
    if (selectedSession?.sessionId) {
      unobserve(selectedSession.sessionId);
    }
    setSelectedSession(null);
    setViolations([]);
    setShowWarningInput(false);
  }, [selectedSession, unobserve]);

  // Attach video streams when modal is open
  useEffect(() => {
    if (!selectedSession) return;
    const streams = observedStreams.get(selectedSession.sessionId) || {};
    setLiveStreamObj(streams);

    if (modalVideoRef.current && streams.screen) {
      modalVideoRef.current.srcObject = streams.screen;
      modalVideoRef.current.play().catch(() => {});
    }
    if (webcamVideoRef.current && streams.webcam) {
      webcamVideoRef.current.srcObject = streams.webcam;
      webcamVideoRef.current.play().catch(() => {});
    }
  }, [selectedSession, observedStreams]);

  // ── Send warning message ──────────────────────────────────────────────
  const sendWarning = useCallback(() => {
    if (!warningText.trim() || !selectedSession || !socket) return;
    socket.emit('proctor:trainerMessage', {
      sessionId: selectedSession.sessionId,
      message: warningText.trim(),
    }, (ack) => {
      if (ack?.ok) {
        setTrainerMessages(prev => [...prev, {
          message: warningText.trim(),
          at: new Date(),
          from: 'You',
        }]);
        setWarningText('');
        setShowWarningInput(false);
      }
    });
  }, [warningText, selectedSession, socket]);

  // ── Flag participant (add violation) ─────────────────────────────────
  const flagParticipant = useCallback(() => {
    if (!selectedSession || !socket) return;
    socket.emit('proctor:violation', {
      sessionId: selectedSession.sessionId,
      type: 'TRAINER_WARNING',
      message: 'Flagged by trainer for review',
    });
  }, [selectedSession, socket]);

  const handleObserveToggle = useCallback((sessionId) => {
    if (observedSessions.includes(sessionId)) {
      unobserve(sessionId);
    } else {
      observe(sessionId);
    }
  }, [observedSessions, observe, unobserve]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40 px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Live Proctoring
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {quizTitle || `Quiz #${quizId}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/trainer/proctor/${quizId}/report`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
          >
            <FileText className="h-3.5 w-3.5" />
            View Report
          </button>
          <GhostButton onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </GhostButton>
        </div>
      </motion.div>

      {/* Stat row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatTile icon={<Users className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatTile icon={<Activity className="h-4 w-4" />} label="Active" value={stats.active} accent="emerald" />
        <StatTile icon={<Eye className="h-4 w-4" />} label="Observing" value={stats.observed} accent="violet" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Flagged" value={stats.flagged} accent="amber" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Terminated" value={stats.terminated} accent="rose" />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search participants…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-72"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition ' +
                (filter === f
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="text-sm text-slate-500">
            {isLoading ? 'Loading sessions…' : 'No sessions match your filters.'}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(s => (
            <div
              key={s.sessionId}
              onClick={() => openDetail(s)}
              className="cursor-pointer"
            >
              <ParticipantMonitorCard
                session={s}
                onTerminate={handleTerminate}
                onObserve={handleObserveToggle}
                onUnobserve={unobserve}
                isObserved={observedSessions.includes(s.sessionId)}
                liveStream={observedStreams.get(s.sessionId)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Expanded Detail Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative flex w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl"
              style={{ maxHeight: '90vh' }}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {selectedSession.participant?.name || 'Unknown'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedSession.participant?.email} &middot;{' '}
                    Proctoring: {selectedSession.proctoringLevel || 'MEDIUM'}
                  </p>
                </div>
                <button
                  onClick={closeDetail}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body: screen feed + side panel */}
              <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
                {/* Left: Live screen feed */}
                <div className="relative flex flex-1 flex-col bg-black p-4 lg:w-3/4">
                  <div className="relative flex-1 overflow-hidden rounded-xl bg-slate-900">
                    {observedStreams.has(selectedSession.sessionId) && liveStreamObj.screen ? (
                      <video
                        ref={modalVideoRef}
                        muted
                        playsInline
                        className="h-full w-full object-contain"
                      />
                    ) : selectedSession.latestScreenshot ? (
                      <img
                        src={selectedSession.latestScreenshot}
                        alt={`${selectedSession.participant?.name || 'Participant'}'s latest screen`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center text-slate-500">
                          <Monitor className="mx-auto h-16 w-16 mb-3 opacity-50" />
                          <p className="text-sm font-medium">No live stream</p>
                          <p className="text-xs mt-1">
                            {selectedSession.isScreenSharing
                              ? 'Click Observe to start streaming'
                              : 'Participant is not sharing their screen'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Webcam PiP */}
                    {selectedSession.isScreenSharing && (
                      <div className="absolute bottom-4 right-4 h-24 w-32 overflow-hidden rounded-lg border-2 border-white/50 bg-black shadow-lg">
                        {liveStreamObj.webcam ? (
                          <video
                            ref={webcamVideoRef}
                            muted
                            playsInline
                            className="h-full w-full object-cover scale-x-[-1]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-500">
                            <Camera className="h-8 w-8 opacity-50" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status overlay */}
                    {selectedSession.status === 'TERMINATED' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <div className="rounded-xl bg-rose-600 px-6 py-3 text-center text-white shadow-lg">
                          <Power className="mx-auto h-8 w-8 mb-2" />
                          <p className="font-semibold">Session Terminated</p>
                          <p className="text-xs mt-1 text-rose-200">{selectedSession.terminationReason}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleObserveToggle(selectedSession.sessionId)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        observedSessions.includes(selectedSession.sessionId)
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                      }`}
                      disabled={!selectedSession.isScreenSharing || selectedSession.status !== 'ACTIVE'}
                    >
                      {observedSessions.includes(selectedSession.sessionId)
                        ? <><EyeOff className="h-4 w-4" /> Stop Observing</>
                        : <><Eye className="h-4 w-4" /> Observe Screen</>}
                    </button>

                    <button
                      onClick={flagParticipant}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200 transition"
                    >
                      <Flag className="h-4 w-4" /> Flag
                    </button>

                    <button
                      onClick={() => setShowWarningInput(v => !v)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition"
                    >
                      <MessageSquare className="h-4 w-4" /> Warn
                    </button>

                    <button
                      onClick={() => setReplaySession(selectedSession.sessionId)}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-200 transition"
                    >
                      <Video className="h-4 w-4" /> Replay
                    </button>

                    <button
                      onClick={() => handleTerminate(selectedSession)}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-200 transition ml-auto"
                      disabled={selectedSession.status !== 'ACTIVE' && selectedSession.status !== 'PENDING'}
                    >
                      <Power className="h-4 w-4" /> End Attempt
                    </button>
                  </div>

                  {/* Warning input */}
                  {showWarningInput && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={warningText}
                        onChange={e => setWarningText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendWarning(); }}
                        placeholder="Type a warning message…"
                        className="flex-1 rounded-lg border border-slate-300 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 outline-none focus:border-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={sendWarning}
                        disabled={!warningText.trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" /> Send
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Violation feed + messages */}
                <div className="flex w-full flex-col border-t border-slate-200 lg:w-1/4 lg:border-t-0 lg:border-l">
                  {/* Violation feed */}
                  <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '50vh' }}>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Activity Feed
                    </h3>
                    {loadingViolations ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin text-slate-300" />
                      </div>
                    ) : violations.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">No violations recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {violations.map((v, i) => (
                          <div key={v.id || i} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                {v.type || 'EVENT'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {v.occurredAt ? new Date(v.occurredAt).toLocaleTimeString() : ''}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-700">{v.message || v.type}</p>
                            {v.severity && (
                              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                v.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' :
                                v.severity === 'HIGH' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {v.severity}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Trainer messages */}
                    {trainerMessages.length > 0 && (
                      <>
                        <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Trainer Messages
                        </h3>
                        <div className="space-y-2">
                          {trainerMessages.map((m, i) => (
                            <div key={m.id || i} className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-blue-600">{m.from}</span>
                                <span className="text-[10px] text-slate-400">
                                  {m.at ? new Date(m.at).toLocaleTimeString() : ''}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-700">{m.message}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Participant info footer */}
                  <div className="border-t border-slate-200 p-4">
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Warnings</span>
                        <span className="font-mono font-medium">{selectedSession.warningsCount || 0} / {selectedSession.maxWarnings || 5}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>FS Exits</span>
                        <span className="font-mono font-medium">{selectedSession.fullscreenExits || 0} / {selectedSession.maxFullscreenExits || 3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration</span>
                        <span className="font-mono font-medium">
                          {selectedSession.startedAt
                            ? Math.round((Date.now() - new Date(selectedSession.startedAt)) / 60000) + 'm'
                            : '—'}
                        </span>
                      </div>
                      {selectedSession.disconnectedAt && (
                        <div className="flex justify-between text-amber-600">
                          <span>Grace ends</span>
                          <span className="font-mono font-medium">
                            {selectedSession.gracePeriodEndsAt
                              ? new Date(selectedSession.gracePeriodEndsAt).toLocaleTimeString()
                              : '—'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recording Replay Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {replaySession && (
          <RecordingReplay
            sessionId={replaySession}
            participantName={
              sessions.find(s => s.sessionId === replaySession)?.participant?.name || 'Unknown'
            }
            onClose={() => setReplaySession(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatTile({ icon, label, value, accent = 'blue' }) {
  const map = {
    blue:   'from-blue-50 to-white ring-blue-200 text-blue-700',
    emerald: 'from-emerald-50 to-white ring-emerald-200 text-emerald-700',
    violet: 'from-violet-50 to-white ring-violet-200 text-violet-700',
    amber:  'from-amber-50 to-white ring-amber-200 text-amber-700',
    rose:   'from-rose-50 to-white ring-rose-200 text-rose-700',
  };
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
  );
}
