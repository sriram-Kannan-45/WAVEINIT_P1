import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AssessmentConsentGate from '../components/ai-quizzes/AssessmentConsentGate'
import AssessmentQRPairingModal from '../components/assessment/AssessmentQRPairingModal'
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

  // Pre-test Step 1: Mobile Camera Pairing via QR Code
  if (!qrVerified && assessment) {
    return (
      <AssessmentQRPairingModal
        assessmentType="CODING"
        assessmentId={Number(assessmentId)}
        attemptId={Number(attemptId)}
        assessmentTitle={assessment.title || 'Coding Assessment'}
        participantName={user?.name || 'Participant'}
        userToken={user?.token}
        onVerified={(data) => {
          setVerifSessionInfo(data);
          setQrVerified(true);
        }}
        onCancel={() => {
          const targetCourseId = assessment?.courseId || trainingId;
          navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=coding` : '/participant?tab=myEnrollments');
        }}
      />
    );
  }

  // Pre-test Step 2: Assessment Consent, Camera Calibration & Fullscreen Gate
  if (!consented) return (
    <AssessmentConsentGate
      quiz={assessment ? { id: assessment.id, title: assessment.title, description: assessment.description, timeLimit: assessment.timeLimit } : null}
      attemptId={Number(attemptId)}
      onConsented={handleConsented}
      onCancel={handleCancel}
    />
  )

  const s = {
    container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', overflow: 'hidden' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#16213e', borderBottom: '1px solid #0f3460', flexShrink: 0 },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
    headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
    title: { fontSize: 14, fontWeight: 700, color: '#e0e0e0' },
    timer: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: timeLeft < 300 ? '#3d0000' : '#1a1a3e', color: timeLeft < 300 ? '#ff4444' : '#8888aa', fontWeight: 700, fontSize: 13, fontFamily: "'Fira Code', monospace" },
    main: { display: 'flex', flex: 1, overflow: 'hidden' },
    leftPanel: { width: '40%', minWidth: 340, maxWidth: 520, overflow: 'auto', borderRight: '1px solid #0f3460', background: '#1a1a2e' },
    problemNav: { display: 'flex', gap: 4, padding: '12px 16px', borderBottom: '1px solid #0f3460', background: '#16213e' },
    problemBtn: (active) => ({ padding: '4px 12px', border: active ? '1px solid #0D9488' : '1px solid #333', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? '#2d2a5e' : '#1a1a3e', color: active ? '#818cf8' : '#666' }),
    rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    editorContainer: { flex: 1, overflow: 'hidden', borderBottom: '1px solid #0f3460' },
    bottomPanel: { flex: '0 0 auto', maxHeight: '35%', display: 'flex', flexDirection: 'column' },
    tabBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#16213e', borderBottom: '1px solid #0f3460' },
    tabLeft: { display: 'flex', alignItems: 'center', gap: 4 },
    tabBtn: (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: active ? '#2d2a5e' : 'transparent', color: active ? '#818cf8' : '#888' }),
    actionBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', color: '#888', border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 },
    runBtn: (disabled) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: disabled ? '#333' : '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }),
    submitBtn: (disabled) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: disabled ? '#333' : '#0D9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }),
    outputArea: { flex: 1, overflow: 'auto', padding: 12, fontFamily: "'Fira Code', 'Consolas', monospace", fontSize: 13, background: '#1a1a2e', color: '#e0e0e0' },
    verdictBadge: (v) => {
      const colors = { ACCEPTED: '#059669', WRONG_ANSWER: '#dc2626', COMPILATION_ERROR: '#f59e0b', TIME_LIMIT_EXCEEDED: '#f97316', MEMORY_LIMIT_EXCEEDED: '#f97316', RUNTIME_ERROR: '#ef4444', INTERNAL_ERROR: '#dc2626' }
      return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700, background: `${colors[v] || '#666'}22`, color: colors[v] || '#666', border: `1px solid ${colors[v] || '#666'}44` }
    },
  }

  return (
    <ExamProctorShell
      onSubmit={handleSubmit}
      title={assessment?.title || 'Coding Assessment'}
      requireScreenShare={false}
    >
      <div style={s.container}>
        <div style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.title}>{assessment?.title}</span>
            {saveStatus && <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}><Save size={10} /> {saveStatus}</span>}
          </div>
          <div style={s.headerRight}>
            {timeLeft != null && (
              <div style={s.timer}>
                <Clock size={13} />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
            <button onClick={() => handleSubmit(false)} disabled={submitting || submitted} style={s.submitBtn(submitting || submitted)}>
              <Send size={13} />
              {submitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          </div>
        </div>

        <div style={s.main}>
          <div style={s.leftPanel}>
            <div style={s.problemNav}>
              {problems.map((p, idx) => (
                <button key={p.id} onClick={() => setCurrentProblemIndex(idx)} style={s.problemBtn(currentProblemIndex === idx)}>
                  {`Problem ${idx + 1}`}
                </button>
              ))}
            </div>
            {currentProblem && <ProblemPanel problem={currentProblem} index={currentProblemIndex} total={problems.length} />}
          </div>

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

            <div style={s.bottomPanel}>
              <div style={s.tabBar}>
                <div style={s.tabLeft}>
                  <button onClick={() => setActiveTab('output')} style={s.tabBtn(activeTab === 'output')}>
                    <Terminal size={12} /> Execution Output
                  </button>
                  <button onClick={() => setShowCustomInput(prev => !prev)} style={s.actionBtn}>
                    <Bug size={12} /> {showCustomInput ? 'Hide Custom Input' : 'Custom Input'}
                  </button>
                  <button onClick={handleResetCode} style={s.actionBtn} title="Reset starter code">
                    <Trash2 size={12} /> Reset
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleRunCode} disabled={running || submitting || submitted} style={s.runBtn(running || submitting || submitted)}>
                    <Play size={12} /> {running ? 'Running...' : 'Run Code'}
                  </button>
                  <button onClick={handleSubmitCode} disabled={submitting || running || submitted} style={s.submitBtn(submitting || running || submitted)}>
                    <Check size={12} /> {submitting ? 'Submitting...' : 'Submit Code'}
                  </button>
                </div>
              </div>

              {showCustomInput && (
                <div style={{ padding: '8px 12px', background: '#16213e', borderBottom: '1px solid #0f3460' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Custom Input (stdin):</div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    style={{ width: '100%', height: 50, background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: 6, fontSize: 12, fontFamily: "'Fira Code', monospace" }}
                    placeholder="Enter custom input here..."
                  />
                </div>
              )}

              <div style={s.outputArea}>
                {judgeStatus && <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="animate-spin" /> {judgeStatus}</div>}
                {runStatus && <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 700 }}>Status:</span> <span style={{ color: runStatus === 'ACCEPTED' ? '#059669' : '#dc2626', fontWeight: 600 }}>{runStatus}</span>{runTime != null && <span style={{ color: '#888', fontSize: 11 }}>({runTime.toFixed(3)}s, {runMemory}MB)</span>}</div>}
                {submitVerdict && (
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={s.verdictBadge(submitVerdict)}>{submitVerdict}</span>
                    {submitPassed != null && <span style={{ fontSize: 12, color: '#888' }}>{submitPassed}/{submitTotal} test cases passed ({submitScore}%)</span>}
                  </div>
                )}
                {output && <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{output}</pre>}
                {sampleResults.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 }}>TEST CASE RESULTS:</div>
                    {sampleResults.map((tr, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: tr.passed ? '#05966911' : '#dc262611', border: `1px solid ${tr.passed ? '#05966933' : '#dc262633'}`, marginBottom: 4, fontSize: 12 }}>
                        {tr.passed ? <CheckCircle2 size={13} color="#059669" /> : <XCircle size={13} color="#dc2626" />}
                        <span style={{ fontWeight: 600, color: tr.passed ? '#059669' : '#dc2626' }}>{`Test Case ${idx + 1}: ${tr.passed ? 'PASSED' : 'FAILED'}`}</span>
                        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 10 }}>{tr.executionTime != null ? `${Number(tr.executionTime).toFixed(3)}s` : ''}</span>
                      </div>
                    ))}
                    {submitTotal > sampleResults.filter(r => !r.isHidden).length && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#888', fontStyle: 'italic' }}>
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
