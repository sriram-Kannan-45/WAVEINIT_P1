import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QuizTaking from '../components/QuizTaking'
import AssessmentConsentGate from '../components/ai-quizzes/AssessmentConsentGate'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { Loader2, AlertCircle } from 'lucide-react'
import monitoringClient from '../proctoring/engine/MonitoringEngineClient'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

const fsApi = {
  exit: () =>
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
}

function ParticipantQuizAttemptPageInner({ user }) {
  const navigate = useNavigate()
  const { trainingId, quizId } = useParams()
  const [searchParams] = useSearchParams()
  const { error: showError } = useToast()

  let attemptId = searchParams.get('attemptId')
  let sessionToken = searchParams.get('sessionToken')
  let monitoringSessionId = searchParams.get('monitoringSessionId')

  if (quizId) {
    const storageKey = `quiz_${quizId}_attempt`
    if (attemptId && sessionToken) {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptId, sessionToken, monitoringSessionId }))
    } else {
      const cached = sessionStorage.getItem(storageKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          attemptId = attemptId || parsed.attemptId
          sessionToken = sessionToken || parsed.sessionToken
          monitoringSessionId = monitoringSessionId || parsed.monitoringSessionId
        } catch (e) {
          console.error('[ParticipantQuizAttemptPage] Error parsing cached session:', e)
        }
      }
    }
  }

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [quizData, setQuizData] = useState(null)
  const [verifSessionInfo] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`assessment_verif_QUIZ_${quizId}_${attemptId}`)
      return cached ? JSON.parse(cached) : null
    } catch (e) {
      return null
    }
  })
  const [consented, setConsented] = useState(false)
  const [resolvedMonitoringSessionId, setResolvedMonitoringSessionId] = useState(monitoringSessionId || null)

  useEffect(() => {
    if (!quizId || !attemptId) {
      setErrorMsg('Invalid quiz or attempt identifiers.')
      setLoading(false)
      return
    }

    let aborted = false
    const fetchQuestions = async () => {
      try {
        setLoading(true)
        const requestUrl = `${API_BASE}/quizzes/${quizId}/questions`

        const res = await fetch(requestUrl, {
          headers: authHeaders(user.token)
        })

        const data = await res.json()

        if (aborted) return

        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to load quiz questions.')
          setLoading(false)
          return
        }

        if (data.attempt?.monitoringSessionId) {
          setResolvedMonitoringSessionId(data.attempt.monitoringSessionId)
        }

        setQuizData({
          id: data.quiz.id,
          title: data.quiz.title,
          courseId: data.quiz.courseId || null,
          trainingId: data.quiz.trainingId || null,
          timeLimit: data.quiz.timeLimit,
          copyProtectionEnabled: data.quiz.copyProtectionEnabled,
          maxCopyWarnings: data.quiz.maxCopyWarnings,
          copyViolationActions: data.quiz.copyViolationActions,
          copyWarningMessage: data.quiz.copyWarningMessage,
          copyDisqualifyAction: data.quiz.copyDisqualifyAction,
          proctoringEnabled: true,
          proctoringLevel: data.quiz.proctoringLevel || 'MEDIUM',
          gracePeriodMinutes: data.quiz.gracePeriodMinutes || 2,
          initialViolationCount: data.attempt?.violationCount || 0,
          initialStatus: data.attempt?.status || 'IN_PROGRESS',
          questions: data.questions || []
        })
        setLoading(false)
      } catch (err) {
        if (!aborted) {
          setErrorMsg(err.message || 'Server error loading quiz.')
          setLoading(false)
        }
      }
    }

    fetchQuestions()
    return () => { aborted = true }
  }, [quizId, attemptId, user.token])

  const [testStartedAt, setTestStartedAt] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`quiz_${quizId}_test_start_${attemptId}`);
      return cached ? parseInt(cached, 10) : null;
    } catch {
      return null;
    }
  });

  const handleConsented = useCallback(() => {
    const start = Date.now();
    setTestStartedAt(start);
    try {
      sessionStorage.setItem(`quiz_${quizId}_test_start_${attemptId}`, String(start));
    } catch {}
    setConsented(true);
  }, [quizId, attemptId]);

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

  const handleCancel = useCallback(() => {
    endVerificationSession();
    const targetCourseId = quizData?.courseId || trainingId
    navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}&subtab=quizzes` : '/participant?tab=myEnrollments')
  }, [navigate, quizData, trainingId, endVerificationSession])

  // Stop media & exit fullscreen (called after quiz submission)
  const handleRecordingStop = useCallback(async () => {
    try {
      await monitoringClient.stopAndUploadRecording();
    } catch (e) {
      console.warn('[handleRecordingStop] Video upload note:', e.message);
    }
    try {
      monitoringClient.destroy();
    } catch (_) {}
    endVerificationSession();
    if (fsApi.element()) {
      try { await fsApi.exit() } catch {}
    }
  }, [endVerificationSession]);


  // Called from QuizTaking after submission succeeds and result is ready
  const handleSubmit = useCallback((submitResult) => {
    try {
      handleRecordingStop();
    } catch (_) {}
    const targetCourseId = quizData?.courseId || trainingId;
    const effectiveTrainingId = trainingId || quizData?.trainingId || targetCourseId || 0;
    const effectiveAttemptId = submitResult?.attemptId || attemptId;
    const effectiveQuizId = submitResult?.quizId || quizId;

    if (effectiveTrainingId && effectiveTrainingId !== '0') {
      navigate(`/trainings/${effectiveTrainingId}/quizzes/${effectiveQuizId}/result?attemptId=${effectiveAttemptId}`, {
        replace: true,
        state: { result: submitResult?.result, quizData }
      });
    } else {
      navigate(`/quizzes/${effectiveQuizId}/result?attemptId=${effectiveAttemptId}`, {
        replace: true,
        state: { result: submitResult?.result, quizData }
      });
    }
  }, [handleRecordingStop, quizData, trainingId, attemptId, quizId, navigate]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Poppins', sans-serif"
      }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }} size={36} />
        <span style={{ marginTop: '12px', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
          Initializing Quiz Session...
        </span>
      </div>
    )
  }

  if (errorMsg) {
    const targetCourseId = quizData?.courseId || trainingId
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: 20,
        fontFamily: "'Poppins', sans-serif"
      }}>
        <AlertCircle size={36} color="#dc2626" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginBottom: 12 }}>
          {errorMsg}
        </div>
        <button
          onClick={() => navigate(targetCourseId ? `/participant?tab=myEnrollments&courseId=${targetCourseId}` : '/participant?tab=myEnrollments')}
          style={{
            padding: '10px 20px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  // Pre-test Consent, Camera Calibration & Fullscreen Gate
  if (!consented && quizData) {
    return (
      <AssessmentConsentGate
        quiz={quizData}
        attemptId={parseInt(attemptId, 10)}
        onConsented={handleConsented}
        onCancel={handleCancel}
      />
    )
  }

  return (
    <>
      <QuizTaking
        quizId={parseInt(quizId, 10)}
        attemptId={parseInt(attemptId, 10)}
        quizData={quizData}
        sessionToken={sessionToken}
        isStandardQuiz={true}
        monitoringSessionId={resolvedMonitoringSessionId || verifSessionInfo?.sessionId}
        monitoringParticipant={user}
        testStartedAt={testStartedAt}
        onSubmit={handleSubmit}
        onRecordingStop={handleRecordingStop}
      />

    </>
  )
}

export default function ParticipantQuizAttemptPage({ user }) {
  return <ParticipantQuizAttemptPageInner user={user} />
}
