import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AssessmentConsentGate from '../components/ai-quizzes/AssessmentConsentGate'
import UnifiedMonitoringWidget from '../components/monitoring/UnifiedMonitoringWidget'
import { API_BASE, BACKEND_ORIGIN } from '../api/api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ui/AlertModal'
import { ProctorProvider, useProctor } from '../proctoring/ProctorContext'
import useDeviceFingerprint from '../proctoring/hooks/useDeviceFingerprint'
import { Loader2, AlertCircle, Play, Check, Clock, Send, Save, Terminal, Bug, Trash2, CheckCircle2, XCircle, ChevronRight, Award, Sparkles } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import ProblemPanel from '../components/ProblemPanel'
import CodingAiAssistant from '../components/CodingAiAssistant'
import ExamProctorShell from '../proctoring/components/ExamProctorShell'
import monitoringClient from '../proctoring/engine/MonitoringEngineClient'
import { io as socketIO } from 'socket.io-client'

const STORAGE_PREFIX = 'coding_attempt_state_'
const AUTO_SAVE_INTERVAL = 10000
const SERVER_SAVE_INTERVAL = 30000
const WS_URL = BACKEND_ORIGIN

// ── Structured Debug Logger ──
const DEBUG_PREFIX = '[CodingAssessment Debug]'
let apiCallCounter = 0
let debugEnabled = false
const setDebugLogEnabled = (v) => { debugEnabled = v }
const debugLog = {
  info: (...args) => { if (debugEnabled) console.log(`%c${DEBUG_PREFIX}`, 'color: #10B981; font-weight: bold;', ...args) },
  warn: (...args) => { if (debugEnabled) console.warn(`%c${DEBUG_PREFIX}`, 'color: #F59E0B; font-weight: bold;', ...args) },
  error: (...args) => { if (debugEnabled) console.error(`%c${DEBUG_PREFIX}`, 'color: #EF4444; font-weight: bold;', ...args) },
  api: (action, details) => {
    if (!debugEnabled) return
    apiCallCounter++
    console.log(`%c${DEBUG_PREFIX} [API Call #${apiCallCounter}]`, 'color: #3B82F6; font-weight: bold;', action, details || '')
  },
  nav: (from, to, reason) => { if (debugEnabled) console.log(`%c${DEBUG_PREFIX} [NAVIGATION]`, 'color: #8B5CF6; font-weight: bold;', `Question ${from} ➔ Question ${to}`, reason ? `(${reason})` : '') },
  perf: (label, durationMs) => { if (debugEnabled) console.log(`%c${DEBUG_PREFIX} [PERFORMANCE]`, 'color: #EC4899; font-weight: bold;', `${label}: ${(durationMs / 1000).toFixed(2)}s (${durationMs.toFixed(0)}ms)`) },
}

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

function getStorageKey(attemptId) {
  return `${STORAGE_PREFIX}${attemptId}`
}

const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  exit: () =>
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
}

const LANGUAGE_MAP = {
  javascript: 'javascript', python: 'python', java: 'java', cpp: 'cpp',
  c: 'c', csharp: 'csharp', typescript: 'typescript', go: 'go',
  rust: 'rust', php: 'php', kotlin: 'kotlin',
}

const LANGUAGE_LABELS = {
  javascript: 'JavaScript', python: 'Python', java: 'Java', cpp: 'C++',
  c: 'C', csharp: 'C#', typescript: 'TypeScript', go: 'Go',
  rust: 'Rust', php: 'PHP', kotlin: 'Kotlin',
}

const languageLabel = (id) => LANGUAGE_LABELS[id] || id || ''

function createInitialQuestionState(problem, saved = null, latestSub = null) {
  const langConfigs = Array.isArray(problem?.languages) ? problem.languages : []
  const langMap = {}
  langConfigs.forEach(l => { langMap[l.language] = l.starterCode || '' })
  const starterFor = (lang) => langMap[lang] ?? problem?.starterCode ?? ''

  const lang = saved?.language || latestSub?.language || problem?.allowedLanguages?.[0] || problem?.programmingLanguage || problem?.language || 'javascript'
  const code = saved?.code ?? (latestSub?.code || starterFor(lang))
  const lastSubmittedCode = latestSub?.code || (saved?.isCompleted ? saved.lastSubmittedCode || code : '')
  const isCompleted = Boolean(latestSub?.status && latestSub.status !== 'PENDING' && latestSub.totalTestCases > 0) || Boolean(saved?.isCompleted)
  const isModified = Boolean(isCompleted && code && lastSubmittedCode && code !== lastSubmittedCode)
  const status = isCompleted ? (isModified ? 'in_progress' : 'completed') : (saved?.status || (code && code !== starterFor(lang) ? 'in_progress' : 'not_started'))

  return {
    id: problem.id,
    code,
    savedCode: code,
    lastSubmittedCode,
    language: lang,
    drafts: saved?.drafts || {},
    status,
    isCompleted,
    isSubmitting: false,
    isModified,
    output: saved?.output || latestSub?.compilerOutput || latestSub?.errorMessage || '',
    sampleResults: saved?.sampleResults || latestSub?.results || [],
    runStatus: saved?.runStatus || '',
    runTime: saved?.runTime ?? latestSub?.executionTime ?? null,
    runMemory: saved?.runMemory ?? latestSub?.memoryUsed ?? null,
    submitVerdict: saved?.submitVerdict || latestSub?.status || null,
    submitScore: saved?.submitScore ?? (latestSub?.score != null ? latestSub.score : null),
    submitPassed: saved?.submitPassed ?? (latestSub?.passedTestCases != null ? latestSub.passedTestCases : null),
    submitTotal: saved?.submitTotal ?? (latestSub?.totalTestCases != null ? latestSub.totalTestCases : null),
    submissionId: saved?.submissionId || latestSub?.id || null,
    judgeStatus: null,
    activeTab: saved?.activeTab || 'output',
    customInput: saved?.customInput || '',
    timeSpentSeconds: saved?.timeSpentSeconds || 0,
    editCount: saved?.editCount || 0,
    typedChars: saved?.typedChars || 0,
    runAttempts: saved?.runAttempts || 0,
  }
}

function getLangStarter(problem, lang) {
  const langConfigs = Array.isArray(problem?.languages) ? problem.languages : []
  const found = langConfigs.find(l => l.language === lang)
  return (found && found.starterCode) || problem?.starterCode || ''
}

const AssessmentTimer = React.memo(function AssessmentTimer({
  timeLimitMinutes = 60,
  testStartKey,
  onExpire,
  submitted
}) {
  const totalSeconds = (timeLimitMinutes || 60) * 60
  const [timeLeft, setTimeLeft] = useState(() => {
    try {
      const stored = sessionStorage.getItem(testStartKey)
      if (stored) {
        const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000)
        return Math.max(0, totalSeconds - elapsed)
      }
    } catch (_) {}
    return totalSeconds
  })

  const expiredRef = useRef(false)

  useEffect(() => {
    if (submitted || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          if (!expiredRef.current) {
            expiredRef.current = true
            onExpire?.()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [submitted, onExpire])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: timeLeft < 300 ? '#FEF2F2' : '#F0FDF4',
      border: `1px solid ${timeLeft < 300 ? '#FECACA' : '#BBF7D0'}`,
      color: timeLeft < 300 ? '#DC2626' : '#15803D',
      padding: '4px 10px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums'
    }}>
      <Clock size={13} color={timeLeft < 300 ? '#DC2626' : '#15803D'} />
      <span>{formatTime(timeLeft)}</span>
    </div>
  )
})

function ParticipantCodingAttemptInner({ user }) {
  const navigate = useNavigate()
  const { trainingId, assessmentId } = useParams()
  const [searchParams] = useSearchParams()
  const { error: showError, success: showSuccess } = useToast()
  const proctor = useProctor()
  const fp = useDeviceFingerprint()

  let attemptId = searchParams.get('attemptId')
  let sessionToken = searchParams.get('sessionToken')
  let monitoringSessionId = searchParams.get('monitoringSessionId')
  const storageKey = getStorageKey(attemptId)

  if (assessmentId) {
    if (attemptId && sessionToken) {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptId, sessionToken, monitoringSessionId }))
    } else {
      const cached = sessionStorage.getItem(storageKey)
      if (cached) {
        try {
          const p = JSON.parse(cached)
          attemptId = attemptId || p.attemptId
          sessionToken = sessionToken || p.sessionToken
          monitoringSessionId = monitoringSessionId || p.monitoringSessionId
        } catch {}
      }
    }
  }

  const confirm = useConfirm()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [problems, setProblems] = useState([])
  const [consented, setConsented] = useState(false)
  const [sharedCamStream, setSharedCamStream] = useState(null)
  const [resolvedMonitoringSessionId, setResolvedMonitoringSessionId] = useState(monitoringSessionId || null)

  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [questionState, setQuestionState] = useState({})
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitAllProgress, setSubmitAllProgress] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [debugMode, setDebugMode] = useState(() => {
    try { return sessionStorage.getItem('coding_debug_mode') === '1' } catch { return false }
  })

  const activeTimeRef = useRef({})

  const timerRef = useRef(null)
  const autoSaveRef = useRef(null)
  const serverSaveRef = useRef(null)
  const questionStateRef = useRef(questionState)
  const socketRef = useRef(null)
  const startTimeRef = useRef(null)
  const runningRef = useRef(false)
  const submittingRef = useRef(false)
  const submittedRef = useRef(false)
  const activeSubmissionPollingRef = useRef({})

  useEffect(() => { questionStateRef.current = questionState }, [questionState])
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { setDebugLogEnabled(Boolean(debugMode)) }, [debugMode])

  const currentProblem = problems[currentProblemIndex] || null
  const currentQState = currentProblem ? questionState[currentProblem.id] || {} : {}

  const updateQuestion = useCallback((problemId, updates) => {
    setQuestionState(prev => {
      const existing = prev[problemId] || {}
      const merged = { ...existing, ...updates }
      return { ...prev, [problemId]: merged }
    })
  }, [])

  // ── Socket.IO Connection & Live Updates ──
  useEffect(() => {
    if (!user?.token) return
    try {
      const sock = socketIO(WS_URL, {
        auth: { token: user.token },
        transports: ['websocket', 'polling'],
      })
      sock.on('connect', () => {
        debugLog.info('WebSocket connected for coding evaluation')
        if (attemptId) sock.emit('coding:join', { assessmentId, participantId: user.id })
      })

      sock.on('submission:progress', (data) => {
        if (!data?.submissionId) return
        debugLog.info('WebSocket progress received:', data)

        setQuestionState(prev => {
          let targetProblemId = null
          for (const [pId, q] of Object.entries(prev)) {
            if (q.submissionId === data.submissionId || q.isSubmitting) {
              targetProblemId = Number(pId)
              break
            }
          }
          if (!targetProblemId) return prev

          const currentQ = prev[targetProblemId]
          const isDone = data.status && ['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'INTERNAL_ERROR', 'FAILED'].includes(data.status)

          let judgeStatus = null
          if (!isDone) {
            if (data.status === 'PENDING' || data.status === 'QUEUED') judgeStatus = 'Queued...'
            else if (data.status === 'COMPILING') judgeStatus = 'Compiling...'
            else if (data.status === 'RUNNING') judgeStatus = data.message || 'Running test cases...'
          }

          const updatedQ = {
            ...currentQ,
            judgeStatus,
            ...(isDone ? {
              isSubmitting: false,
              isCompleted: true,
              status: 'completed',
              isModified: false,
              lastSubmittedCode: currentQ.code,
              submitVerdict: data.status,
              submitPassed: data.passedTestCases ?? currentQ.submitPassed,
              submitTotal: data.totalTestCases ?? currentQ.submitTotal,
              submitScore: data.score ?? currentQ.submitScore,
              sampleResults: data.results ? data.results.filter(r => !r.isHidden) : currentQ.sampleResults,
              output: data.compilerOutput || data.errorMessage || currentQ.output,
            } : {})
          }

          if (isDone) {
            debugLog.info(`Evaluation completed via WebSocket for Problem ${targetProblemId}: Verdict ${data.status}`)
          }

          return { ...prev, [targetProblemId]: updatedQ }
        })
      })

      sock.on('disconnect', () => debugLog.warn('WebSocket disconnected'))
      socketRef.current = sock
    } catch (e) {
      debugLog.warn('Failed to connect WebSocket', e)
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [user?.token, assessmentId, user?.id, attemptId])

  // ── Load Assessment & Initialize Per-Question State ──
  useEffect(() => {
    if (!assessmentId || !attemptId) {
      setErrorMsg('Invalid assessment or attempt identifiers.')
      setLoading(false)
      return
    }
    let aborted = false
    const fetchAssessment = async () => {
      try {
        setLoading(true)
        const qParams = attemptId ? `?attemptId=${attemptId}` : ''
        debugLog.api('GET /coding/assessments/:id', { assessmentId, attemptId })
        const token = user?.token || user?.accessToken
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const res = await fetch(`${API_BASE}/coding/assessments/${assessmentId}${qParams}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        const data = await res.json()
        if (aborted) return
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to load assessment.')
          setLoading(false)
          return
        }

        const a = data.assessment
        const problemList = a.problems || []
        setAssessment(a)
        setProblems(problemList)

        // Load saved state from localStorage
        const savedState = loadSavedState(attemptId)
        const initialQState = {}

        problemList.forEach(p => {
          const savedQ = savedState?.questions?.[p.id] || null
          const latestSub = p.latestSubmission || null
          initialQState[p.id] = createInitialQuestionState(p, savedQ, latestSub)
        })

        setQuestionState(initialQState)
        debugLog.info(`Loaded ${problemList.length} questions into state`, initialQState)

        const now = Date.now()
        if (savedState?.startedAt) {
          startTimeRef.current = savedState.startedAt
        } else {
          startTimeRef.current = now
        }

        // Determine starting problem index: first incomplete problem or saved index
        let startingIdx = 0
        if (savedState?.currentProblemIndex != null && savedState.currentProblemIndex < problemList.length) {
          startingIdx = savedState.currentProblemIndex
        } else {
          const firstIncomplete = problemList.findIndex(p => !initialQState[p.id]?.isCompleted)
          startingIdx = firstIncomplete !== -1 ? firstIncomplete : 0
        }
        setCurrentProblemIndex(startingIdx)
        debugLog.info(`Starting at Question index ${startingIdx + 1}`)

        setLoading(false)
      } catch (err) {
        if (!aborted) {
          setErrorMsg(err.message || 'Server error loading assessment.')
          setLoading(false)
        }
      }
    }
    fetchAssessment()
    return () => { aborted = true }
  }, [assessmentId, attemptId, user.token])

  function loadSavedState(attId) {
    try {
      const raw = localStorage.getItem(getStorageKey(attId))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function persistState() {
    if (!attemptId) return
    try {
      const merged = { ...questionStateRef.current }
      for (const [pId, q] of Object.entries(merged)) {
        merged[pId] = {
          ...q,
          timeSpentSeconds: activeTimeRef.current[pId] || q.timeSpentSeconds || 0
        }
      }
      localStorage.setItem(getStorageKey(attemptId), JSON.stringify({
        questions: merged,
        currentProblemIndex,
        startedAt: startTimeRef.current || Date.now(),
        updatedAt: Date.now()
      }))
    } catch {}
  }

  const autoSaveCallback = useCallback(() => {
    persistState()
    setSaveStatus('Saved')
    setTimeout(() => setSaveStatus(prev => prev === 'Saved' ? '' : prev), 2000)
  }, [attemptId, currentProblemIndex])

  useEffect(() => {
    if (!attemptId || submitted) return
    autoSaveRef.current = setInterval(autoSaveCallback, AUTO_SAVE_INTERVAL)
    return () => clearInterval(autoSaveRef.current)
  }, [attemptId, submitted, autoSaveCallback])

  // ── Optimized Batch Save to Server ──
  const saveToServer = useCallback(async () => {
    if (!attemptId || !user?.token || submittingRef.current || submittedRef.current) return
    const saves = []
    for (const [problemId, q] of Object.entries(questionStateRef.current)) {
      if (q.code) {
        saves.push({
          problemId: Number(problemId),
          code: q.code,
          language: q.language || 'javascript',
          timeSpentSeconds: activeTimeRef.current[problemId] || q.timeSpentSeconds || 0
        })
      }
    }
    if (saves.length === 0) return

    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken

      debugLog.api('POST /coding/participant/save-batch', { count: saves.length })
      await fetch(`${API_BASE}/coding/participant/save-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ attemptId: Number(attemptId), saves })
      })
    } catch (err) {
      debugLog.warn('Background save error:', err.message)
    }
  }, [attemptId, user?.token, sessionToken])

  useEffect(() => {
    if (!attemptId || submitted) return
    serverSaveRef.current = setInterval(saveToServer, SERVER_SAVE_INTERVAL)
    return () => clearInterval(serverSaveRef.current)
  }, [attemptId, submitted, saveToServer])

  const [testStartedAt, setTestStartedAt] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`coding_${assessmentId}_test_start_${attemptId}`)
      return cached ? parseInt(cached, 10) : null
    } catch {
      return null
    }
  })

  const handleConsented = useCallback((stream) => {
    if (stream) setSharedCamStream(stream)
    const start = Date.now()
    setTestStartedAt(start)
    try {
      sessionStorage.setItem(`coding_${assessmentId}_test_start_${attemptId}`, String(start))
    } catch {}
    if (attemptId) {
      monitoringClient.startActiveTestTimer(attemptId, (assessment?.timeLimit || 60) * 60)
    }
    setConsented(true)
  }, [assessmentId, attemptId, assessment?.timeLimit])

  // Watch for focus/blur to pause/resume active duration tracking
  useEffect(() => {
    if (!consented || submitted) return
    const onBlur = () => monitoringClient.pauseActiveTestTimer('TAB_SWITCH')
    const onFocus = () => monitoringClient.resumeActiveTestTimer('RESUMED')

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [consented, submitted])

  // ── Active Time Tracking per Question (High Performance - Ref Based) ──
  useEffect(() => {
    if (!consented || submitted || !currentProblem?.id) return
    const pId = currentProblem.id
    if (activeTimeRef.current[pId] == null) {
      activeTimeRef.current[pId] = questionStateRef.current[pId]?.timeSpentSeconds || 0
    }
    const interval = setInterval(() => {
      activeTimeRef.current[pId] = (activeTimeRef.current[pId] || 0) + 1
    }, 1000)
    return () => clearInterval(interval)
  }, [consented, submitted, currentProblem?.id])

  const handleCancel = useCallback(() => {
    const targetCourseId = assessment?.courseId || trainingId
    navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=coding` : '/participant?tab=myEnrollments')
  }, [navigate, assessment, trainingId])

  // ── Code & Language Change Handlers ──
  const handleCodeChange = (newCode) => {
    if (!currentProblem) return
    const pId = currentProblem.id
    const existing = questionState[pId] || {}
    const isModified = Boolean(existing.isCompleted && existing.lastSubmittedCode && newCode !== existing.lastSubmittedCode)
    const status = isModified ? 'in_progress' : existing.status
    const starter = getLangStarter(currentProblem, existing.language || 'javascript')
    const deltaChars = Math.abs((newCode || '').length - (starter || '').length)

    updateQuestion(pId, {
      code: newCode || '',
      isModified,
      status: status === 'not_started' ? 'in_progress' : status,
      editCount: (existing.editCount || 0) + 1,
      typedChars: Math.max(existing.typedChars || 0, deltaChars, (newCode || '').length),
    })
    persistState()
  }

  const handleLanguageChange = async (lang) => {
    if (!currentProblem) return
    const pId = currentProblem.id
    const q = questionState[pId] || {}
    const fromLang = q.language || currentProblem.programmingLanguage || 'javascript'
    if (!lang || lang === fromLang) return

    // Confirmation when switching would discard an unsaved draft in the new language.
    const targetDraft = q.drafts?.[lang]
    const hasUnsavedFromLang = Boolean(q.code && q.code !== getLangStarter(currentProblem, fromLang))
    const confirmed = await confirm({
      title: 'Switch Language',
      message: `Switching to ${languageLabel(lang)}.${
        targetDraft != null
          ? ' Your previously saved draft for this language will be restored.'
          : ' A new starter template will be loaded.'
      }${hasUnsavedFromLang ? ' Your current code is preserved as a draft for ' + languageLabel(fromLang) + '.' : ''}`,
      type: 'info',
      confirmText: 'Switch',
    })
    if (!confirmed) return

    const drafts = { ...(q.drafts || {}) }
    drafts[fromLang] = q.code || ''
    const newCode = targetDraft != null ? targetDraft : getLangStarter(currentProblem, lang)

    updateQuestion(pId, {
      language: lang,
      drafts,
      code: newCode || '',
      savedCode: newCode || '',
      // Results/verdict are language-specific; clear them on switch.
      sampleResults: [],
      runStatus: '',
      runTime: null,
      runMemory: null,
      submitVerdict: null,
      submitPassed: null,
      submitTotal: null,
      submitScore: null,
      output: '',
      judgeStatus: null,
    })
    persistState()
  }

  // ── RUN CODE (Sample Tests Only) ──
  const handleRunCode = async () => {
    if (!currentProblem || runningRef.current || currentQState.isSubmitting || submittingRef.current || submittedRef.current) return
    const pId = currentProblem.id
    const q = questionState[pId] || {}

    runningRef.current = true
    setRunning(true)
    updateQuestion(pId, {
      sampleResults: [],
      runStatus: '',
      runTime: null,
      runMemory: null,
      submitVerdict: null,
      judgeStatus: 'Running sample tests...',
      activeTab: 'output',
      runAttempts: (q.runAttempts || 0) + 1,
    })

    const runStartTime = performance.now()
    debugLog.api('POST /coding/participant/run', { problemId: pId, language: q.language })

    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken

      const res = await fetch(`${API_BASE}/coding/participant/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          attemptId: Number(attemptId),
          problemId: pId,
          code: q.code || '',
          language: q.language || currentProblem.programmingLanguage || 'javascript',
          timeLimit: currentProblem.timeLimit || 5,
          memoryLimit: currentProblem.memoryLimit || 256,
          input: showCustomInput ? q.customInput : undefined
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Code execution failed')

      const r = data.run
      const execDuration = performance.now() - runStartTime
      debugLog.perf(`Question ${currentProblemIndex + 1} Run`, execDuration)

      let outputText = ''
      if (r.compileOutput) {
        outputText = r.compileOutput
      } else if (r.sampleResults?.length === 1 && !r.sampleResults[0].expectedOutput) {
        outputText = r.sampleResults[0].actualOutput || ''
      }

      updateQuestion(pId, {
        sampleResults: r.sampleResults || [],
        runStatus: r.status || '',
        runTime: r.executionTime || 0,
        runMemory: r.memoryUsed || 0,
        judgeStatus: null,
        output: outputText,
        conceptValidation: r.conceptValidation || null,
      })
    } catch (err) {
      updateQuestion(pId, {
        judgeStatus: null,
        output: `Error: ${err.message}`
      })
      showError?.(err.message || 'Run failed')
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  // ── Helper: Trigger Smooth Auto-Navigation ──
  const triggerAutoNavigation = useCallback((submittedProblemId, latestQuestionsState) => {
    const qStateMap = latestQuestionsState || questionStateRef.current
    const totalCount = problems.length

    // Find the next incomplete problem (check after current index first, then wrap around)
    let nextIdx = -1
    for (let i = currentProblemIndex + 1; i < totalCount; i++) {
      const pid = problems[i].id
      if (!qStateMap[pid]?.isCompleted) {
        nextIdx = i
        break
      }
    }

    if (nextIdx === -1) {
      for (let i = 0; i < currentProblemIndex; i++) {
        const pid = problems[i].id
        if (!qStateMap[pid]?.isCompleted) {
          nextIdx = i
          break
        }
      }
    }

    if (nextIdx !== -1 && nextIdx !== currentProblemIndex) {
      debugLog.nav(currentProblemIndex + 1, nextIdx + 1, 'Automatic navigation to next unanswered question')
      showSuccess?.(`Question ${currentProblemIndex + 1} submitted! Moving to Question ${nextIdx + 1}...`)
      setTimeout(() => {
        setCurrentProblemIndex(nextIdx)
        persistState()
      }, 650)
    } else {
      debugLog.info(`All ${totalCount} questions are completed! Remaining on current question.`)
      showSuccess?.(`All questions completed! You can review your solutions or click "Submit Assessment".`)
    }
  }, [problems, currentProblemIndex, showSuccess])

  // ── Helper: Poll for Submission Status Fallback ──
  const pollSubmissionResult = useCallback(async (subId, pId, startT) => {
    if (activeSubmissionPollingRef.current[pId]) return
    activeSubmissionPollingRef.current[pId] = true

    let attempts = 0
    const maxAttempts = 15
    const pollInterval = 1500

    const pollTimer = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts || submittedRef.current) {
        clearInterval(pollTimer)
        activeSubmissionPollingRef.current[pId] = false
        updateQuestion(pId, { isSubmitting: false, judgeStatus: null })
        return
      }

      try {
        debugLog.api(`GET /coding/participant/submission/${subId} (Poll #${attempts})`)
        const res = await fetch(`${API_BASE}/coding/participant/submission/${subId}`, {
          headers: authHeaders(user.token)
        })
        const data = await res.json()
        if (!res.ok || !data.submission) return

        const s = data.submission
        if (s.status && s.status !== 'PENDING') {
          clearInterval(pollTimer)
          activeSubmissionPollingRef.current[pId] = false

          const durationMs = performance.now() - startT
          debugLog.perf(`Question ${currentProblemIndex + 1} Evaluation (Polled)`, durationMs)
          debugLog.info(`Submission Result for Problem ${pId}:`, s.status, `Passed: ${s.passedTestCases}/${s.totalTestCases}`)

          const updatedQState = {
            ...questionStateRef.current[pId],
            isSubmitting: false,
            isCompleted: true,
            status: 'completed',
            isModified: false,
            lastSubmittedCode: questionStateRef.current[pId]?.code || '',
            judgeStatus: null,
            submitVerdict: s.status,
            submitPassed: s.passedTestCases,
            submitTotal: s.totalTestCases,
            submitScore: s.score,
            sampleResults: s.results || [],
            output: s.compilerOutput || s.errorMessage || '',
            conceptValidation: s.conceptValidation || null,
          }

          setQuestionState(prev => {
            const nextState = { ...prev, [pId]: updatedQState }
            triggerAutoNavigation(pId, nextState)
            return nextState
          })
          persistState()
        }
      } catch (e) {
        debugLog.warn('Submission polling error:', e.message)
      }
    }, pollInterval)
  }, [user.token, currentProblemIndex, triggerAutoNavigation, updateQuestion])

  // ── SUBMIT CODE (Single Question Only) ──
  const handleSubmitCode = async () => {
    if (!currentProblem) return
    const pId = currentProblem.id
    const q = questionState[pId] || {}

    // Strict duplicate submission prevention
    if (q.isSubmitting || submittingRef.current || submittedRef.current) {
      debugLog.warn(`Duplicate submit prevented for Question ${currentProblemIndex + 1} (Problem ID: ${pId})`)
      return
    }

    debugLog.info(`Submitting Question ${currentProblemIndex + 1} (Problem ID: ${pId}, Title: "${currentProblem.title}")...`)
    const submitStartTime = performance.now()

    updateQuestion(pId, {
      isSubmitting: true,
      status: 'submitting',
      judgeStatus: 'Queued for evaluation...',
      sampleResults: [],
      submitVerdict: null,
      submitPassed: null,
      submitTotal: null,
      submitScore: null,
      activeTab: 'output'
    })

    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken

      debugLog.api('POST /coding/participant/submit-code', { problemId: pId })
      const res = await fetch(`${API_BASE}/coding/participant/submit-code`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          attemptId: Number(attemptId),
          problemId: pId,
          code: q.code || '',
          language: q.language || currentProblem.programmingLanguage || 'javascript'
        })
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 404 || res.status === 409) {
          showError?.('Attempt already submitted. Redirecting...')
          setTimeout(() => navigate(trainingId ? `/participant?tab=myEnrollments&courseId=${trainingId}` : '/participant?tab=myEnrollments'), 1500)
          return
        }
        throw new Error(data.error || 'Submission failed')
      }

      const sub = data.submission
      if (!sub) throw new Error('Invalid response from submission API')

      // Case A: Evaluated immediately (synchronous fallback)
      if (sub.status && sub.status !== 'PENDING') {
        const durationMs = performance.now() - submitStartTime
        debugLog.perf(`Question ${currentProblemIndex + 1} Direct Evaluation`, durationMs)
        debugLog.info(`Submission Result for Problem ${pId}:`, sub.status, `Passed: ${sub.passedTestCases}/${sub.totalTestCases}`)

        const updatedQState = {
          ...q,
          isSubmitting: false,
          isCompleted: true,
          status: 'completed',
          isModified: false,
          lastSubmittedCode: q.code,
          submissionId: sub.id,
          judgeStatus: null,
          submitVerdict: sub.status,
          submitPassed: sub.passedTestCases,
          submitTotal: sub.totalTestCases,
          submitScore: sub.score,
          sampleResults: sub.results || [],
          output: sub.compilerOutput || sub.errorMessage || '',
          conceptValidation: sub.conceptValidation || null,
        }

        setQuestionState(prev => {
          const nextState = { ...prev, [pId]: updatedQState }
          triggerAutoNavigation(pId, nextState)
          return nextState
        })
        persistState()
      } else {
        // Case B: Queued asynchronously (BullMQ / Socket progress / Polling fallback)
        updateQuestion(pId, {
          submissionId: sub.id,
          judgeStatus: 'Queued...'
        })
        pollSubmissionResult(sub.id, pId, submitStartTime)
      }
    } catch (err) {
      debugLog.error(`Submission failed for Problem ${pId}:`, err.message)
      updateQuestion(pId, {
        isSubmitting: false,
        judgeStatus: null,
        status: q.isCompleted ? 'completed' : 'failed',
        output: `Error: ${err.message}`
      })
      showError?.(err.message || 'Submit failed')
    }
  }

  const handleResetCode = async () => {
    if (!currentProblem) return
    const q = questionState[currentProblem.id] || {}
    const ok = await confirm({
      title: 'Reset Code Template',
      message: 'Reset your code to the initial starter template? Your current edits will be cleared.',
      type: 'warning',
      confirmText: 'Yes, Reset',
    })
    if (!ok) return

    updateQuestion(currentProblem.id, {
      code: getLangStarter(currentProblem, q.language || currentProblem.programmingLanguage || 'javascript') || '',
      sampleResults: [],
      runStatus: '',
      runTime: null,
      runMemory: null,
      submitVerdict: null,
      output: '',
      judgeStatus: null,
      isModified: true
    })
    persistState()
  }

  const endVerificationSession = useCallback(() => {
    const sId = resolvedMonitoringSessionId
    if (sId) {
      fetch(`${API_BASE}/assessment-verification/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sId }),
      }).catch(() => {})
    }
  }, [resolvedMonitoringSessionId, user?.token])

  // ── Exit Fullscreen & Cleanup ──
  const handleRecordingCleanup = useCallback(async () => {
    try {
      if (sharedCamStream) {
        sharedCamStream.getTracks().forEach(t => t.stop())
      }
    } catch (_) {}
    try { await monitoringClient.finishSession() } catch (_) {}
    try { await monitoringClient.stopAndUploadRecording() } catch (_) {}
    try { monitoringClient.destroy() } catch (_) {}
    endVerificationSession()
    if (fsApi.element()) {
      try { await fsApi.exit() } catch {}
    }
  }, [endVerificationSession, sharedCamStream])

  useEffect(() => {
    return () => {
      try { monitoringClient.destroy() } catch (_) {}
    }
  }, [])

  // ── FAST SUBMIT ALL (Assessment Final Submission) ──
  const handleSubmit = async (isTimeout) => {
    if (submittingRef.current || submittedRef.current) {
      debugLog.warn('Duplicate Submit All prevented')
      return
    }

    const uncompletedCount = problems.filter(p => !questionState[p.id]?.isCompleted || questionState[p.id]?.isModified).length

    if (!isTimeout) {
      const ok = await confirm({
        title: 'Submit Assessment',
        message: uncompletedCount === 0
          ? `All ${problems.length} questions are completed! Submit your assessment to finalize your results?`
          : `You have ${uncompletedCount} unsubmitted or modified question(s). Submit entire assessment now?`,
        type: 'submit',
        confirmText: 'Yes, Submit Assessment',
      })
      if (!ok) return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitAllProgress('Submitting assessment and evaluating answers...')

    const submitAllStartTime = performance.now()
    debugLog.info(`Submit All started for ${problems.length} questions (${uncompletedCount} need evaluation)`)

    try {
      const activeDurationSec = monitoringClient.getActiveDurationSeconds()
      const submissions = problems.map(p => ({
        problemId: p.id,
        code: questionState[p.id]?.code || '',
        language: questionState[p.id]?.language || p.programmingLanguage || 'javascript',
        isModified: questionState[p.id]?.isModified || false,
        isCompleted: questionState[p.id]?.isCompleted || false
      }))

      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken

      // 30s timeout controller
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 35000)

      debugLog.api(`POST /coding/participant/submit/${attemptId}`, { count: submissions.length })
      const res = await fetch(`${API_BASE}/coding/participant/submit/${attemptId}`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          submissions,
          timeTaken: activeDurationSec,
          actualTestDurationSeconds: activeDurationSec
        })
      })
      clearTimeout(timeoutId)

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) {
          showError?.('Assessment was already submitted.')
        } else {
          throw new Error(data.error || 'Submit failed')
        }
      } else {
        const totalDuration = performance.now() - submitAllStartTime
        debugLog.perf('Submit All Completed Successfully', totalDuration)
        showSuccess?.('Coding assessment submitted successfully')
      }

      setSubmitted(true)

      // Fast non-blocking media & proctoring teardown
      try {
        if (sharedCamStream) {
          sharedCamStream.getTracks().forEach(t => t.stop())
        }
      } catch (_) {}
      try { monitoringClient.destroy() } catch (_) {}
      endVerificationSession()
      if (fsApi.element()) {
        try { fsApi.exit() } catch {}
      }

      localStorage.removeItem(getStorageKey(attemptId))
      sessionStorage.removeItem(storageKey)

      const targetCourseId = assessment?.courseId || trainingId
      navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=coding` : '/participant?tab=myEnrollments', { replace: true })
    } catch (err) {
      debugLog.error('Submit All error:', err.message)
      showError?.(err.name === 'AbortError' ? 'Submission timed out. Please try again.' : (err.message || 'Submit failed'))
    } finally {
      setSubmitting(false)
      setSubmitAllProgress(null)
      submittingRef.current = false
    }
  }

  const currentLanguage = currentQState.language || currentProblem?.programmingLanguage || 'javascript'
  const allProblemsCompleted = problems.length > 0 && problems.every(p => questionState[p.id]?.isCompleted && !questionState[p.id]?.isModified)
  const completedCount = problems.filter(p => questionState[p.id]?.isCompleted && !questionState[p.id]?.isModified).length

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748B', gap: 12, background: '#F8FAF9' }}>
        <Loader2 size={32} className="animate-spin text-emerald-600" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Loading coding assessment...</span>
      </div>
    )
  }

  if (errorMsg) {
    const targetCourseId = assessment?.courseId || trainingId
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 20, textAlign: 'center', background: '#F8FAF9' }}>
        <AlertCircle size={36} color="#DC2626" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>{errorMsg}</div>
        <button
          onClick={() => navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}` : '/participant?tab=myEnrollments')}
          style={{ padding: '8px 20px', background: '#15803D', color: '#FFFFFF', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Go Back
        </button>
      </div>
    )
  }

  // Pre-test Consent Gate
  if (!consented) {
    return (
      <AssessmentConsentGate
        quiz={assessment ? { id: assessment.id, title: assessment.title, description: assessment.description, timeLimit: assessment.timeLimit } : null}
        attemptId={Number(attemptId)}
        onConsented={handleConsented}
        onCancel={handleCancel}
      />
    )
  }

  const s = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#F8FAF9',
      overflow: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: 56,
      background: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
      flexShrink: 0,
      zIndex: 10,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    },
    timer: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      borderRadius: 8,
      background: '#F0FDF4',
      border: '1px solid #BBF7D0',
      color: '#15803D',
      fontWeight: 700,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      letterSpacing: '0.2px',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    },
    main: {
      display: 'flex',
      flex: 1,
      padding: '12px 16px',
      gap: 12,
      overflow: 'hidden',
      background: '#F8FAF9',
    },
    leftPanel: {
      width: '34%',
      minWidth: 340,
      maxWidth: 500,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    },
    problemNav: {
      display: 'flex',
      gap: 8,
      padding: '10px 14px',
      borderBottom: '1px solid #E2E8F0',
      background: '#FFFFFF',
      alignItems: 'center',
      overflowX: 'auto',
    },
    problemBtn: (active, completed, modified) => ({
      padding: '6px 12px',
      border: active
        ? '1.5px solid #15803D'
        : (completed ? '1px solid #BBF7D0' : (modified ? '1px solid #FDE68A' : '1px solid #E2E8F0')),
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: active ? 700 : 500,
      background: active
        ? (completed ? '#DCFCE7' : '#F0FDF4')
        : (completed ? '#F0FDF4' : (modified ? '#FFFBEB' : '#FFFFFF')),
      color: active ? '#15803D' : (completed ? '#166534' : '#475569'),
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      boxShadow: active ? '0 1px 3px rgba(21, 128, 61, 0.15)' : 'none',
    }),
    badgeCompleted: (modified) => ({
      fontSize: 10.5,
      fontWeight: 700,
      padding: '1px 6px',
      borderRadius: 4,
      background: modified ? '#FEF3C7' : '#DCFCE7',
      color: modified ? '#B45309' : '#15803D',
      border: modified ? '1px solid #FDE68A' : '1px solid #BBF7D0',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
    }),
    rightPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflow: 'hidden',
    },
    editorContainer: {
      flex: 1,
      overflow: 'hidden',
      background: '#15191F',
      border: '1px solid #E2E8F0',
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    },
    bottomPanel: {
      flex: '0 0 auto',
      maxHeight: '38%',
      display: 'flex',
      flexDirection: 'column',
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      overflow: 'hidden',
    },
    tabBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: 42,
      background: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
    },
    tabLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      height: '100%',
    },
    tabBtn: (active) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 4px',
      height: '100%',
      border: 'none',
      borderBottom: active ? '2px solid #15803D' : '2px solid transparent',
      cursor: 'pointer',
      fontSize: 12.5,
      fontWeight: active ? 700 : 500,
      background: 'transparent',
      color: active ? '#111827' : '#64748B',
      transition: 'all 0.15s ease',
      outline: 'none',
    }),
    actionBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 10px',
      background: '#F8FAF9',
      color: '#475569',
      border: '1px solid #E2E8F0',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 11.5,
      fontWeight: 600,
      transition: 'all 0.15s ease',
    },
    runBtn: (disabled) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 14px',
      background: disabled ? '#F1F5F9' : '#FFFFFF',
      color: disabled ? '#94A3B8' : '#111827',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      transition: 'all 0.15s ease',
    }),
    submitCodeBtn: (disabled) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 16px',
      background: disabled ? '#94A3B8' : '#15803D',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      boxShadow: disabled ? 'none' : '0 1px 3px rgba(21, 128, 61, 0.25)',
      transition: 'all 0.15s ease',
    }),
    headerSubmitBtn: (disabled) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 18px',
      background: disabled ? '#94A3B8' : '#15803D',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      boxShadow: disabled ? 'none' : '0 1px 4px rgba(21, 128, 61, 0.3)',
      transition: 'all 0.15s ease',
    }),
    outputArea: {
      flex: 1,
      overflow: 'auto',
      padding: '12px 16px',
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
    },
    allDoneBanner: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: '#DCFCE7',
      border: '1px solid #BBF7D0',
      borderRadius: 8,
      color: '#15803D',
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 8,
    }
  }

  const isCurrentSubmitting = Boolean(currentQState.isSubmitting)

  return (
    <ExamProctorShell
      onSubmit={handleSubmit}
      title={assessment?.title || 'Coding Assessment'}
      requireScreenShare={false}
    >
      <div style={s.container}>
        {/* ── TOP HEADER ── */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            {/* WAVE INIT Brand Logo & Text */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF'
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12h2l3 9 4-18 4 18 3-9h4" />
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
                WAVE <span style={{ color: '#15803D' }}>INIT</span>
              </span>
            </div>

            {/* Status dot + Assessment Title */}
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#15803D', display: 'inline-block' }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
              {assessment?.title || 'Coding Assessment'}
            </span>

            {/* Completion Counter */}
            {problems.length > 0 && (
              <span style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: allProblemsCompleted ? '#15803D' : '#64748B',
                background: allProblemsCompleted ? '#DCFCE7' : '#F1F5F9',
                padding: '2px 8px',
                borderRadius: 6,
                border: `1px solid ${allProblemsCompleted ? '#BBF7D0' : '#E2E8F0'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                {allProblemsCompleted ? <CheckCircle2 size={11} color="#15803D" /> : null}
                {completedCount}/{problems.length} Completed
              </span>
            )}

            {saveStatus && (
              <span style={{ fontSize: 11, color: '#15803D', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, background: '#DCFCE7', padding: '2px 8px', borderRadius: 6 }}>
                <Save size={10} /> {saveStatus}
              </span>
            )}
          </div>

          <div style={s.headerRight}>
            <AssessmentTimer
              timeLimitMinutes={assessment?.timeLimit || 60}
              testStartKey={`coding_${assessmentId}_test_start_${attemptId}`}
              onExpire={() => handleSubmit(true)}
              submitted={submitted}
            />
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting || submitted}
              style={s.headerSubmitBtn(submitting || submitted)}
              title="Submit all completed code and finalize assessment"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>{submitAllProgress || 'Submitting...'}</span>
                </>
              ) : (
                <>
                  <Send size={12} />
                  <span>Submit Assessment</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── MAIN 2-COLUMN LAYOUT ── */}
        <div style={s.main}>
          {/* Left Problem Panel */}
          <div style={s.leftPanel}>
            {problems.length > 1 && (
              <div style={s.problemNav}>
                {problems.map((p, idx) => {
                  const q = questionState[p.id] || {}
                  const isCurrent = currentProblemIndex === idx
                  const isComp = q.isCompleted
                  const isMod = q.isModified
                  const isSub = q.isSubmitting

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        debugLog.nav(currentProblemIndex + 1, idx + 1, 'Manual tab switch')
                        setCurrentProblemIndex(idx)
                        persistState()
                      }}
                      style={s.problemBtn(isCurrent, isComp, isMod)}
                      title={`Question ${idx + 1}: ${p.title || ''}`}
                    >
                      <span>{`Q${idx + 1}`}</span>
                      {isSub ? (
                        <Loader2 size={11} className="animate-spin text-emerald-600" />
                      ) : isComp ? (
                        <span style={s.badgeCompleted(isMod)}>
                          {isMod ? '● Modified' : '✓ Done'}
                        </span>
                      ) : (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#CBD5E1' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {currentProblem && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <ProblemPanel problem={currentProblem} index={currentProblemIndex} total={problems.length} />
              </div>
            )}
          </div>

          {/* Right Editor + Output Panel */}
          <div style={s.rightPanel}>
            {/* All Questions Completed Notification Banner */}
            {allProblemsCompleted && (
              <div style={s.allDoneBanner}>
                <Sparkles size={15} color="#15803D" />
                <span>Great work! All {problems.length} questions are completed. You can review your code or click <strong>&quot;Submit Assessment&quot;</strong> in the top header to finalize.</span>
              </div>
            )}

            <div style={s.editorContainer}>
              <CodeEditor
                value={currentQState.code || ''}
                language={currentLanguage}
                onChange={handleCodeChange}
                onLanguageChange={handleLanguageChange}
                supportedLanguages={
                  (Array.isArray(currentProblem?.allowedLanguages) && currentProblem.allowedLanguages.length > 0)
                    ? currentProblem.allowedLanguages
                    : ((Array.isArray(assessment?.languages) && assessment.languages.length > 0) ? assessment.languages : ['javascript', 'python'])
                }
              />
            </div>

            {/* Bottom Structured Output Panel */}
            <div style={s.bottomPanel}>
              <div style={s.tabBar}>
                <div style={s.tabLeft}>
                  <button
                    onClick={() => updateQuestion(currentProblem?.id, { activeTab: 'output' })}
                    style={s.tabBtn((currentQState.activeTab || 'output') === 'output')}
                  >
                    Execution Output
                  </button>
                  <button
                    onClick={() => setShowCustomInput(prev => !prev)}
                    style={s.tabBtn(showCustomInput)}
                  >
                    Custom Input
                  </button>
                  <button
                    onClick={() => updateQuestion(currentProblem?.id, { activeTab: 'testcases' })}
                    style={s.tabBtn(currentQState.activeTab === 'testcases')}
                  >
                    Test Cases {(currentQState.sampleResults?.length > 0) ? `(${currentQState.sampleResults.length})` : ''}
                  </button>
                  <button
                    onClick={() => updateQuestion(currentProblem?.id, { activeTab: currentQState.activeTab === 'ai' ? 'output' : 'ai' })}
                    style={{
                      ...s.tabBtn(currentQState.activeTab === 'ai'),
                      background: currentQState.activeTab === 'ai' ? '#7C3AED' : '#F5F3FF',
                      color: currentQState.activeTab === 'ai' ? '#FFFFFF' : '#6D28D9',
                      border: currentQState.activeTab === 'ai' ? '1px solid #7C3AED' : '1px solid #DDD6FE',
                      fontWeight: 600,
                    }}
                    title="AI Coding Assistant (Socratic hints & approach)"
                  >
                    <Sparkles size={13} color={currentQState.activeTab === 'ai' ? '#FFFFFF' : '#7C3AED'} />
                    <span>✨ AI Coding Assistant</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setDebugMode(prev => !prev)}
                    style={{ ...s.actionBtn, color: debugMode ? '#7C3AED' : '#64748B', borderColor: debugMode ? '#C4B5FD' : '#E2E8F0' }}
                    title="Toggle debug console overlay"
                  >
                    <Bug size={12} /> {debugMode ? 'Debug ON' : 'Debug'}
                  </button>
                  <button onClick={handleResetCode} style={s.actionBtn} title="Reset starter code for this question">
                    <Trash2 size={12} /> Reset
                  </button>

                  <button
                    onClick={handleRunCode}
                    disabled={running || isCurrentSubmitting || submitting || submitted}
                    style={s.runBtn(running || isCurrentSubmitting || submitting || submitted)}
                    title="Run sample test cases"
                  >
                    {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    <span>{running ? 'Running...' : 'Run Code'}</span>
                  </button>

                  <button
                    onClick={handleSubmitCode}
                    disabled={isCurrentSubmitting || running || submitting || submitted}
                    style={s.submitCodeBtn(isCurrentSubmitting || running || submitting || submitted)}
                    title="Submit and evaluate this question"
                  >
                    {isCurrentSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span>{isCurrentSubmitting ? 'Evaluating...' : 'Submit Code'}</span>
                  </button>
                </div>
              </div>

              {showCustomInput && (
                <div style={{ padding: '10px 16px', background: '#F8FAF9', borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Custom Input (stdin):
                  </div>
                  <textarea
                    value={currentQState.customInput || ''}
                    onChange={(e) => updateQuestion(currentProblem?.id, { customInput: e.target.value })}
                    style={{
                      width: '100%',
                      height: 52,
                      background: '#FFFFFF',
                      color: '#1E293B',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      padding: 8,
                      fontSize: 12.5,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Enter custom input here..."
                  />
                </div>
              )}

              {currentQState.activeTab === 'ai' ? (
                <div style={{ flex: 1, overflow: 'hidden', background: '#FFFFFF' }}>
                  <CodingAiAssistant
                    user={user}
                    attemptId={attemptId}
                    problem={currentProblem}
                    questionState={{
                      ...currentQState,
                      timeSpentSeconds: activeTimeRef.current[currentProblem?.id] || currentQState.timeSpentSeconds || 0
                    }}
                    sessionToken={sessionToken}
                    onError={showError}
                  />
                </div>
              ) : (
              <div style={s.outputArea}>
                {currentQState.judgeStatus && (
                  <div style={{ color: '#D97706', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5, marginBottom: 8 }}>
                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                    <span>{currentQState.judgeStatus}</span>
                  </div>
                )}

                {/* Concept Validation Alert Banner */}
                {currentQState.conceptValidation && (
                  <div style={{
                    marginBottom: 10, padding: '10px 14px', borderRadius: 8,
                    background: currentQState.conceptValidation.ok ? '#F0FDF4' : '#FEF2F2',
                    border: currentQState.conceptValidation.ok ? '1px solid #BBF7D0' : '1px solid #FECACA',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: currentQState.conceptValidation.ok ? '#166534' : '#991B1B' }}>
                      {currentQState.conceptValidation.ok ? <CheckCircle2 size={15} color="#16A34A" /> : <XCircle size={15} color="#DC2626" />}
                      <span>{currentQState.conceptValidation.ok ? 'All required concepts satisfied ✓' : 'Code requirement(s) not satisfied'}</span>
                    </div>
                    {currentQState.conceptValidation.message && !currentQState.conceptValidation.ok && (
                      <div style={{ fontSize: 12, color: '#B91C1C' }}>
                        {currentQState.conceptValidation.message}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {currentQState.conceptValidation.results?.map((cr, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: cr.satisfied ? '#DCFCE7' : '#FEE2E2',
                            color: cr.satisfied ? '#15803D' : '#DC2626',
                            border: cr.satisfied ? '1px solid #86EFAC' : '1px solid #FCA5A5',
                          }}
                        >
                          {cr.satisfied ? '✓' : '✗'} {cr.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status / Metric Badges */}
                {(currentQState.runStatus || currentQState.submitVerdict || currentQState.output) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(currentQState.runStatus === 'ACCEPTED' || currentQState.submitVerdict === 'ACCEPTED') ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#15803D', fontWeight: 700, fontSize: 13 }}>
                          <CheckCircle2 size={15} color="#15803D" />
                          <span>Success (Accepted)</span>
                        </div>
                      ) : (currentQState.runStatus === 'FAILED_REQUIREMENTS' || currentQState.submitVerdict === 'FAILED_REQUIREMENTS') ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#DC2626', fontWeight: 700, fontSize: 13 }}>
                          <XCircle size={15} color="#DC2626" />
                          <span>FAILED REQUIREMENTS</span>
                        </div>
                      ) : (currentQState.runStatus || currentQState.submitVerdict) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#DC2626', fontWeight: 700, fontSize: 13 }}>
                          <XCircle size={15} color="#DC2626" />
                          <span>{currentQState.runStatus || currentQState.submitVerdict}</span>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {currentQState.runTime != null && (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          background: '#F1F5F9',
                          border: '1px solid #E2E8F0',
                          color: '#334155',
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}>
                          Time: {Number(currentQState.runTime).toFixed(2)}s
                        </span>
                      )}
                      {currentQState.runMemory != null && (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          background: '#EFF6FF',
                          border: '1px solid #DBEAFE',
                          color: '#1D4ED8',
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}>
                          Memory: {currentQState.runMemory} MB
                        </span>
                      )}
                      {currentQState.submitPassed != null && (
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                          {currentQState.submitPassed}/{currentQState.submitTotal} test cases passed ({currentQState.submitScore} pts)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Dark Terminal Output Area */}
                {currentQState.output ? (
                  <pre style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: '#15191F',
                    color: '#F8FAFC',
                    padding: '12px 16px',
                    borderRadius: 8,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 13,
                    lineHeight: '1.5',
                    overflow: 'auto',
                    flex: 1,
                  }}>
                    {currentQState.output}
                  </pre>
                ) : (
                  !currentQState.judgeStatus && (
                    <div style={{ color: '#94A3B8', fontSize: 12.5, fontStyle: 'italic', padding: '8px 0' }}>
                      Run your code or click &quot;Submit Code&quot; to see evaluation results for Question {currentProblemIndex + 1}.
                    </div>
                  )
                )}

                {/* Test Case Results list */}
                {currentQState.sampleResults?.length > 0 && currentQState.activeTab === 'testcases' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803D', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TEST CASE RESULTS:
                    </div>
                    {currentQState.sampleResults.map((tr, idx) => (
                      <div key={idx} style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: tr.passed ? '#F0FDF4' : '#FEF2F2',
                        border: `1px solid ${tr.passed ? '#BBF7D0' : '#FECACA'}`,
                        marginBottom: 6,
                        fontSize: 12.5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {tr.passed ? <CheckCircle2 size={14} color="#15803D" /> : <XCircle size={14} color="#DC2626" />}
                          <span style={{ fontWeight: 600, color: tr.passed ? '#15803D' : '#DC2626' }}>
                            {`Test Case ${idx + 1}: ${tr.passed ? 'PASSED' : 'FAILED'}`}
                          </span>
                          <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 11, fontFamily: 'monospace' }}>
                            {tr.executionTime != null ? `${Number(tr.executionTime).toFixed(3)}s` : ''}
                          </span>
                        </div>
                        {(tr.input !== '[Hidden]' || tr.expectedOutput !== '[Hidden]') && (
                          <div style={{ marginTop: 6, fontSize: 11.5, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.5, color: '#334155', wordBreak: 'break-word' }}>
                            {tr.input != null && tr.input !== '' && (
                              <div><span style={{ color: '#64748B' }}>Input:</span> <span style={{ color: '#111827' }}>{tr.input}</span></div>
                            )}
                            {tr.expectedOutput != null && tr.expectedOutput !== '' && (
                              <div><span style={{ color: '#64748B' }}>Expected:</span> <span style={{ color: '#1D4ED8' }}>{tr.expectedOutput}</span></div>
                            )}
                            {tr.actualOutput != null && tr.actualOutput !== '' && !tr.passed && (
                              <div><span style={{ color: '#64748B' }}>Actual:</span> <span style={{ color: '#DC2626' }}>{String(tr.actualOutput).slice(0, 500)}</span></div>
                            )}
                            {tr.passed && tr.actualOutput != null && tr.actualOutput !== '' && (
                              <div><span style={{ color: '#64748B' }}>Actual:</span> <span style={{ color: '#15803D' }}>{String(tr.actualOutput).slice(0, 500)}</span></div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Unified AI Monitoring Engine Widget */}
        <UnifiedMonitoringWidget
          contextType="CODING"
          contextId={Number(assessmentId)}
          attemptId={Number(attemptId)}
          sessionId={resolvedMonitoringSessionId}
          participantId={user?.id}
          userToken={user?.token}
          mobileEnabled={true}
          preCalibrated={true}
          prePaired={true}
          isTestActive={consented}
          testStartedAt={testStartedAt}
          existingStream={sharedCamStream}
        />
      </div>
    </ExamProctorShell>
  )
}

export default function ParticipantCodingAttemptPage({ user }) {
  return (
    <ProctorProvider>
      <ParticipantCodingAttemptInner user={user} />
    </ProctorProvider>
  )
}
