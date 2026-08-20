import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QuizTaking from '../components/QuizTaking'
import AssessmentConsentGate from '../components/ai-quizzes/AssessmentConsentGate'
import AssessmentQRPairingModal from '../components/assessment/AssessmentQRPairingModal'
import UnifiedMonitoringWidget from '../components/monitoring/UnifiedMonitoringWidget'
import { API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { Loader2, AlertCircle } from 'lucide-react'
import { ProctorProvider, useProctor } from '../proctoring/ProctorContext'
import useDeviceFingerprint from '../proctoring/hooks/useDeviceFingerprint'

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
  const proctor = useProctor()
  const fp = useDeviceFingerprint()

  let attemptId = searchParams.get('attemptId')
  let sessionToken = searchParams.get('sessionToken')

  if (quizId) {
    const storageKey = `quiz_${quizId}_attempt`
    if (attemptId && sessionToken) {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptId, sessionToken }))
    } else {
      const cached = sessionStorage.getItem(storageKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          attemptId = attemptId || parsed.attemptId
          sessionToken = sessionToken || parsed.sessionToken
        } catch (e) {
          console.error('[ParticipantQuizAttemptPage] Error parsing cached session:', e)
        }
      }
    }
  }

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [quizData, setQuizData] = useState(null)
  const [qrVerified, setQrVerified] = useState(false)
  const [verifSessionInfo, setVerifSessionInfo] = useState(null)
  const [consented, setConsented] = useState(false)

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

        setQuizData({
          id: data.quiz.id,
          title: data.quiz.title,
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

  const handleConsented = useCallback(() => {
    setConsented(true)
  }, [])

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
    navigate(`/trainings/${trainingId}`)
  }, [navigate, trainingId, endVerificationSession])

  // Stop media & exit fullscreen (called after quiz submission)
  const handleRecordingStop = useCallback(async () => {
    endVerificationSession();
    if (fsApi.element()) {
      try { await fsApi.exit() } catch {}
    }
  }, [endVerificationSession])

  // Called from QuizTaking's "Back to Dashboard" button / auto-submit
  const handleSubmit = useCallback(async () => {
    await handleRecordingStop()
    navigate(`/trainings/${trainingId}/quizzes/${quizId}/result`)
  }, [handleRecordingStop, trainingId, quizId, navigate])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Manrope', 'Poppins', sans-serif"
      }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }} size={36} />
        <span style={{ marginTop: '12px', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
          Initializing Quiz Session...
        </span>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: 20,
        fontFamily: "'Manrope', 'Poppins', sans-serif"
      }}>
        <AlertCircle size={36} color="#dc2626" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginBottom: 12 }}>
          {errorMsg}
        </div>
        <button
          onClick={() => navigate(`/trainings/${trainingId}`)}
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

  // Pre-test Step 1: Mobile Camera Pairing via QR Code
  if (!qrVerified && quizData) {
    return (
      <AssessmentQRPairingModal
        assessmentType="QUIZ"
        assessmentId={parseInt(quizId, 10)}
        attemptId={parseInt(attemptId, 10)}
        assessmentTitle={quizData.title || 'Quiz Assessment'}
        participantName={user?.name || 'Participant'}
        userToken={user?.token}
        onVerified={(data) => {
          setVerifSessionInfo(data);
          setQrVerified(true);
        }}
        onCancel={() => navigate('/participant')}
      />
    )
  }

  // Pre-test Step 2: Assessment Consent, Camera Calibration & Fullscreen Gate
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
        onSubmit={handleSubmit}
        onRecordingStop={handleRecordingStop}
      />

      {/* Unified AI Monitoring Engine Widget (Laptop MediaPipe + Mobile YOLO11s) */}
      <UnifiedMonitoringWidget
        contextType="QUIZ"
        contextId={parseInt(quizId, 10)}
        attemptId={parseInt(attemptId, 10)}
        sessionId={verifSessionInfo?.sessionId}
        participantId={user?.id}
        userToken={user?.token}
        mobileEnabled={true}
        preCalibrated={true}
        prePaired={true}
      />
    </>
  )
}

export default function ParticipantQuizAttemptPage({ user }) {
  return (
    <ProctorProvider>
      <ParticipantQuizAttemptPageInner user={user} />
    </ProctorProvider>
  )
}
