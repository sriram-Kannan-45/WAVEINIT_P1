/**
 * useInterviewDetectors Hook
 * Client-side AI monitoring detectors for interviews.
 * Emits interview-alert socket events for deterministic detections.
 * ML-based detectors are stubbed (provider interface ready).
 */

import { useEffect, useRef, useCallback } from 'react'

/**
 * AIMonitorProvider interface — for future ML model integration.
 * Real implementations (TensorFlow.js, MediaPipe) plug in here.
 */
export class AIMonitorProvider {
  async analyzeFrame(_frameData) {
    // Override in real implementation
    return [] // AlertPayload[]
  }
}

/**
 * Tab/copy-paste/window-blur detectors — fully implemented, no ML needed.
 */
export function useInterviewDetectors({ socket, sessionId, interviewId, enabled = true }) {
  const emitAlert = useCallback((alertType, severity, sourceDevice, message, metadata) => {
    if (!socket || !sessionId || !enabled) return
    socket.emit('interview-alert', {
      sessionId,
      interviewId,
      alertType,
      severity,
      sourceDevice,
      message,
      metadata,
    })
  }, [socket, sessionId, interviewId, enabled])

  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        emitAlert('TAB_SWITCH', 'HIGH', 'LAPTOP', 'Candidate switched tabs', {
          hidden: document.hidden,
        })
      }
    }

    const handleBlur = () => {
      emitAlert('TAB_BLUR', 'MEDIUM', 'LAPTOP', 'Candidate window lost focus', {
        url: window.location.href,
      })
    }

    const handleCopy = (e) => {
      emitAlert('COPY_PASTE', 'MEDIUM', 'LAPTOP', 'Copy action detected', {
        type: 'copy',
      })
    }

    const handlePaste = (e) => {
      emitAlert('COPY_PASTE', 'MEDIUM', 'LAPTOP', 'Paste action detected', {
        type: 'paste',
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
    }
  }, [enabled, emitAlert])

  /**
   * Detect camera disabled mid-interview.
   */
  const monitorTrack = useCallback((track, deviceType = 'LAPTOP') => {
    if (!track) return
    const handleEnded = () => {
      if (track.readyState === 'ended') {
        emitAlert('CAMERA_DISABLED', 'HIGH', deviceType, `${deviceType} camera track ended`, {
          kind: track.kind,
        })
      }
    }
    track.addEventListener('ended', handleEnded)
    return () => track.removeEventListener('ended', handleEnded)
  }, [emitAlert])

  return { emitAlert, monitorTrack, AIMonitorProvider }
}

export default useInterviewDetectors
