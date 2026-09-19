import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CheckCircle2, Languages, Loader2, ShieldCheck, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import hiringService from '../../services/hiringService'
import { hireVoiceMessage, speakHireWarning } from '../../utils/hireVoiceProctor'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const CHALLENGE_LABELS = {
  TURN_LEFT: 'Slowly turn your head to the left',
  TURN_RIGHT: 'Slowly turn your head to the right',
  BLINK: 'Blink once, then look at the camera',
}

// Classify backend/network errors into user-facing messages
function classifyError(err) {
  const status = err?.status || err?.response?.status || null
  const message = (err?.message || '').toLowerCase()
  if (status === 503 || message.includes('unavailable') || message.includes('econnrefused') || message.includes('network'))
    return 'Verification service is temporarily unavailable. Please try again in a moment.'
  if (status === 409) {
    if (message.includes('already been verified'))
      return 'Identity has already been verified for this session.'
    if (message.includes('expired'))
      return 'Verification challenge expired. Please request a new one.'
    return 'Session state mismatch. Please refresh the page and try again.'
  }
  if (status === 422 || message.includes('liveness') || message.includes('face'))
    return 'Liveness not detected. Ensure you are well-lit and facing the camera, then follow the movement instruction carefully.'
  if (message.includes('camera') || message.includes('not ready'))
    return 'Camera is not ready. Please wait a moment and try again.'
  if (message.includes('challenge'))
    return 'Verification challenge not found. Please click "Get Challenge" again.'
  return err?.message || 'Identity verification failed. Please try again in good lighting.'
}

const HIRE_VOICE_LANGUAGES = ['en-IN', 'ta-IN']

export default function HireIdentityGate({ sessionId, policy, onVerified }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [language, setLanguage] = useState(() => {
    const preferred = policy.allowParticipantLanguage === false
      ? (policy.defaultLanguage || 'en-IN')
      : (sessionStorage.getItem('hire_proctor_language') || policy.defaultLanguage || 'en-IN')
    return HIRE_VOICE_LANGUAGES.includes(preferred) ? preferred : 'en-IN'
  })

  // Step states
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [challengeLoading, setChallengeLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('camera') // 'camera' | 'challenge' | 'capturing' | 'done'

  // Camera setup
  useEffect(() => {
    let cancelled = false
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Your browser cannot access the webcam. Please use Chrome or Edge with camera permission enabled.')
      return undefined
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            if (!cancelled) setCameraReady(true)
          }
        }
      })
      .catch(err => {
        if (cancelled) return
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          setCameraError('Camera permission is blocked. Please allow camera access in your browser settings and reload.')
        else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')
          setCameraError('No camera detected. Please connect a webcam and reload.')
        else if (err.name === 'NotReadableError')
          setCameraError('Camera is already in use by another application. Please close it and reload.')
        else
          setCameraError('Could not access the camera. Please check permissions and try again.')
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Capture a single frame from the video element
  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video) throw new Error('Camera element not found')
    if (video.readyState < 2) throw new Error('Camera is not ready yet — please wait')
    if (!video.videoWidth || !video.videoHeight) throw new Error('Camera frame is empty — please wait for the preview to appear')
    const canvas = document.createElement('canvas')
    canvas.width = 480
    canvas.height = Math.round(480 * video.videoHeight / video.videoWidth)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.78)
  }, [])

  // Step 1: Request a liveness challenge from the server
  const requestChallenge = async () => {
    if (!sessionId) { setError('Verification session is not ready yet. Please wait a moment.'); return }
    setChallengeLoading(true)
    setError('')
    try {
      const next = await hiringService.getLivenessChallenge(sessionId)
      setChallenge(next.challenge)
      setStep('challenge')
      if (policy.voiceWarnings) {
        speakHireWarning({ language, key: 'neutral', rate: policy.voiceRate, volume: policy.voiceVolume })
      }
    } catch (err) {
      setError(classifyError(err))
    } finally {
      setChallengeLoading(false)
    }
  }

  // Step 2: Capture frames + submit identity reference
  const begin = async () => {
    if (!challenge) { setError('Please request a challenge first.'); return }
    setBusy(true)
    setError('')
    setStep('capturing')
    try {
      // Neutral frame first
      const frames = [capture()]
      // Announce challenge instruction via voice
      if (policy.voiceWarnings) {
        speakHireWarning({ language, key: challenge, rate: policy.voiceRate, volume: policy.voiceVolume })
      }
      await delay(300)
      // Capture burst: 7 frames at 180ms intervals to capture full movement arc
      for (let i = 0; i < 7; i++) {
        frames.push(capture())
        await delay(180)
      }
      const result = await hiringService.captureIdentity(sessionId, { challenge, frames })
      if (!result.verified) throw new Error('Identity verification did not complete. Please retry.')
      sessionStorage.setItem('hire_proctor_language', language)
      setStep('done')
      await delay(400)
      onVerified({ language })
    } catch (err) {
      setError(classifyError(err))
      setStep('challenge') // allow retry from challenge step
      setChallenge(null)  // force re-request of challenge
    } finally {
      setBusy(false)
    }
  }

  const canRequestChallenge = !!sessionId && cameraReady && !busy && !challengeLoading
  const canCapture = !!challenge && cameraReady && !busy

  return (
    <div className="reg-admin-section" style={{ maxWidth: 720, margin: '28px auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <ShieldCheck size={28} color="#059669" />
        <div>
          <h2 style={{ margin: 0 }}>Hire Identity &amp; Liveness Check</h2>
          <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 14 }}>
            Complete identity verification before starting the assessment. Your frames are processed securely — only a compact face signature is retained.
          </p>
        </div>
      </div>

      {/* Step Progress */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { key: 'camera', label: '① Camera', done: cameraReady },
          { key: 'challenge', label: '② Challenge', done: !!challenge },
          { key: 'capturing', label: '③ Verify', done: step === 'done' },
        ].map(s => (
          <div key={s.key} style={{
            display: 'flex', gap: 6, alignItems: 'center',
            padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            background: s.done ? '#DCFCE7' : (step === s.key ? '#EFF6FF' : '#F1F5F9'),
            color: s.done ? '#15803D' : (step === s.key ? '#1D4ED8' : '#94A3B8'),
            border: `1px solid ${s.done ? '#86EFAC' : (step === s.key ? '#BFDBFE' : '#E2E8F0')}`,
          }}>
            {s.done ? <CheckCircle2 size={14} /> : null}
            {s.label}
          </div>
        ))}
      </div>

      {/* Camera error */}
      {cameraError && (
        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, marginBottom: 16 }}>
          <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, color: '#991B1B', fontWeight: 600, fontSize: 14 }}>{cameraError}</p>
        </div>
      )}

      {/* Camera preview */}
      <div style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Identity verification camera preview"
          style={{
            width: '100%', maxHeight: 360, objectFit: 'cover',
            borderRadius: 12, background: '#0F172A',
            border: cameraReady ? '2px solid #10B981' : '2px solid #334155',
          }}
        />
        {/* Camera status badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', gap: 6, alignItems: 'center',
          background: 'rgba(0,0,0,0.65)', borderRadius: 20,
          padding: '4px 10px', fontSize: 12, color: '#fff',
        }}>
          {cameraReady
            ? <><CheckCircle2 size={12} color="#34D399" /> Camera connected</>
            : cameraError
              ? <><WifiOff size={12} color="#F87171" /> Camera unavailable</>
              : <><Loader2 size={12} className="bulk-spin" /> Connecting…</>
          }
        </div>
      </div>

      {/* Session not ready warning */}
      {!sessionId && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, padding: '10px 14px', background: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA' }}>
          <Loader2 size={14} className="bulk-spin" color="#C2410C" />
          <span style={{ fontSize: 13, color: '#C2410C', fontWeight: 500 }}>Preparing verification session… please wait.</span>
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
        <label className="reg-admin-field" style={{ flex: '1 1 200px' }}>
          <span><Languages size={13} /> Instruction language</span>
          <select
            value={language}
            disabled={policy.allowParticipantLanguage === false}
            onChange={e => setLanguage(e.target.value)}
          >
            <option value="en-IN">English</option>
            <option value="ta-IN">தமிழ்</option>
          </select>
        </label>

        {/* Step 1: Get Challenge */}
        {!challenge && (
          <button
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={requestChallenge}
            disabled={!canRequestChallenge}
            title={!sessionId ? 'Verification session not ready' : !cameraReady ? 'Waiting for camera' : ''}
          >
            {challengeLoading ? <Loader2 size={15} className="bulk-spin" /> : <Camera size={15} />}
            {challengeLoading ? 'Getting challenge…' : 'Get Verification Challenge'}
          </button>
        )}

        {/* Step 2: Perform liveness */}
        {challenge && (
          <button
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={begin}
            disabled={!canCapture}
          >
            {busy ? <Loader2 size={15} className="bulk-spin" /> : <Camera size={15} />}
            {busy ? 'Verifying…' : 'Verify Identity'}
          </button>
        )}
      </div>

      {/* Challenge instruction */}
      {challenge && !busy && (
        <div
          aria-live="polite"
          style={{
            marginTop: 14, padding: '12px 16px',
            background: '#ECFDF5', border: '2px solid #6EE7B7',
            borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}
        >
          <Wifi size={18} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: 0, color: '#065F46', fontWeight: 700, fontSize: 15 }}>
              Movement instruction: {CHALLENGE_LABELS[challenge] || challenge}
            </p>
            <p style={{ margin: '4px 0 0', color: '#047857', fontSize: 13 }}>
              {hireVoiceMessage(language, challenge)}
            </p>
            <p style={{ margin: '6px 0 0', color: '#6B7280', fontSize: 12 }}>
              Click "Verify Identity" and perform the movement when the verification starts.
            </p>
          </div>
        </div>
      )}

      {/* Capturing progress */}
      {busy && step === 'capturing' && (
        <div aria-live="assertive" style={{ marginTop: 14, padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10 }}>
          <p style={{ margin: 0, color: '#1E40AF', fontWeight: 600 }}>
            <Loader2 size={14} className="bulk-spin" style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Capturing frames — please {CHALLENGE_LABELS[challenge]?.toLowerCase() || 'follow the instruction'}…
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
          <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: 0, color: '#991B1B', fontWeight: 700, fontSize: 14 }}>{error}</p>
            {error.includes('service') && (
              <p style={{ margin: '4px 0 0', color: '#B91C1C', fontSize: 12 }}>
                This is a temporary system issue — it is not a problem with your camera or movement. Please wait and retry.
              </p>
            )}
          </div>
        </div>
      )}

      {/* General instructions */}
      <div style={{ marginTop: 16, padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
        <p style={{ margin: 0, color: '#64748B', fontSize: 12, lineHeight: 1.6 }}>
          <strong>Tips:</strong> Ensure your face is clearly visible, well-lit from the front, and centred in the camera preview.
          Remove sunglasses or hats. Perform the movement slowly and clearly.
          If verification fails repeatedly, please contact your assessment coordinator.
        </p>
      </div>
    </div>
  )
}
