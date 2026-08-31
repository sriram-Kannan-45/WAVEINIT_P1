import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AssessmentConsentGate from '../components/ai-quizzes/AssessmentConsentGate'
import UnifiedMonitoringWidget from '../components/monitoring/UnifiedMonitoringWidget'
import { API_BASE, BACKEND_ORIGIN } from '../api/api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ui/AlertModal'
import { ProctorProvider, useProctor } from '../proctoring/ProctorContext'
import useDeviceFingerprint from '../proctoring/hooks/useDeviceFingerprint'
import { Loader2, AlertCircle, Play, Check, Clock, Send, Save, Terminal, Bug, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import ProblemPanel from '../components/ProblemPanel'
import ExamProctorShell from '../proctoring/components/ExamProctorShell'
import monitoringClient from '../proctoring/engine/MonitoringEngineClient'
import { io as socketIO } from 'socket.io-client'

const STORAGE_PREFIX = 'coding_attempt_'
const AUTO_SAVE_INTERVAL = 10000
const SERVER_SAVE_INTERVAL = 30000
const WS_URL = BACKEND_ORIGIN

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
          const p = JSON.parse(cached);
          attemptId = attemptId || p.attemptId;
          sessionToken = sessionToken || p.sessionToken;
          monitoringSessionId = monitoringSessionId || p.monitoringSessionId;
        } catch {}
      }
    }
  }

  const confirm = useConfirm()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [problems, setProblems] = useState([])
  const [qrVerified, setQrVerified] = useState(false)
  const [verifSessionInfo, setVerifSessionInfo] = useState(null)
  const [consented, setConsented] = useState(false)
  const [sharedCamStream, setSharedCamStream] = useState(null)
  const [resolvedMonitoringSessionId, setResolvedMonitoringSessionId] = useState(monitoringSessionId || null)

  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [codeByProblem, setCodeByProblem] = useState({})
  const [languageByProblem, setLanguageByProblem] = useState({})
  const [output, setOutput] = useState('')
  const [sampleResults, setSampleResults] = useState([])
  const [runStatus, setRunStatus] = useState('')
  const [runTime, setRunTime] = useState(null)
  const [runMemory, setRunMemory] = useState(null)
  const [submitVerdict, setSubmitVerdict] = useState(null)
  const [submitScore, setSubmitScore] = useState(null)
  const [submitPassed, setSubmitPassed] = useState(null)
  const [submitTotal, setSubmitTotal] = useState(null)
  const [submissionId, setSubmissionId] = useState(null)
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [activeTab, setActiveTab] = useState('output')
  const [judgeStatus, setJudgeStatus] = useState(null)

  const timerRef = useRef(null)
  const autoSaveRef = useRef(null)
  const serverSaveRef = useRef(null)
  const codeByProblemRef = useRef(codeByProblem)
  const socketRef = useRef(null)
  const startTimeRef = useRef(null)
  const runningRef = useRef(false)
  const submittingRef = useRef(false)
  const submittedRef = useRef(false)

  useEffect(() => { codeByProblemRef.current = codeByProblem }, [codeByProblem])
  useEffect(() => { submittedRef.current = submitted }, [submitted])

  // Socket.IO connection for submission progress
  useEffect(() => {
    if (!user?.token) return
    try {
      const sock = socketIO(WS_URL, {
        auth: { token: user.token },
        transports: ['websocket', 'polling'],
      })
      sock.on('connect', () => {
        console.log('[Coding WS] Connected')
        if (attemptId) sock.emit('coding:join', { assessmentId, participantId: user.id })
      })
      sock.on('submission:progress', (data) => {
        if (data.submissionId === submissionId || !submissionId) {
          if (data.status === 'PENDING' || data.status === 'QUEUED') setJudgeStatus('Queued...')
          else if (data.status === 'COMPILING') setJudgeStatus('Compiling...')
          else if (data.status === 'RUNNING') setJudgeStatus(data.message || 'Running...')
          else if (data.status && ['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'INTERNAL_ERROR'].includes(data.status)) {
            setJudgeStatus(null)
            setSubmitVerdict(data.status)
            setSubmitPassed(data.passedTestCases)
            setSubmitTotal(data.totalTestCases)
            setSubmitScore(data.score)
            if (data.results) setSampleResults(data.results.filter(r => !r.isHidden))
          }
        }
      })
      sock.on('coding:result-update', (data) => {
        console.log('[Coding WS] Result update', data)
      })
      sock.on('disconnect', () => console.log('[Coding WS] Disconnected'))
      socketRef.current = sock
    } catch (e) { console.warn('[Coding WS] Failed to connect', e) }
    return () => { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null } }
  }, [user?.token, assessmentId, user?.id, submissionId, attemptId])

  useEffect(() => {
    if (submissionId && socketRef.current?.connected) {
      socketRef.current.emit('submission:subscribe', { submissionId })
      return () => socketRef.current?.emit('submission:unsubscribe', { submissionId })
    }
  }, [submissionId])

  useEffect(() => {
    if (!assessmentId || !attemptId) {
      setErrorMsg('Invalid assessment or attempt identifiers.'); setLoading(false); return
    }
    let aborted = false
    const fetchAssessment = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/coding/assessments/${assessmentId}`, { headers: { Authorization: `Bearer ${user.token}` } })
        const data = await res.json()
        if (aborted) return
        if (!res.ok) { setErrorMsg(data.error || 'Failed to load assessment.'); setLoading(false); return }
        const a = data.assessment; setAssessment(a); setProblems(a.problems || [])
        const savedState = loadSavedState(attemptId); const savedCodes = {}; const savedLanguages = {}; const now = Date.now()
        ;(a.problems || []).forEach(p => {
          const existing = savedState?.codes?.[p.id]
          savedCodes[p.id] = existing || p.starterCode || ''
          savedLanguages[p.id] = savedState?.languages?.[p.id] || p.programmingLanguage || p.language || 'javascript'
        })
        setCodeByProblem(savedCodes); setLanguageByProblem(savedLanguages)
        if (savedState?.startedAt) { startTimeRef.current = savedState.startedAt; const elapsed = Math.floor((now - savedState.startedAt) / 1000); const total = (a.timeLimit || 60) * 60; setTimeLeft(Math.max(0, total - elapsed)) }
        else { startTimeRef.current = now; setTimeLeft((a.timeLimit || 60) * 60) }
        setCurrentProblemIndex(savedState?.currentProblem ?? 0)
        setLoading(false); setRestoring(false)
      } catch (err) { if (!aborted) { setErrorMsg(err.message || 'Server error loading assessment.'); setLoading(false) } }
    }
    fetchAssessment()
    return () => { aborted = true }
  }, [assessmentId, attemptId, user.token])

  function loadSavedState(attId) { try { const raw = localStorage.getItem(getStorageKey(attId)); return raw ? JSON.parse(raw) : null } catch { return null } }
  function persistState() {
    if (!attemptId) return
    try { localStorage.setItem(getStorageKey(attemptId), JSON.stringify({ codes: codeByProblemRef.current, languages: languageByProblem, currentProblem: currentProblemIndex, startedAt: startTimeRef.current || Date.now(), updatedAt: Date.now() })) } catch {}
  }
  const autoSaveCallback = useCallback(() => { persistState(); setSaveStatus('Saved'); setTimeout(() => setSaveStatus(prev => prev === 'Saved' ? '' : prev), 2000) }, [attemptId, currentProblemIndex, languageByProblem])
  useEffect(() => { if (!attemptId || submitted) return; autoSaveRef.current = setInterval(autoSaveCallback, AUTO_SAVE_INTERVAL); return () => clearInterval(autoSaveRef.current) }, [attemptId, submitted, autoSaveCallback])

  const saveToServer = useCallback(async () => {
    if (!attemptId || !user?.token || submittingRef.current || submittedRef.current) return
    for (const [problemId, code] of Object.entries(codeByProblemRef.current)) {
      try {
        const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
        if (sessionToken) headers['X-Assessment-Session'] = sessionToken
        await fetch(`${API_BASE}/coding/participant/save`, { method: 'POST', headers, body: JSON.stringify({ attemptId: Number(attemptId), problemId: Number(problemId), code, language: languageByProblem[Number(problemId)] || problems.find(p => p.id === Number(problemId))?.programmingLanguage || 'javascript' }) })
      } catch {}
    }
  }, [attemptId, user?.token, sessionToken, problems, languageByProblem])
  useEffect(() => { if (!attemptId || submitted) return; serverSaveRef.current = setInterval(saveToServer, SERVER_SAVE_INTERVAL); return () => clearInterval(serverSaveRef.current) }, [attemptId, submitted, saveToServer])

  useEffect(() => {
    if (timeLeft == null || submitted) return
    timerRef.current = setInterval(() => { setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0 } return prev - 1 }) }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timeLeft, submitted])

  useEffect(() => { if (timeLeft === 0 && !submitted && !submittedRef.current) handleSubmit(true) }, [timeLeft])

  const formatTime = (s) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` }

  const [testStartedAt, setTestStartedAt] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`coding_${assessmentId}_test_start_${attemptId}`);
      return cached ? parseInt(cached, 10) : null;
    } catch {
      return null;
    }
  });

  const handleConsented = useCallback((stream) => {
    if (stream) setSharedCamStream(stream);
    const start = Date.now();
    setTestStartedAt(start);
    try {
      sessionStorage.setItem(`coding_${assessmentId}_test_start_${attemptId}`, String(start));
    } catch {}
    if (attemptId) {
      monitoringClient.startActiveTestTimer(attemptId, (assessment?.timeLimit || 60) * 60);
    }
    setConsented(true);
  }, [assessmentId, attemptId, assessment?.timeLimit])

  // Watch for focus/blur to pause/resume active duration tracking
  useEffect(() => {
    if (!consented || submitted) return;

    const onBlur = () => {
      monitoringClient.pauseActiveTestTimer('TAB_SWITCH');
    };
    const onFocus = () => {
      monitoringClient.resumeActiveTestTimer('RESUMED');
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [consented, submitted]);

  const handleCancel = useCallback(() => {
    const targetCourseId = assessment?.courseId || trainingId
    navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=coding` : '/participant?tab=myEnrollments')
  }, [navigate, assessment, trainingId])

  const currentProblem = problems[currentProblemIndex]
  const handleCodeChange = (value) => { if (!currentProblem) return; setCodeByProblem(prev => ({ ...prev, [currentProblem.id]: value || '' })) }
  const handleLanguageChange = (lang) => { if (!currentProblem) return; setLanguageByProblem(prev => ({ ...prev, [currentProblem.id]: lang })); persistState() }

  // ── RUN CODE ──
  const handleRunCode = async () => {
    if (!currentProblem || runningRef.current || submittingRef.current || submittedRef.current) return
    runningRef.current = true
    setRunning(true); setSampleResults([]); setRunStatus(''); setRunTime(null); setRunMemory(null)
    setSubmitVerdict(null); setJudgeStatus('Running...'); setActiveTab('output')
    await saveToServer()
    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken
      const res = await fetch(`${API_BASE}/coding/participant/run`, {
        method: 'POST', headers,
        body: JSON.stringify({ attemptId: Number(attemptId), problemId: currentProblem.id, code: codeByProblem[currentProblem.id] || '', language: languageByProblem[currentProblem.id] || currentProblem.programmingLanguage || 'javascript', timeLimit: currentProblem.timeLimit || 5, memoryLimit: currentProblem.memoryLimit || 256, input: showCustomInput ? customInput : undefined })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Code execution failed')
      const r = data.run
      setSampleResults(r.sampleResults || [])
      setRunStatus(r.status || '')
      setRunTime(r.executionTime || 0)
      setRunMemory(r.memoryUsed || 0)
      setJudgeStatus(null)
      if (r.compileOutput) {
        setOutput(r.compileOutput)
      } else if (r.sampleResults?.length === 1 && !r.sampleResults[0].expectedOutput) {
        setOutput(r.sampleResults[0].actualOutput || '')
      }
    } catch (err) { setJudgeStatus(null); setOutput(`Error: ${err.message}`) }
    finally { runningRef.current = false; setRunning(false) }
  }

  // ── SUBMIT CODE (individual problem) ──
  const handleSubmitCode = async () => {
    if (!currentProblem || submittingRef.current || submittedRef.current) return
    submittingRef.current = true
    setSubmitting(true); setSampleResults([]); setSubmitVerdict(null); setSubmitPassed(null); setSubmitTotal(null); setSubmitScore(null); setJudgeStatus('Queued...'); setActiveTab('output')
    await saveToServer()
    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken
      const res = await fetch(`${API_BASE}/coding/participant/submit-code`, {
        method: 'POST', headers,
        body: JSON.stringify({ attemptId: Number(attemptId), problemId: currentProblem.id, code: codeByProblem[currentProblem.id] || '', language: languageByProblem[currentProblem.id] || currentProblem.programmingLanguage || 'javascript' })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 404 || res.status === 409) {
          showError?.('Attempt already submitted. Redirecting...')
          setTimeout(() => navigate(trainingId ? `/participant?tab=myEnrollments&courseId=${trainingId}` : '/participant?tab=myEnrollments'), 1500)
          return
        }
        throw new Error(data.error || 'Submit failed')
      }
      if (data.submission) {
        setSubmissionId(data.submission.id)
        if (data.submission.status !== 'PENDING') {
          setJudgeStatus(null)
          setSubmitVerdict(data.submission.status)
          setSubmitPassed(data.submission.passedTestCases)
          setSubmitTotal(data.submission.totalTestCases)
        }
      }
    } catch (err) { setJudgeStatus(null); showError?.(err.message || 'Submit failed') }
    finally { setSubmitting(false); submittingRef.current = false }
  }

  const handleResetCode = async () => {
    if (!currentProblem) return
    const ok = await confirm({
      title: 'Reset Code Template',
      message: 'Reset your code to the initial starter template? Your current edits will be cleared.',
      type: 'warning',
      confirmText: 'Yes, Reset',
    })
    if (!ok) return
    setCodeByProblem(prev => ({ ...prev, [currentProblem.id]: currentProblem.starterCode || '' }))
    setSampleResults([]); setRunStatus(''); setRunTime(null); setRunMemory(null); setSubmitVerdict(null); setOutput('')
  }

  const endVerificationSession = useCallback(() => {
    const sId = verifSessionInfo?.sessionId;
    if (sId) {
      fetch(`${API_BASE}/assessment-verification/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sId }),
      }).catch(() => {});
    }
  }, [verifSessionInfo, user?.token]);

  // ── Exit fullscreen & cleanup ──
  const handleRecordingCleanup = useCallback(async () => {
    try {
      if (sharedCamStream) {
        sharedCamStream.getTracks().forEach(t => t.stop());
      }
    } catch (_) {}
    try {
      await monitoringClient.finishSession();
    } catch (_) {}
    try {
      await monitoringClient.stopAndUploadRecording();
    } catch (_) {}
    try {
      monitoringClient.destroy();
    } catch (_) {}
    endVerificationSession();
    if (fsApi.element()) {
      try { await fsApi.exit() } catch {}
    }
  }, [endVerificationSession, sharedCamStream]);

  useEffect(() => {
    return () => {
      try {
        monitoringClient.destroy();
      } catch (_) {}
    };
  }, []);

  // ── SUBMIT ASSESSMENT ──
  const handleSubmit = async (isTimeout) => {
    if (submittingRef.current || submittedRef.current) return
    if (!isTimeout) {
      const ok = await confirm({
        title: 'Submit Assessment',
        message: 'Are you sure you want to submit your coding assessment? You will not be able to make further changes.',
        type: 'submit',
        confirmText: 'Yes, Submit',
      })
      if (!ok) return
    }
    submittingRef.current = true
    setSubmitting(true)
    try {
      await saveToServer()
      const activeDurationSec = monitoringClient.getActiveDurationSeconds();
      const submissions = problems.map(p => ({ problemId: p.id, code: codeByProblem[p.id] || '', language: languageByProblem[p.id] || p.programmingLanguage || 'javascript' }))
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken
      const res = await fetch(`${API_BASE}/coding/participant/submit/${attemptId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ submissions, timeTaken: activeDurationSec, actualTestDurationSeconds: activeDurationSec })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) {
          showError?.('Assessment was already submitted.')
        } else {
          throw new Error(data.error || 'Submit failed')
        }
      } else {
        showSuccess?.('Coding assessment submitted successfully')
      }
      setSubmitted(true); clearInterval(timerRef.current)

      // Exit fullscreen & cleanup
      await handleRecordingCleanup()

      localStorage.removeItem(getStorageKey(attemptId)); sessionStorage.removeItem(storageKey)
      const targetCourseId = assessment?.courseId || trainingId
      navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=coding` : '/participant?tab=myEnrollments')
    } catch (err) { showError?.(err.message || 'Submit failed') }
    finally { setSubmitting(false); submittingRef.current = false }
  }

  const currentLanguage = languageByProblem[currentProblem?.id] || currentProblem?.programmingLanguage || 'javascript'

  if (loading || restoring) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}><Loader2 size={24} className="animate-spin" /></div>
  if (errorMsg) {
    const targetCourseId = assessment?.courseId || trainingId
    return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 20, textAlign: 'center' }}><AlertCircle size={32} color="#dc2626" style={{ marginBottom: 12 }} /><div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>{errorMsg}</div><button onClick={() => navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}` : '/participant?tab=myEnrollments')} style={{ padding: '8px 20px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Go Back</button></div>
  }

  // Pre-test Consent, Camera Calibration & Fullscreen Gate
  if (!consented) return (
    <AssessmentConsentGate
      quiz={assessment ? { id: assessment.id, title: assessment.title, description: assessment.description, timeLimit: assessment.timeLimit } : null}
      attemptId={Number(attemptId)}
      onConsented={handleConsented}
      onCancel={handleCancel}
    />
  )

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
    title: {
      fontSize: 14.5,
      fontWeight: 700,
      color: '#111827',
      letterSpacing: '-0.01em',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    timer: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      borderRadius: 8,
      background: timeLeft < 300 ? '#FEF2F2' : '#FFFFFF',
      border: timeLeft < 300 ? '1px solid #FECACA' : '1px solid #E2E8F0',
      color: timeLeft < 300 ? '#DC2626' : '#111827',
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
      width: '32%',
      minWidth: 340,
      maxWidth: 480,
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
      padding: '10px 16px',
      borderBottom: '1px solid #E2E8F0',
      background: '#FFFFFF',
      alignItems: 'center',
      overflowX: 'auto',
    },
    problemBtn: (active) => ({
      padding: '5px 12px',
      border: active ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: active ? 700 : 500,
      background: active ? '#DCFCE7' : '#FFFFFF',
      color: active ? '#15803D' : '#64748B',
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
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
    submitBtn: (disabled) => ({
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
    verdictBadge: (v) => {
      const isPass = v === 'ACCEPTED';
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        background: isPass ? '#DCFCE7' : '#FEE2E2',
        color: isPass ? '#15803D' : '#DC2626',
        border: `1px solid ${isPass ? '#BBF7D0' : '#FECACA'}`,
      };
    },
  }

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

            {saveStatus && (
              <span style={{ fontSize: 11, color: '#15803D', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, background: '#DCFCE7', padding: '2px 8px', borderRadius: 6 }}>
                <Save size={10} /> {saveStatus}
              </span>
            )}
          </div>

          <div style={s.headerRight}>
            {timeLeft != null && (
              <div style={s.timer}>
                <Clock size={13} color={timeLeft < 300 ? '#DC2626' : '#15803D'} />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
            <button onClick={() => handleSubmit(false)} disabled={submitting || submitted} style={s.headerSubmitBtn(submitting || submitted)}>
              <Send size={12} />
              {submitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          </div>
        </div>

        {/* ── MAIN 2-COLUMN LAYOUT ── */}
        <div style={s.main}>
          {/* Left Problem Panel */}
          <div style={s.leftPanel}>
            {problems.length > 1 && (
              <div style={s.problemNav}>
                {problems.map((p, idx) => (
                  <button key={p.id} onClick={() => setCurrentProblemIndex(idx)} style={s.problemBtn(currentProblemIndex === idx)}>
                    {`Problem ${idx + 1}`}
                  </button>
                ))}
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
            <div style={s.editorContainer}>
              <CodeEditor
                code={codeByProblem[currentProblem?.id] || ''}
                language={currentLanguage}
                onChange={handleCodeChange}
                onLanguageChange={handleLanguageChange}
                supportedLanguages={currentProblem?.allowedLanguages || Object.keys(LANGUAGE_MAP)}
              />
            </div>

            {/* Bottom Structured Output Panel */}
            <div style={s.bottomPanel}>
              <div style={s.tabBar}>
                <div style={s.tabLeft}>
                  <button onClick={() => setActiveTab('output')} style={s.tabBtn(activeTab === 'output')}>
                    Execution Output
                  </button>
                  <button onClick={() => setShowCustomInput(prev => !prev)} style={s.tabBtn(showCustomInput)}>
                    Custom Input
                  </button>
                  <button onClick={() => setActiveTab('testcases')} style={s.tabBtn(activeTab === 'testcases')}>
                    Test Cases
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handleResetCode} style={s.actionBtn} title="Reset starter code">
                    <Trash2 size={12} /> Reset
                  </button>
                  <button onClick={handleRunCode} disabled={running || submitting || submitted} style={s.runBtn(running || submitting || submitted)}>
                    <Play size={12} /> {running ? 'Running...' : 'Run Code'}
                  </button>
                  <button onClick={handleSubmitCode} disabled={submitting || running || submitted} style={s.submitBtn(submitting || running || submitted)}>
                    <Check size={12} /> {submitting ? 'Submitting...' : 'Submit Code'}
                  </button>
                </div>
              </div>

              {showCustomInput && (
                <div style={{ padding: '10px 16px', background: '#F8FAF9', borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Custom Input (stdin):
                  </div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
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

              <div style={s.outputArea}>
                {judgeStatus && (
                  <div style={{ color: '#D97706', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5, marginBottom: 8 }}>
                    <Loader2 size={14} className="animate-spin text-emerald-600" /> {judgeStatus}
                  </div>
                )}

                {/* Status / Metric Badges */}
                {(runStatus || submitVerdict || output) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(runStatus === 'ACCEPTED' || submitVerdict === 'ACCEPTED') ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#15803D', fontWeight: 700, fontSize: 13 }}>
                          <CheckCircle2 size={15} color="#15803D" />
                          <span>Success</span>
                        </div>
                      ) : (runStatus || submitVerdict) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#DC2626', fontWeight: 700, fontSize: 13 }}>
                          <XCircle size={15} color="#DC2626" />
                          <span>{runStatus || submitVerdict}</span>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {runTime != null && (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          background: '#F1F5F9',
                          border: '1px solid #E2E8F0',
                          color: '#334155',
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}>
                          Time: {runTime.toFixed(2)}s
                        </span>
                      )}
                      {runMemory != null && (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          background: '#EFF6FF',
                          border: '1px solid #DBEAFE',
                          color: '#1D4ED8',
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}>
                          Memory: {runMemory} MB
                        </span>
                      )}
                      {submitPassed != null && (
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                          {submitPassed}/{submitTotal} test cases passed ({submitScore}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Dark Terminal Output Area */}
                {output ? (
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
                    {output}
                  </pre>
                ) : (
                  !judgeStatus && (
                    <div style={{ color: '#94A3B8', fontSize: 12.5, fontStyle: 'italic', padding: '8px 0' }}>
                      Run your code or submit to see execution results.
                    </div>
                  )
                )}

                {/* Test Case Results list (when tab is testcases or multiple results) */}
                {sampleResults.length > 0 && activeTab === 'testcases' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803D', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>TEST CASE RESULTS:</div>
                    {sampleResults.map((tr, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: tr.passed ? '#F0FDF4' : '#FEF2F2',
                        border: `1px solid ${tr.passed ? '#BBF7D0' : '#FECACA'}`,
                        marginBottom: 6,
                        fontSize: 12.5,
                      }}>
                        {tr.passed ? <CheckCircle2 size={14} color="#15803D" /> : <XCircle size={14} color="#DC2626" />}
                        <span style={{ fontWeight: 600, color: tr.passed ? '#15803D' : '#DC2626' }}>{`Test Case ${idx + 1}: ${tr.passed ? 'PASSED' : 'FAILED'}`}</span>
                        <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 11, fontFamily: 'monospace' }}>{tr.executionTime != null ? `${Number(tr.executionTime).toFixed(3)}s` : ''}</span>
                      </div>
                    ))}
                    {submitTotal > sampleResults.filter(r => !r.isHidden).length && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>
                        {submitTotal - sampleResults.filter(r => !r.isHidden).length} hidden test cases were evaluated
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Unified AI Monitoring Engine Widget (Laptop MediaPipe + Mobile YOLO11s) */}
        <UnifiedMonitoringWidget
          contextType="CODING"
          contextId={Number(assessmentId)}
          attemptId={Number(attemptId)}
          sessionId={resolvedMonitoringSessionId || verifSessionInfo?.sessionId}
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
