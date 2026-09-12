import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Languages, Loader2, ShieldCheck } from 'lucide-react'
import hiringService from '../../services/hiringService'
import { hireVoiceMessage, speakHireWarning } from '../../utils/hireVoiceProctor'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const labels = { TURN_LEFT: 'turn your head left', TURN_RIGHT: 'turn your head right', BLINK: 'blink once' }

export default function HireIdentityGate({ sessionId, policy, onVerified }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [language, setLanguage] = useState(() => policy.allowParticipantLanguage === false
    ? (policy.defaultLanguage || 'en-IN')
    : (sessionStorage.getItem('hire_proctor_language') || policy.defaultLanguage || 'en-IN'))
  const [challenge, setChallenge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot access a webcam. Use a supported browser with camera permission.')
      return undefined
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(stream => { if (cancelled) return stream.getTracks().forEach(track => track.stop()); streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream })
      .catch(() => setError('Allow webcam access to verify your identity.'))
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(track => track.stop()); window.speechSynthesis?.cancel() }
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video?.videoWidth) throw new Error('Camera is not ready yet')
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = Math.round(480 * video.videoHeight / video.videoWidth)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', .78)
  }

  const begin = async () => {
    setBusy(true); setError('')
    try {
      const next = await hiringService.getLivenessChallenge(sessionId)
      setChallenge(next.challenge)
      if (policy.voiceWarnings) speakHireWarning({ language, key: 'neutral', rate: policy.voiceRate, volume: policy.voiceVolume })
      await delay(900)
      const frames = [capture()]
      if (policy.voiceWarnings) speakHireWarning({ language, key: next.challenge, rate: policy.voiceRate, volume: policy.voiceVolume })
      await delay(250)
      // A short burst catches the closed-eye phase of a blink and the full
      // motion arc of a head-turn without recording a video.
      for (let i = 0; i < 7; i += 1) { frames.push(capture()); await delay(180) }
      const result = await hiringService.captureIdentity(sessionId, { challenge: next.challenge, frames })
      if (!result.verified) throw new Error('Identity verification did not complete')
      sessionStorage.setItem('hire_proctor_language', language)
      onVerified({ language })
    } catch (reason) { setError(reason.message || 'Identity verification failed. Try again in good lighting.'); setChallenge(null) }
    finally { setBusy(false) }
  }

  return <div className="reg-admin-section" style={{ maxWidth: 720, margin: '28px auto', padding: 24 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><ShieldCheck size={28} color="#059669" /><div><h2 style={{ margin: 0 }}>Hire identity & liveness check</h2><p style={{ margin: '5px 0 0', color: '#64748B' }}>Your source frames are processed for verification; only a compact face signature is retained with the session.</p></div></div>
    <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', maxHeight: 380, objectFit: 'cover', borderRadius: 12, background: '#0F172A', marginTop: 18 }} />
    <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 15 }}>
      <label className="reg-admin-field" style={{ flex: '1 1 220px' }}><span><Languages size={13} /> Instruction language</span><select value={language} disabled={policy.allowParticipantLanguage === false} onChange={event => setLanguage(event.target.value)}><option value="en-IN">English</option><option value="hi-IN">हिन्दी</option><option value="ta-IN">தமிழ்</option><option value="te-IN">తెలుగు</option><option value="kn-IN">ಕನ್ನಡ</option><option value="ml-IN">മലയാളം</option><option value="mr-IN">मराठी</option><option value="bn-IN">বাংলা</option><option value="gu-IN">ગુજરાતી</option><option value="pa-IN">ਪੰਜਾਬੀ</option></select></label>
      <button className="reg-admin-btn reg-admin-btn--primary" onClick={begin} disabled={busy || !sessionId}>{busy ? <Loader2 size={15} className="bulk-spin" /> : <Camera size={15} />} {busy ? (challenge ? `Please ${labels[challenge]}…` : 'Preparing…') : 'Verify identity'}</button>
    </div>
    {challenge && <p style={{ color: '#047857', fontWeight: 700 }}>{hireVoiceMessage(language, challenge)}</p>}
    {error && <p role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{error}</p>}
  </div>
}
