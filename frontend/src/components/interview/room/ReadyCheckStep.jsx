/**
 * ReadyCheckStep Component (Step 1 of 3: Pre-Join Ready Check)
 * Focused pre-join check: confirm camera + microphone, view live self-preview, and verify readiness.
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
  RefreshCw,
  Sliders,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'

export default function ReadyCheckStep({
  interviewId,
  interviewData,
  isInterviewer,
  mediaState,
  mediaError,
  localVideoRef,
  cameraPermission = 'prompt',
  micPermission = 'prompt',
  micLevel = 0,
  isMicDetected = false,
  devices = { cameras: [], microphones: [] },
  selectedCamera,
  selectedMicrophone,
  onCameraChange,
  onMicrophoneChange,
  onEnumerateDevices,
  onRetry,
  onContinue,
  onBack,
  isBusy,
}) {
  const mediaReady = mediaState === 'ready'
  const mediaFailed = mediaState === 'error'

  useEffect(() => {
    if (onEnumerateDevices && devices.cameras.length === 0 && devices.microphones.length === 0) {
      onEnumerateDevices()
    }
  }, [onEnumerateDevices, devices])

  const canContinue = mediaReady && !isBusy

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'Scheduled'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Pre-Join Ready Check`}
      step={isInterviewer ? 'Step 1 of 1' : 'Step 1 of 4'}
      headerRight={
        onBack && (
          <button onClick={onBack} className="reg-admin-btn reg-admin-btn--secondary">
            Back
          </button>
        )
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 840, margin: '0 auto', background: '#fff' }}>
        {/* Card Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)', width: 36, height: 36 }}>
            <ShieldCheck size={18} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Step 1: Ready Check & Device Setup
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
              Confirm your camera and microphone access before continuing to pairing.
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: '20px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            alignItems: 'start',
          }}>
            {/* Left: Video Self-Preview */}
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 8 }}>
                Live Camera Preview
              </span>
              <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: '#0f172A',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #1e293b',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
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
                    padding: 16,
                  }}>
                    {mediaFailed ? <VideoOff size={32} color="#ef4444" /> : <Loader2 size={32} color="#60a5fa" className="spin" />}
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                      {mediaFailed ? 'Camera Unavailable' : 'Starting Camera & Mic...'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {mediaFailed ? (mediaError || 'Please allow camera and mic permissions in your browser.') : 'Please allow permissions when prompted.'}
                    </div>
                  </div>
                )}
                {mediaReady && (
                  <span style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    padding: '3px 8px',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                  }}>
                    ● Live Preview ({isInterviewer ? 'Interviewer' : 'Candidate'})
                  </span>
                )}
              </div>
            </div>

            {/* Right: Permission Status & Device Selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                Hardware & Permission Status
              </span>

              {/* Camera Status Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: mediaReady ? '#f0fdf4' : mediaFailed ? '#fef2f2' : '#f8fafc',
                border: `1px solid ${mediaReady ? '#bbf7d0' : mediaFailed ? '#fecaca' : '#e2e8f0'}`,
              }}>
                {mediaReady ? <CheckCircle2 size={18} color="#16A34A" /> : mediaFailed ? <XCircle size={18} color="#DC2626" /> : <Loader2 size={18} color="#64748b" className="spin" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: mediaReady ? '#15803D' : mediaFailed ? '#B91C1C' : '#334155' }}>
                    Camera Access
                  </div>
                  <div style={{ fontSize: 11, color: mediaReady ? '#166534' : mediaFailed ? '#991B1B' : '#64748b' }}>
                    {mediaReady ? 'Camera connected & streaming' : mediaFailed ? 'Permission denied or camera offline' : 'Requesting camera access...'}
                  </div>
                </div>
              </div>

              {/* Mic Status Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: mediaReady ? '#f0fdf4' : mediaFailed ? '#fef2f2' : '#f8fafc',
                border: `1px solid ${mediaReady ? '#bbf7d0' : mediaFailed ? '#fecaca' : '#e2e8f0'}`,
              }}>
                {mediaReady ? <CheckCircle2 size={18} color="#16A34A" /> : mediaFailed ? <XCircle size={18} color="#DC2626" /> : <Loader2 size={18} color="#64748b" className="spin" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: mediaReady ? '#15803D' : mediaFailed ? '#B91C1C' : '#334155' }}>
                    Microphone Access
                  </div>
                  <div style={{ fontSize: 11, color: mediaReady ? '#166534' : mediaFailed ? '#991B1B' : '#64748b' }}>
                    {mediaReady ? (isMicDetected ? 'Microphone active (voice detected)' : 'Microphone ready') : mediaFailed ? 'Permission denied or mic offline' : 'Requesting microphone access...'}
                  </div>
                </div>
              </div>

              {/* Live Mic Activity Bar */}
              {mediaReady && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Microphone Level</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>{micLevel}%</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(4, micLevel)}%`, height: '100%', background: '#16A34A', transition: 'width 75ms' }} />
                  </div>
                </div>
              )}

              {/* Device Selectors (if multiple devices) */}
              {devices?.cameras?.length > 1 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    Camera Input
                  </label>
                  <select
                    value={selectedCamera || ''}
                    onChange={(e) => onCameraChange?.(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: 12,
                      background: '#fff',
                    }}
                  >
                    {devices.cameras.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap',
          }}>
            <div>
              {mediaFailed && (
                <button onClick={onRetry} className="reg-admin-btn reg-admin-btn--secondary" style={{ minHeight: 44 }}>
                  <RefreshCw size={14} /> Retry Permissions
                </button>
              )}
            </div>

            <button
              onClick={onContinue}
              disabled={!canContinue}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{
                padding: '10px 24px',
                fontSize: 13,
                fontWeight: 600,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isBusy ? 'Connecting...' : isInterviewer ? "I'm Ready — Enter Room" : "I'm Ready — Continue"}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
