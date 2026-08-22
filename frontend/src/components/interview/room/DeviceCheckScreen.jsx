/**
 * DeviceCheckScreen Component (Stage 4: Device & Connection Check)
 * Pre-interview setup screen matching LMS card, input, and button styles.
 */
import { useEffect } from 'react'
import InterviewShell from './InterviewShell'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Video,
  VideoOff,
  Mic,
  AlertTriangle,
  RefreshCw,
  Sliders,
} from 'lucide-react'

function CheckRow({ label, detail, state }) {
  const isOk = state === 'ok'
  const isFail = state === 'fail'
  const isLoading = state === 'loading'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: isOk ? '#f0fdf4' : isFail ? '#fef2f2' : '#f8fafc',
      border: `1px solid ${isOk ? '#bbf7d0' : isFail ? '#fecaca' : '#e2e8f0'}`,
      borderRadius: 8,
    }}>
      {isOk ? (
        <CheckCircle2 size={18} color="#16A34A" />
      ) : isFail ? (
        <XCircle size={18} color="#DC2626" />
      ) : isLoading ? (
        <Loader2 size={18} color="#64748b" className="spin" />
      ) : (
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #cbd5e1' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isOk ? '#15803D' : isFail ? '#B91C1C' : '#334155' }}>
          {label}
        </div>
        {detail && <div style={{ fontSize: 11, color: isOk ? '#166534' : isFail ? '#991B1B' : '#64748b' }}>{detail}</div>}
      </div>
    </div>
  )
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }
const selectStyle = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'Inter, system-ui, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
  appearance: 'none',
  background: '#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 10px center',
  paddingRight: 30,
}

export default function DeviceCheckScreen({
  mediaState,
  mediaError,
  localVideoRef,
  isSecure,
  supportsMedia,
  onRetry,
  onContinue,
  onBack,
  isBusy,
  devices = { cameras: [], microphones: [] },
  selectedCamera,
  selectedMicrophone,
  onCameraChange,
  onMicrophoneChange,
  onEnumerateDevices,
  micLevel = 0,
  isMicDetected = false,
  cameraPermission = 'prompt',
  micPermission = 'prompt',
  interviewId,
}) {
  const mediaReady = mediaState === 'ready'
  const mediaFailed = mediaState === 'error'

  useEffect(() => {
    if (onEnumerateDevices && devices.cameras.length === 0 && devices.microphones.length === 0) {
      onEnumerateDevices()
    }
  }, [onEnumerateDevices, devices])

  const checks = [
    {
      label: 'Secure connection',
      detail: isSecure ? 'HTTPS / Secure context confirmed' : 'Insecure context (requires HTTPS)',
      state: isSecure ? 'ok' : 'fail',
    },
    {
      label: 'Browser media support',
      detail: supportsMedia ? 'Browser media APIs supported' : 'Media devices API unsupported',
      state: supportsMedia ? 'ok' : 'fail',
    },
    {
      label: 'Camera permission',
      detail: cameraPermission === 'granted' && mediaReady
        ? 'Camera active'
        : cameraPermission === 'denied' || mediaFailed
        ? 'Camera permission denied or camera offline'
        : 'Requesting camera...',
      state: cameraPermission === 'granted' && mediaReady ? 'ok' : mediaFailed || cameraPermission === 'denied' ? 'fail' : 'loading',
    },
    {
      label: 'Microphone permission',
      detail: micPermission === 'granted' && mediaReady
        ? isMicDetected ? 'Microphone connected and active' : 'Microphone ready'
        : micPermission === 'denied' || mediaFailed
        ? 'Microphone permission denied or offline'
        : 'Requesting microphone...',
      state: micPermission === 'granted' && mediaReady ? 'ok' : mediaFailed || micPermission === 'denied' ? 'fail' : 'loading',
    },
  ]

  const canContinue = isSecure && supportsMedia && mediaReady && !isBusy

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge="Device Check"
      subtitle="Verify your camera and microphone setup"
      step="Stage 3 of 4"
      headerRight={
        <button onClick={onBack} className="reg-admin-btn reg-admin-btn--secondary">
          Back
        </button>
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 960, margin: '0 auto', background: '#fff' }}>
        {/* Header inside card */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
            <Sliders size={20} color="#16A34A" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Device & Connection Check
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
              Verify hardware readiness and select your preferred inputs.
            </p>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* Left side: Checklist & Selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', uppercase: true }}>Connection Checks</span>
                {checks.map(c => (
                  <CheckRow key={c.label} {...c} />
                ))}
              </div>

              {mediaFailed && (
                <div style={{
                  padding: 14,
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#dc2626',
                }}>
                  <strong>Access Problem: </strong> {mediaError || 'Failed to initialize camera or microphone.'}
                </div>
              )}

              {/* Camera Selector */}
              <div>
                <label style={labelStyle}>Camera Selector</label>
                <select
                  value={selectedCamera || ''}
                  onChange={(e) => onCameraChange?.(e.target.value)}
                  disabled={!isSecure || mediaState === 'requesting'}
                  style={selectStyle}
                >
                  {devices.cameras.length === 0 ? (
                    <option value="">No cameras found</option>
                  ) : (
                    devices.cameras.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Microphone Selector */}
              <div>
                <label style={labelStyle}>Microphone Selector</label>
                <select
                  value={selectedMicrophone || ''}
                  onChange={(e) => onMicrophoneChange?.(e.target.value)}
                  disabled={!isSecure || mediaState === 'requesting'}
                  style={selectStyle}
                >
                  {devices.microphones.length === 0 ? (
                    <option value="">No microphones found</option>
                  ) : (
                    devices.microphones.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Microphone Level */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={labelStyle}>Microphone Level</label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>{micLevel}%</span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(4, micLevel)}%`, height: '100%', background: '#16A34A', transition: 'width 75ms' }} />
                </div>
              </div>
            </div>

            {/* Right side: Camera Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Camera Preview</span>
              <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: '#0f172a',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #334155',
              }}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
                {!mediaReady && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    textAlign: 'center',
                    padding: 20,
                  }}>
                    {mediaFailed ? <VideoOff size={36} color="#ef4444" /> : <Video size={36} color="#94a3b8" />}
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                      {mediaFailed ? 'Camera Unavailable' : 'Initializing Camera...'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      Grant browser permissions to enable preview
                    </div>
                  </div>
                )}
                {mediaReady && (
                  <span style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    padding: '4px 10px',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                  }}>
                    Live Preview (You)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            {(mediaFailed || !canContinue) && (
              <button onClick={onRetry} className="reg-admin-btn reg-admin-btn--secondary">
                <RefreshCw size={14} /> Try Again
              </button>
            )}
            <button
              onClick={onContinue}
              disabled={!canContinue}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              {isBusy ? 'Processing...' : 'Continue to Interview Room'}
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
