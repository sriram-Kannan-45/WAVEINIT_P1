/**
 * DeviceCheckScreen
 * Step 2 of the interview room flow. Runs a readiness checklist (secure
 * context, browser media support, camera + microphone) with a live preview.
 * Now includes device selection dropdowns for camera and microphone.
 * The parent owns media acquisition; this screen renders its state.
 */
import { useEffect } from 'react'
import InterviewShell from './InterviewShell'

function CheckItem({ label, detail, state }) {
  const icon =
    state === 'ok' ? '✅' : state === 'fail' ? '❌' : state === 'loading' ? '⏳' : '⬜'
  const color =
    state === 'ok' ? 'text-green-600' : state === 'fail' ? 'text-red-500' : 'text-slate-500'

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-surface-100 last:border-0">
      <span className="text-lg leading-none mt-0.5">{icon}</span>
      <div className="flex-1">
        <div className={`text-sm font-medium ${color}`}>{label}</div>
        {detail && <div className="text-xs text-surface-400 mt-0.5">{detail}</div>}
      </div>
    </div>
  )
}

function DeviceSelector({ label, devices, selectedDevice, onDeviceChange, disabled }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={selectedDevice || ''}
        onChange={(e) => onDeviceChange(e.target.value)}
        disabled={disabled || devices.length === 0}
        className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm text-surface-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {devices.length === 0 ? (
          <option value="">No devices found</option>
        ) : (
          devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `${label} ${device.deviceId.slice(0, 8)}...`}
            </option>
          ))
        )}
      </select>
    </div>
  )
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
  // New device selection props
  devices = { cameras: [], microphones: [] },
  selectedCamera,
  selectedMicrophone,
  onCameraChange,
  onMicrophoneChange,
  onEnumerateDevices,
}) {
  const mediaReady = mediaState === 'ready'
  const mediaFailed = mediaState === 'error'

  // Enumerate devices on mount
  useEffect(() => {
    if (onEnumerateDevices && devices.cameras.length === 0 && devices.microphones.length === 0) {
      onEnumerateDevices()
    }
  }, [onEnumerateDevices, devices])

  const checks = [
    {
      label: 'Secure connection',
      detail: 'Camera access requires HTTPS or localhost.',
      state: isSecure ? 'ok' : 'fail',
    },
    {
      label: 'Browser media support',
      detail: 'Your browser must support getUserMedia.',
      state: supportsMedia ? 'ok' : 'fail',
    },
    {
      label: 'Camera & microphone',
      detail: mediaReady
        ? 'Both are active — check the preview on the right.'
        : mediaFailed
          ? mediaError
          : mediaState === 'requesting'
            ? 'Requesting access...'
            : 'Will be requested now.',
      state: mediaReady ? 'ok' : mediaFailed ? 'fail' : mediaState === 'requesting' ? 'loading' : 'pending',
    },
  ]

  return (
    <InterviewShell
      headerRight={
        <button
          onClick={onBack}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          ← Back
        </button>
      }
    >
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-8 py-7 border-b border-surface-100">
          <h1 className="text-xl font-bold text-surface-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Device Check
          </h1>
          <p className="text-surface-500 text-sm">
            We need your camera and microphone for the interview. Select your preferred devices below.
          </p>
        </div>

        <div className="px-8 py-6 grid md:grid-cols-2 gap-6">
          {/* Left column - Checklist and Device Selection */}
          <div className="space-y-4">
            {/* Checklist */}
            <div className="bg-surface-50 rounded-xl px-5 py-2 border border-surface-200">
              {checks.map((c) => (
                <CheckItem key={c.label} {...c} />
              ))}
            </div>

            {/* Device Selection */}
            <div className="bg-surface-50 rounded-xl p-4 border border-surface-200 space-y-4">
              <h3 className="text-sm font-semibold text-surface-900">Device Selection</h3>
              
              <DeviceSelector
                label="Camera"
                devices={devices.cameras}
                selectedDevice={selectedCamera}
                onDeviceChange={onCameraChange}
                disabled={mediaState === 'requesting'}
              />
              
              <DeviceSelector
                label="Microphone"
                devices={devices.microphones}
                selectedDevice={selectedMicrophone}
                onDeviceChange={onMicrophoneChange}
                disabled={mediaState === 'requesting'}
              />
              
              {(devices.cameras.length === 0 || devices.microphones.length === 0) && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  📋 Device labels appear after granting camera/microphone permission
                </p>
              )}
            </div>
          </div>

          {/* Right column - Preview */}
          <div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-surface-200 shadow-card aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!mediaReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
                  <div className="text-center text-white/80">
                    <div className="text-3xl mb-2">{mediaFailed ? '🚫' : '📷'}</div>
                    <p className="text-xs">{mediaFailed ? 'Camera unavailable' : 'Waiting for camera...'}</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-surface-400 text-[11px] mt-2 text-center">
              This preview is only visible to you.
            </p>
          </div>
        </div>

        <div className="px-8 pb-7 flex gap-3">
          {mediaFailed && (
            <button
              onClick={onRetry}
              className="px-5 py-3 bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-medium rounded-xl transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={!mediaReady || isBusy}
            className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-primary-600/25"
          >
            {isBusy ? 'Working...' : 'Continue →'}
          </button>
        </div>
      </div>
    </InterviewShell>
  )
}
