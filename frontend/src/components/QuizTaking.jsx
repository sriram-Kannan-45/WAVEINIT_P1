/**
 * QuizTaking.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes (2026-05-27):
 *   1. Auto-enters native fullscreen on mount — no "Begin Secure Exam" gate.
 *   2. Shares confirmed fullscreen warnings and audit reporting with Coding.
 *   3. New white + blue UI matching the dark mock the user shared, but in a
 *      light, professional theme. Header with title + timer + warning badge,
 *      question card with letter-coded MCQ rows, and right sidebar holding
 *      progress ring, Answered/Remaining stats, navigator grid, and Submit.
 *
 * API contract (unchanged):
 *   props: { quizId, attemptId, quizData, onSubmit }
 *   POST /api/ai-quiz/participant/submit/:attemptId  on submit
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader,
  AlertTriangle,
  Send,
  Maximize2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  MonitorPlay,
} from 'lucide-react'
import { useToast } from './Toast'
import { API_BASE } from '../api/api'
import { getAuthHeaders } from '../api/request'
import { useQuizProtection } from '../hooks/useQuizProtection.jsx'
import QuizWatermark from './ai-quizzes/QuizWatermark'
import AssessmentAIMentor from './ai-mentor/AssessmentAIMentor'
import monitoringClient from '../proctoring/engine/MonitoringEngineClient'
import {
  buildAttemptScope,
  readAttemptDraft,
  writeAttemptDraft,
  clearAttemptDraft,
  purgeStaleAttemptDrafts,
} from '../utils/attemptDraftStorage'
import '../styles/quiz-taking.css'

import { fsApi, useAssessmentFullscreen } from '../proctoring/hooks/useAssessmentFullscreen'
import { FullscreenWarningTitle, FullscreenWarningDescription } from '../proctoring/components/FullscreenWarningContent'

const formatTime = (totalSec) => {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ── Animated SVG progress ring (sidebar) ────────────────────────────────── */
function ProgressRing({ percent, size = 132 }) {
  const stroke = 11
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - percent / 100)
  return (
    <div className="qt-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="qt-ring__svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e6edf7"
          strokeWidth={stroke}

        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="qt-ring__inner">
        <span className="qt-ring__value">{percent}%</span>
        <span className="qt-ring__label">Progress</span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ────────────────────────────────────────────────────────────────────────── */
function QuizTaking({ quizId, attemptId, quizData, sessionToken, onSubmit, isStandardQuiz = false, screenStream, examSession, onScreenShareResumed, onRecordingStop, webcamStream }) {
  const { error: showError, success: showSuccess } = useToast()

  /* ── Question / answer state ─────────────────────────────────────────── */
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(() => {
    const totalSec = (quizData?.timeLimit || 30) * 60
    try {
      const startKey = `quiz_${quizId}_test_start_${attemptId}`
      const storedStart = sessionStorage.getItem(startKey)
      if (storedStart) {
        const elapsed = Math.floor((Date.now() - parseInt(storedStart, 10)) / 1000)
        if (elapsed >= 0) {
          return Math.max(0, totalSec - elapsed)
        }
      } else {
        sessionStorage.setItem(startKey, String(Date.now()))
      }
    } catch (_) {}
    return totalSec
  })
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)
  const [attemptInvalidMsg, setAttemptInvalidMsg] = useState(null)
  // AI Mentor panel visibility — the panel's own close (X) collapses it to a
  // reopen button, so the participant can reclaim sidebar space mid-quiz.
  const [mentorOpen, setMentorOpen] = useState(true)
  const timerRef = useRef(null)
  const answersRef = useRef(answers)

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  /* ── Post-submit result state ────────────────── */
  const [resultData, setResultData] = useState(null)

  /* ── Fullscreen + warning state ──────────────────────────────────────── */
  const [terminated, setTerminated] = useState(false)
  const submittedRef = useRef(false)
  const { isFullscreen, warnings, warningOpen, setWarningOpen } = useAssessmentFullscreen({ submittedRef, terminated })

  /* ── Screen share monitoring state ───────────────────────────────────── */
  const [isScreenSharing, setIsScreenSharing] = useState(!!screenStream)
  const [screenShareError, setScreenShareError] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const reconnectTimeoutRef = useRef(null)
  const SCREEN_SHARE_RECONNECT_TIMEOUT_MS = 30000

  const userData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const { containerRef, renderModals, violationCount: copyViolationCount, disqualified: isCopyDisqualified } = useQuizProtection({
    attemptId,
    quiz: quizData,
    initialViolationCount: quizData?.initialViolationCount || 0,
    initialStatus: quizData?.initialStatus || 'IN_PROGRESS',
    answers,
    onSubmit: () => {
      if (fsApi.element()) {
        try { fsApi.exit() } catch {}
      }
      onSubmit?.(null)
    },
    currentQ,
    enabled: quizData?.copyProtectionEnabled ?? true,
    // The shared monitoring engine owns browser events and their audit budget.
    monitorBrowserEvents: false,
    participantName: userData?.name || '',
    participantId: String(userData?.id || ''),
  })

  const questions = quizData?.questions || []
  const total = questions.length
  const q = questions[currentQ]

  /* ── Draft scope ──────────────────────────────────────────────────────────
     Saved answers are bound to {userId, attemptId, sessionToken digest,
     question-set digest}. A draft written under any other scope is rejected and
     deleted on read instead of restored, so a reused attempt id, a shared
     browser, or a stale previous-session entry cannot pre-fill this attempt's
     answers. Storage stays in sessionStorage — the same per-tab lifetime this
     screen has always had. */
  const draftStore = useMemo(
    () => (typeof window !== 'undefined' ? window.sessionStorage : null),
    [],
  )
  const questionIdsKey = questions.map(x => x?.id).join(',')
  const draftScope = useMemo(
    () => buildAttemptScope({
      kind: 'quiz',
      userId: userData?.id,
      attemptId,
      sessionToken,
      problemIds: questions.map(x => x?.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userData?.id, attemptId, sessionToken, questionIdsKey],
  )

  const flushOpenProctoringIntervals = useCallback(async () => {
    try {
      await monitoringClient._flushOpenIntervals(Date.now())
    } catch (_) {}
  }, [])

  /* ── handleSubmit (memoised — used by timer and manual submission) */
  const handleSubmit = useCallback(
    async ({ silent = false, autoSubmit = false } = {}) => {
      if (submitting || submittedRef.current) return
      submittedRef.current = true
      setSubmitting(true)
      setShowConfirmSubmit(false)
      setWarningOpen(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const currentAnswers = answersRef.current || {}
      // Build complete answers list including unanswered questions
      const answerArray = (quizData?.questions || []).map((qItem) => {
        const val = currentAnswers[qItem.id]
        return {
          questionId: qItem.id,
          selectedOption: val?.selectedOption !== undefined ? val.selectedOption : null,
          answerText: val?.answerText || null,
          matches: val?.matches || null
        }
      })

      try {
        // Pull token from prop first, fall back to sessionStorage so a
        // refresh-mid-exam still posts the correct header.
        let token = sessionToken
        try {
          if (!token) token = sessionStorage.getItem('quiz_session_token') || null
        } catch { /* private mode — ignore */ }
        const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }
        if (token) headers['X-Assessment-Session'] = token

        // Flush all open gaze, head, and absence intervals before final submission
        try {
          await flushOpenProctoringIntervals();
        } catch (_) {}

        const activeDurationSec = monitoringClient.getActiveDurationSeconds();

        const submitUrl = isStandardQuiz
          ? `${API_BASE}/participant/quizzes/${quizId}/submit`
          : `${API_BASE}/ai-quiz/participant/submit/${attemptId}`

        const body = isStandardQuiz
          ? JSON.stringify({ attemptId, answers: answerArray, timeTaken: activeDurationSec, actualTestDurationSeconds: activeDurationSec })
          : JSON.stringify({ answers: answerArray, timeTaken: activeDurationSec, actualTestDurationSeconds: activeDurationSec })

        const r = await fetch(submitUrl, {
          method: 'POST',
          headers,
          body,
        })
        const d = await r.json()
        if (!r.ok && r.status !== 409) throw new Error(d.error || 'Submit failed')
        
        // Finalize monitoring & video in background without blocking redirect
        try {
          monitoringClient.finishSession({ actualTestDurationSeconds: activeDurationSec }).catch(() => {})
        } catch (_) {}

        try {
          monitoringClient.stopAndUploadRecording().catch(() => {})
        } catch (_) {}

        try {
          monitoringClient.destroy()
        } catch (_) {}

        if (webcamStream) {
          try {
            webcamStream.getTracks().forEach(t => t.stop())
          } catch (_) {}
        }
        if (screenStream) {
          try {
            screenStream.getTracks().forEach(t => t.stop())
          } catch (_) {}
        }

        try {
          onRecordingStop?.()
        } catch (_) {}
        
        try {
          clearAttemptDraft(draftScope, { store: draftStore })
        } catch (_) {}

        if (fsApi.element()) { try { fsApi.exit().catch(() => {}) } catch (_) {} }
        
        if (!silent) {
          if (autoSubmit) {
            showSuccess('Time is up! Your quiz has been automatically submitted.')
          } else {
            showSuccess('Quiz submitted successfully!')
          }
        }

        // Navigate immediately after successful submission for BOTH
        // manual and auto-submit so the participant is not stuck.
        setResultData(null)
        onSubmit?.({ status: 'PENDING_RESULT', autoSubmitted: autoSubmit })
      } catch (err) {
        submittedRef.current = false
        setSubmitting(false)
        console.error('[QuizTaking] Submit failed:', err)
        if (!silent) {
          showError(err.message || 'Submission failed. Please try again.')
        }
      }
    },
    [attemptId, isStandardQuiz, quizId, quizData?.questions, sessionToken, flushOpenProctoringIntervals, onRecordingStop, webcamStream, screenStream, showSuccess, showError, onSubmit, draftScope, draftStore]
  )

  /* ── Auto-fullscreen on mount & lock active test start time ───────────── */
  useEffect(() => {
    // Lock exact active test start timestamp at second 1 of question rendering
    if (attemptId) {
      monitoringClient.startActiveTestTimer(attemptId, (quizData?.timeLimit || 30) * 60);
    }
    // Try once on mount. Browser may block without user gesture; the
    // fullscreenchange listener below is forgiving — it never punishes the
    // user for the initial state, only for EXITING after they're in.
    Promise.resolve(fsApi.request()).catch(() => { /* user gesture missing */ })
  }, [attemptId, quizData?.timeLimit])

  /* ── Pause / Resume Monitoring Timer when screen share / break occurs ─── */
  useEffect(() => {
    if (isPaused) {
      monitoringClient.pauseActiveTestTimer('SCREEN_SHARE_PAUSE_OR_BREAK');
    } else if (attemptId && !submittedRef.current) {
      monitoringClient.resumeActiveTestTimer('SCREEN_SHARE_RESUMED');
    }
  }, [isPaused, attemptId])

  /* ── Hide LMS chrome (sidebar + top header) while exam is mounted ───── */
  useEffect(() => {
    document.body.classList.add('qt-fullscreen-active')
    return () => {
      document.body.classList.remove('qt-fullscreen-active')
    }
  }, [])

  /* ── Clean up media streams and monitoring client on unmount ────────── */
  useEffect(() => {
    return () => {
      if (webcamStream) {
        try {
          webcamStream.getTracks().forEach((t) => t.stop())
        } catch (_) {}
      }
      if (screenStream) {
        try {
          screenStream.getTracks().forEach((t) => t.stop())
        } catch (_) {}
      }
      try {
        monitoringClient.destroy()
      } catch (_) {}
    }
  }, [webcamStream, screenStream])

  /* ── Screen share violation reporting ──────────────────────────────── */
  const reportViolation = useCallback(async (type, message) => {
    if (!examSession?.sessionId || !examSession?.sessionToken) return
    console.log('[QuizTaking] Reporting violation:', type)
    try {
      await fetch(`${API_BASE}/proctor/sessions/${examSession.sessionId}/violation`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'X-Proctor-Session-Token': examSession.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, message }),
      })
    } catch (e) {
      console.warn('[QuizTaking] Violation report failed:', e)
    }
  }, [examSession])

  /* ── Screen share reconnect / auto-submit ──────────────────────────── */
  const startReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('[QuizTaking] Screen share not restored; auto-submitting quiz')
      reportViolation('SCREEN_SHARE_STOPPED', 'Auto-submitted: screen share not restored in time')
      handleSubmit({ silent: true }).finally(() => {
        onSubmit?.(null)
      })
    }, SCREEN_SHARE_RECONNECT_TIMEOUT_MS)
  }, [handleSubmit, onSubmit, reportViolation])

  const resumeScreenShare = useCallback(async () => {
    console.log('[QuizTaking] Attempting to resume screen share...')
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      })
      const track = newStream.getVideoTracks()[0]
      track.addEventListener('ended', () => {
        console.log('[QuizTaking] Resumed screen share track ended again')
        setIsScreenSharing(false)
        setIsPaused(true)
        setScreenShareError('Screen sharing stopped again. Please resume.')
        reportViolation('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing again')
        startReconnectTimer()
      })
      setIsScreenSharing(true)
      setIsPaused(false)
      setScreenShareError(null)
      console.log('[QuizTaking] Screen share resumed')
      onScreenShareResumed?.(newStream)
    } catch (err) {
      console.error('[QuizTaking] Resume screen share failed:', err)
      setScreenShareError('Screen share required. Retry or the quiz will auto-submit.')
    }
  }, [onScreenShareResumed, reportViolation, startReconnectTimer])

  /* ── Watch screen share stream lifecycle ───────────────────────────── */
  useEffect(() => {
    console.log('[QuizTaking] Mounted — waiting for screen stream')
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!screenStream) {
      setIsScreenSharing(false)
      return
    }
    setIsScreenSharing(true)
    setScreenShareError(null)
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    console.log('[QuizTaking] Screen stream attached')

    const track = screenStream.getVideoTracks()[0]
    if (!track) return

    const onEnded = () => {
      console.log('[QuizTaking] Screen share track ended')
      setIsScreenSharing(false)
      setIsPaused(true)
      setScreenShareError('Screen sharing stopped. Please resume sharing to continue.')
      reportViolation('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing')
      startReconnectTimer()
    }

    track.addEventListener('ended', onEnded)

    return () => {
      track.removeEventListener('ended', onEnded)
    }
  }, [screenStream, reportViolation, startReconnectTimer])

  /* ── Status verification ONCE on mount (not on every question change) ──── */
  const statusCheckedRef = useRef(false)
  useEffect(() => {
    if (submittedRef.current || terminated || !attemptId) return
    if (statusCheckedRef.current) return
    statusCheckedRef.current = true

    let cancelled = false
    const verifyAttemptStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/quizzes/attempts/${attemptId}`, {
          headers: getAuthHeaders()
        })
        if (cancelled) return
        if (!res.ok) {
          if (res.status === 404) {
            setAttemptInvalidMsg('This attempt was not found on the server.')
            setTerminated(true)
          }
          return
        }
        const data = await res.json()
        const attempt = data.attempt
        if (attempt) {
          if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
            setAttemptInvalidMsg('This attempt has already been submitted.')
            setTerminated(true)
          } else if (attempt.status === 'disqualified_copy_violation' || attempt.status === 'disqualified_policy_violation') {
            setAttemptInvalidMsg('You have been disqualified for repeated policy violations.')
            setTerminated(true)
          }
        }
      } catch (err) {
        if (!cancelled) console.error('[QuizTaking] Failed to verify attempt status:', err)
      }
    }

    verifyAttemptStatus()
    return () => { cancelled = true }
  }, [attemptId, terminated])

  /* ── Countdown timer ─────────────────────────────────────────────────── */
  // Authoritative end timestamp derived once from the quiz start (persisted so a
  // refresh resumes the same countdown). The display is always recomputed from
  // this end timestamp rather than decremented, so it never jumps, skips or
  // repeats and always reaches exactly 0 at the exam end.
  const [endsAt, setEndsAt] = useState(() => {
    const totalSec = (quizData?.timeLimit || 30) * 60
    try {
      const startKey = `quiz_${quizId}_test_start_${attemptId}`
      const storedStart = parseInt(sessionStorage.getItem(startKey), 10)
      if (Number.isFinite(storedStart) && storedStart > 0) {
        return storedStart + totalSec * 1000
      }
    } catch (_) {}
    const start = parseInt(sessionStorage.getItem(`quiz_${quizId}_test_start_${attemptId}`), 10)
    const base = Number.isFinite(start) && start > 0 ? start : Date.now()
    try {
      sessionStorage.setItem(`quiz_${quizId}_test_start_${attemptId}`, String(base))
    } catch (_) {}
    return base + totalSec * 1000
  })

  useEffect(() => {
    if (isCopyDisqualified || isPaused || submittedRef.current) return
    if (!endsAt) return

    let timeout = null
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setTimeLeft(prev => {
        if (prev === next) return prev
        return next
      })
      if (next <= 0) return
      const msIntoSecond = Date.now() % 1000
      timeout = setTimeout(tick, (1000 - (msIntoSecond || 1000)) + 1)
    }

    tick()

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isCopyDisqualified, isPaused, endsAt])

  /* ── Auto-submit trigger when timer reaches exactly 0 ────────────────── */
  useEffect(() => {
    if (timeLeft === 0 && !submittedRef.current && !submitting && !isCopyDisqualified) {
      console.log('[QuizTaking] Time expired (0s). Automatically submitting quiz attempt...')
      handleSubmit({ autoSubmit: true, silent: false })
    }
  }, [timeLeft, submitting, isCopyDisqualified, handleSubmit])

  /* ── Autosave (scoped draft storage) ──────────────────────────────────── */
  const autosaveTimerRef = useRef(null)

  // Restore saved answers on mount
  useEffect(() => {
    // Two independent gates, both of which must pass before anything is
    // restored into the answer state:
    //   1. The backend is the source of truth for attempt lifecycle — only an
    //      attempt the server still reports as IN_PROGRESS may be restored.
    //   2. The draft must have been written under this exact scope; readAttemptDraft
    //      deletes and reports anything else rather than returning it.
    // Failing either gate leaves the attempt at its clean initial state (nothing
    // selected, nothing typed), which is the correct start for a fresh attempt.
    const attemptActive = quizData?.initialStatus === 'IN_PROGRESS'
    if (!attemptActive) {
      clearAttemptDraft(draftScope, { store: draftStore })
      return
    }

    purgeStaleAttemptDrafts(draftScope, { store: draftStore })

    const { data, rejected } = readAttemptDraft(draftScope, { store: draftStore })
    if (rejected) {
      console.warn('[QuizTaking] discarded a saved draft that did not belong to this attempt:', rejected)
      return
    }
    if (!data) return

    if (data.answers && Object.keys(data.answers).length > 0) {
      setAnswers(data.answers)
    }
    if (typeof data.currentQ === 'number' && data.currentQ > 0) {
      setCurrentQ(data.currentQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced save whenever answers or currentQ change
  useEffect(() => {
    if (submittedRef.current) return
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      writeAttemptDraft(draftScope, { answers, currentQ }, { store: draftStore })
    }, 2000)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [answers, currentQ, draftScope, draftStore])

  // Clear saved progress on submit
  useEffect(() => {
    if (submittedRef.current) {
      clearAttemptDraft(draftScope, { store: draftStore })
    }
  }, [draftScope, draftStore])

  /* ── Helpers / derived state ─────────────────────────────────────────── */
  const handleAnswer = (questionId, value) => {
    if (submitting || isCopyDisqualified) return
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const answeredCount = Object.keys(answers).length
  const unansweredCount = Math.max(0, total - answeredCount)
  const answeredPercent = total > 0 ? Math.round((answeredCount / total) * 100) : 0
  const progressPercent = total > 0 ? Math.round(((currentQ + 1) / total) * 100) : 0
  const isLastQuestion = currentQ === total - 1
  const timerUrgent = timeLeft < 300
  const timerWarning = timeLeft < 600 && !timerUrgent

  const goNext = () => setCurrentQ((p) => Math.min(total - 1, p + 1))
  const goPrev = () => setCurrentQ((p) => Math.max(0, p - 1))

  const optionLetters = useMemo(() => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [])

  const pairsList = useMemo(() => {
    if (!q?.pairs) return [];
    if (Array.isArray(q.pairs)) return q.pairs;
    if (typeof q.pairs === 'string') {
      try {
        return JSON.parse(q.pairs);
      } catch (e) {
        return [];
      }
    }
    return [];
  }, [q?.pairs]);

  const matchingRightOptions = useMemo(() => {
    if (q?.questionType !== 'MATCHING') return [];
    const uniqueRights = [...new Set(pairsList.map(p => p.right).filter(Boolean))];
    return uniqueRights.sort();
  }, [q?.id, q?.questionType, pairsList]);

  const reEnterFullscreen = async () => {
    try {
      await fsApi.request()
      setWarningOpen(false)
    } catch {
      // Browser refused (e.g. iframe perms) — keep modal open.
    }
  }

  /* ── Loading guard ──────────────────────────────────────────────────── */
  if (!quizData?.questions) {
    return (
      <div className="qt-loading-card">
        <Loader size={28} className="qt-spin" />
        <p>Loading quiz</p>
        <span>Preparing your assessment…</span>
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="qt-app" role="main" aria-label="Exam in progress">
      <QuizWatermark
        participantName={userData?.name || ''}
        participantId={String(userData?.id || '')}
      />
      {renderModals()}
      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <header className="qt-header">
        <div className="qt-header__row">
          <div className="qt-header__brand-block">
            <span className="qt-brand-pill">WAVE INIT LMS</span>
            <h1 className="qt-header__title" title={quizData.title}>
              {quizData.title || 'Assessment'}
            </h1>
          </div>

          <div className="qt-header__meta">
            {(warnings > 0 || copyViolationCount > 0) && (
              <span
                className={[
                  'qt-warn-badge',
                  (warnings >= 2 || copyViolationCount >= (quizData?.maxCopyWarnings || 3) - 1) ? 'qt-warn-badge--danger' : 'qt-warn-badge--warn',
                ].join(' ')}
                aria-live="assertive"
              >
                <AlertTriangle size={13} aria-hidden />
                {warnings > 0 && `Exits: ${warnings}`}
                {warnings > 0 && copyViolationCount > 0 && ' | '}
                {copyViolationCount > 0 && `Copy: ${copyViolationCount}/${quizData?.maxCopyWarnings || 3}`}
              </span>
            )}
            <span
              className={[
                'qt-timer',
                timerUrgent ? 'qt-timer--urgent' : timerWarning ? 'qt-timer--warning' : '',
              ].join(' ')}
              aria-label={`Time remaining ${formatTime(timeLeft)}`}
            >
              <Clock size={14} aria-hidden />
              <span className="qt-timer__value">{formatTime(timeLeft)}</span>
            </span>
            <span className="qt-q-counter">
              <span className="qt-q-counter__label">Q</span>
              <span className="qt-q-counter__num">{currentQ + 1}</span>
              <span className="qt-q-counter__sep"> of </span>
              <span className="qt-q-counter__total">{total}</span>
            </span>
          </div>
        </div>

        {/* Progress rail */}
        <div className="qt-rail" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <motion.div
            className="qt-rail__fill"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </header>

      {/* ─── BODY: question pane + sidebar ──────────────────────────── */}
      <div className="qt-body">
        {/* MAIN — question card + footer nav */}
        <main className="qt-main">
          <AnimatePresence mode="wait">
            <motion.article
              ref={containerRef}
              key={q.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
              className="qt-qcard"
            >
              <div className="qt-qcard__label">
                QUESTION {currentQ + 1} <span aria-hidden> · </span>
                {q.questionType === 'MCQ' && 'MULTIPLE CHOICE'}
                {q.questionType === 'TRUE_FALSE' && 'TRUE / FALSE'}
                {q.questionType === 'FILL_BLANK' && 'FILL IN THE BLANK'}
                {q.questionType === 'MATCHING' && 'MATCHING QUESTION'}
                {(!q.questionType || q.questionType === 'SHORT_ANSWER') && 'WRITTEN ANSWER'}
              </div>
              <h2 className="qt-qcard__text">{q.questionText}</h2>

              {['MCQ', 'TRUE_FALSE'].includes(q.questionType) ? (
                <ul className="qt-options" role="radiogroup" aria-label="Answer options">
                  {q.options?.map((opt, idx) => {
                    const selected = answers[q.id]?.selectedOption === idx
                    return (
                      <li key={idx}>
                        <button
                          type="button"
                          role="radio"
                          disabled={submitting || isCopyDisqualified}
                          aria-checked={selected}
                          onClick={() => handleAnswer(q.id, { selectedOption: idx })}
                          className={['qt-option', selected ? 'qt-option--selected' : ''].join(' ')}
                        >
                          <span className="qt-option__radio" aria-hidden>
                            {selected && <span className="qt-option__radio-dot" />}
                          </span>
                          <span className="qt-option__letter">{optionLetters[idx] || String.fromCharCode(65 + idx)}</span>
                          <span className="qt-option__text">{opt}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : q.questionType === 'FILL_BLANK' ? (
                <div className="qt-fillblank-container">
                  <input
                    type="text"
                    disabled={submitting || isCopyDisqualified}
                    className="qt-textarea"
                    style={{ height: '48px', padding: '12px 16px', resize: 'none' }}
                    placeholder="Type the word that fits the blank..."
                    value={answers[q.id]?.answerText || ''}
                    onChange={(e) => handleAnswer(q.id, { answerText: e.target.value })}
                  />
                </div>
              ) : q.questionType === 'MATCHING' ? (
                <div className="qt-matching">
                  <p className="qt-matching__instructions" style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    Match each term on the left with its definition on the right:
                  </p>
                  <div className="qt-matching__list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {pairsList.map((pair, idx) => {
                      const leftVal = pair.left;
                      const selectedRight = answers[q.id]?.matches?.[leftVal] || '';
                      return (
                        <div key={idx} className="qt-matching-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="qt-matching-row__left" style={{ flex: '1', fontWeight: '500', fontSize: '14px', color: '#1e293b' }}>
                            {leftVal}
                          </div>
                          <div className="qt-matching-row__arrow" style={{ color: '#94a3b8' }}>→</div>
                          <div className="qt-matching-row__right" style={{ flex: '1.5' }}>
                            <select
                              disabled={submitting || isCopyDisqualified}
                              value={selectedRight}
                              onChange={(e) => {
                                const currentMatches = answers[q.id]?.matches || {};
                                const updatedMatches = { ...currentMatches, [leftVal]: e.target.value };
                                handleAnswer(q.id, {
                                  matches: updatedMatches,
                                  answerText: JSON.stringify(updatedMatches)
                                });
                              }}
                              style={{
                                width: '100%',
                                height: '40px',
                                padding: '0 12px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                background: '#fff',
                                fontSize: '13px',
                                outline: 'none',
                                color: '#334155'
                              }}
                            >
                              <option value="">-- Choose matching definition --</option>
                              {matchingRightOptions.map((rightOpt, oIdx) => (
                                <option key={oIdx} value={rightOpt}>
                                  {rightOpt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <textarea
                  disabled={submitting || isCopyDisqualified}
                  className="qt-textarea"
                  placeholder="Type your answer here…"
                  value={answers[q.id]?.answerText || ''}
                  onChange={(e) => handleAnswer(q.id, { answerText: e.target.value })}
                  rows={6}
                />
              )}
            </motion.article>
          </AnimatePresence>

          {/* Footer nav: prev / dots / next */}
          <nav className="qt-foot" aria-label="Question navigation">
            <button
              type="button"
              className="qt-foot__btn qt-foot__btn--ghost"
              onClick={goPrev}
              disabled={currentQ === 0 || submitting || isCopyDisqualified}
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div className="qt-dots" aria-hidden>
              {questions.slice(0, Math.min(total, 12)).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={submitting || isCopyDisqualified}
                  onClick={() => setCurrentQ(idx)}
                  aria-label={`Go to question ${idx + 1}`}
                  className={[
                    'qt-dot',
                    idx === currentQ
                      ? 'qt-dot--current'
                      : answers[questions[idx].id]
                        ? 'qt-dot--done'
                        : 'qt-dot--todo',
                  ].join(' ')}
                />
              ))}
            </div>

            {!isLastQuestion ? (
              <button
                type="button"
                className="qt-foot__btn qt-foot__btn--primary"
                onClick={goNext}
                disabled={submitting || isCopyDisqualified}
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="qt-foot__btn qt-foot__btn--primary"
                onClick={() => setShowConfirmSubmit(true)}
                disabled={submitting || isCopyDisqualified}
              >
                <Send size={15} /> Submit
              </button>
            )}
          </nav>
        </main>

        {/* SIDEBAR */}
        <aside className="qt-side" aria-label="Quiz progress and navigator">
          {/* The assessment exposes one mentor surface, fixed at the top of the rail. */}
          {!submitting && !submittedRef.current && !isCopyDisqualified && q && (
            mentorOpen ? (
              <div className="qt-side__panel qt-side__panel--mentor">
                <div className="qt-mentor-box">
                  <AssessmentAIMentor
                    assessmentType="QUIZ"
                    user={userData}
                    attemptId={attemptId}
                    question={q}
                    sessionToken={sessionToken}
                    onError={(msg) => showError(msg)}
                    onClose={() => setMentorOpen(false)}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="qt-mentor-reopen"
                onClick={() => setMentorOpen(true)}
              >
                Open AI Mentor
              </button>
            )
          )}

          <div className="qt-side__panel qt-side__panel--ring">
            <ProgressRing percent={answeredPercent} />
          </div>

          <div className="qt-side__stats">
            <div className="qt-stat qt-stat--ok">
              <span className="qt-stat__value">{answeredCount}</span>
              <span className="qt-stat__label">Answered</span>
            </div>
            <div className="qt-stat qt-stat--bad">
              <span className="qt-stat__value">{unansweredCount}</span>
              <span className="qt-stat__label">Remaining</span>
            </div>
          </div>

          <div className="qt-side__panel">
            <h3 className="qt-side__heading">Question navigator</h3>
            <div className="qt-nav-grid">
              {questions.map((question, idx) => {
                const answered = !!answers[question.id]
                const current = idx === currentQ
                return (
                  <button
                    key={question.id}
                    type="button"
                    disabled={submitting || isCopyDisqualified}
                    onClick={() => setCurrentQ(idx)}
                    aria-label={`Question ${idx + 1}${answered ? ' answered' : ''}${current ? ' current' : ''}`}
                    aria-current={current ? 'true' : undefined}
                    className={[
                      'qt-nav-cell',
                      current ? 'qt-nav-cell--current' : '',
                      answered && !current ? 'qt-nav-cell--done' : '',
                    ].join(' ')}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            className="qt-submit-btn"
            onClick={() => setShowConfirmSubmit(true)}
            disabled={submitting || submittedRef.current || isCopyDisqualified}
          >
            <CheckCircle2 size={15} /> Submit quiz
          </button>

          <div className={`qt-fs-status ${isFullscreen ? 'qt-fs-status--ok' : 'qt-fs-status--warn'}`}>
            {isFullscreen ? (
              <>
                <ShieldCheck size={13} aria-hidden />
                Fullscreen mode active
              </>
            ) : (
              <>
                <ShieldAlert size={13} aria-hidden />
                Fullscreen required
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ─── Submit confirmation modal ──────────────────────────────── */}
      <AnimatePresence>
        {showConfirmSubmit && !terminated && (
          <motion.div
            key="confirm-bg"
            className="qt-modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !submitting && setShowConfirmSubmit(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="qt-confirm-title"
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="qt-modal qt-modal--confirm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="qt-confirm-title" className="qt-modal__title">Submit quiz?</h2>
              <p className="qt-modal__desc">You cannot change answers after submitting.</p>
              <div className="qt-modal__rows">
                <div><span>Answered</span><strong>{answeredCount} / {total}</strong></div>
                <div><span>Time left</span><strong>{formatTime(timeLeft)}</strong></div>
                <div><span>Completion</span><strong>{answeredPercent}%</strong></div>
              </div>
              <div className="qt-rail" style={{ marginTop: 14 }}>
                <div className="qt-rail__fill" style={{ width: `${answeredPercent}%` }} />
              </div>

              {unansweredCount > 0 && (
                <div className="qt-modal__warn">
                  <AlertTriangle size={15} />
                  <span>{unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''} will score zero.</span>
                </div>
              )}

              <div className="qt-modal__actions">
                <button
                  type="button"
                  className="qt-foot__btn qt-foot__btn--ghost"
                  onClick={() => setShowConfirmSubmit(false)}
                  disabled={submitting}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="qt-foot__btn qt-foot__btn--primary"
                  onClick={() => { handleSubmit() }}
                  disabled={submitting || submittedRef.current}
                >
                  {submitting ? (<><Loader size={15} className="qt-spin" /> Submitting…</>) : (<><CheckCircle2 size={15} /> Submit now</>)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Fullscreen warning modal ──────────────── */}
      <AnimatePresence>
        {warningOpen && !terminated && (
          <motion.div
            key="warn-bg"
            className="qt-modal-bg qt-modal-bg--warn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="qt-warn-title"
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="qt-modal qt-modal--warn"
            >
              <div className="qt-modal__icon-wrap qt-modal__icon-wrap--warn">
                <AlertTriangle size={32} />
              </div>
              <h2 id="qt-warn-title" className="qt-modal__title">
                <FullscreenWarningTitle warnings={warnings} />
              </h2>
              <p className="qt-modal__desc">
                <FullscreenWarningDescription />
              </p>
              <button
                type="button"
                className="qt-foot__btn qt-foot__btn--primary qt-foot__btn--block"
                onClick={reEnterFullscreen}
                autoFocus
              >
                <Maximize2 size={15} /> Return to fullscreen
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Invalid / ended attempt overlay ───────────────────────────── */}
      <AnimatePresence>
        {terminated && (
          <motion.div
            key="term-bg"
            className="qt-modal-bg qt-modal-bg--terminate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="qt-term-title"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="qt-modal qt-modal--terminate"
            >
              <div className="qt-modal__icon-wrap qt-modal__icon-wrap--danger">
                <XCircle size={32} />
              </div>
              <h2 id="qt-term-title" className="qt-modal__title">Exam terminated</h2>
              <p className="qt-modal__desc">
                {attemptInvalidMsg || 'Your attempt has ended. Your submitted answers have been saved.'}
              </p>
              <div className="qt-modal__hint">
                {attemptInvalidMsg ? (
                  <button
                    type="button"
                    className="qt-foot__btn qt-foot__btn--primary"
                    onClick={() => {
                      if (fsApi.element()) { try { fsApi.exit() } catch {} }
                      onSubmit?.(null)
                    }}
                    style={{ margin: '12px auto 0', justifyContent: 'center' }}
                  >
                    Return to Dashboard
                  </button>
                ) : (
                  <><Loader size={14} className="qt-spin" /> Returning to your dashboard…</>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Screen share paused overlay ───────────────────────────────── */}
      <AnimatePresence>
        {isPaused && !terminated && (
          <motion.div
            key="pause-bg"
            className="qt-modal-bg qt-modal-bg--terminate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="qt-pause-title"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="qt-modal qt-modal--terminate"
              style={{ maxWidth: 440 }}
            >
              <div className="qt-modal__icon-wrap qt-modal__icon-wrap--danger">
                <MonitorPlay size={32} />
              </div>
              <h2 id="qt-pause-title" className="qt-modal__title">Screen sharing paused</h2>
              <p className="qt-modal__desc">
                {screenShareError || 'You must share your screen to continue the assessment.'}
              </p>
              <p className="qt-modal__desc" style={{ fontSize: 12, color: '#94a3b8', marginTop: -8 }}>
                The quiz will auto-submit if screen sharing is not resumed within 30 seconds.
              </p>
              <div className="qt-modal__actions" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="qt-foot__btn qt-foot__btn--primary qt-foot__btn--block"
                  onClick={resumeScreenShare}
                  autoFocus
                >
                  <MonitorPlay size={15} /> Resume Screen Sharing
                </button>
                <button
                  type="button"
                  className="qt-foot__btn qt-foot__btn--ghost qt-foot__btn--block"
                  onClick={() => {
                    if (fsApi.element()) { try { fsApi.exit() } catch {} }
                    onSubmit?.(null)
                  }}
                >
                  Cancel Assessment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Post-submit success page ──────────────────────────────────── */}
      <AnimatePresence>
        {resultData && (
          <motion.div
            key="result-bg"
            className="qt-modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-labelledby="qt-result-title"
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="qt-modal qt-modal--result"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 440, textAlign: 'center' }}
            >
              <div
                className="qt-modal__icon-wrap"
                style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: '#ecfdf5',
                  color: '#16a34a',
                  margin: '0 auto 16px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h2 id="qt-result-title" className="qt-modal__title" style={{ fontSize: 20 }}>
                Quiz Submitted Successfully
              </h2>
              <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, marginTop: 12, marginBottom: 4 }}>
                Your answers have been saved successfully.
              </p>
              <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                Please wait until your trainer publishes the results.
              </p>
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                padding: '12px 16px', marginBottom: 16, display: 'inline-flex',
                alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#92400e'
              }}>
                <span style={{ fontSize: 16 }}>🟡</span>
                Waiting for Result Publication
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7, marginBottom: 20 }}>
                Once the results are published, you will be able to view:<br />
                • Your Score &amp; Percentage<br />
                • Rank &amp; Leaderboard<br />
                • Correct Answers (if enabled)
              </div>
              <button
                type="button"
                className="qt-foot__btn qt-foot__btn--primary"
                onClick={() => { setResultData(null); onSubmit?.(resultData) }}
                style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
              >
                Back to Dashboard
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

export default QuizTaking
