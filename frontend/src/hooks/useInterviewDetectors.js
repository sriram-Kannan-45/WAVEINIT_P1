/**
 * useInterviewDetectors Hook
 * Client-side AI monitoring detectors for interviews.
 * Performs real-time frame inspection for:
 *   - Tab switches / blur / copy-paste
 *   - Face absence & Multiple faces
 *   - In-Ear Audio Device / Earbud detection
 *   - Mobile Phone in view
 *   - Camera track lifecycle
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE } from '../api/api';
import yoloProctoringService from '../services/yoloProctoringService';

export class AIMonitorProvider {
  async analyzeFrame(_frameData) {
    return [];
  }
}

export function useInterviewDetectors({
  socket,
  sessionId,
  interviewId,
  enabled = true,
  mediaStream = null,
}) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const [aiStatus, setAiStatus] = useState({
    faceDetected: true,
    audioDeviceDetected: false,
    phoneDetected: false,
    yoloEvent: 'PERSON_DETECTED',
    yoloConfidence: 1.0,
    cameraStatus: 'Monitoring',
    lastCheck: Date.now(),
  });

  const detectorRef = useRef(null);
  const faceAbsentCountRef = useRef(0);
  const audioDeviceCountRef = useRef(0);
  const phoneCountRef = useRef(0);
  const frameCanvasRef = useRef(null);
  const videoElementRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'FaceDetector' in window && !detectorRef.current) {
      try {
        detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
      } catch (_) {}
    }
  }, []);

  const emitAlert = useCallback(
    (alertType, severity, sourceDevice, message, metadata) => {
      if (!socket || !sessionId || !enabledRef.current) return;
      socket.emit('interview-alert', {
        sessionId,
        interviewId,
        alertType,
        severity,
        sourceDevice,
        message,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      });
    },
    [socket, sessionId, interviewId]
  );

  // 1. Browser Event Listeners (Tab switch, Blur, Copy-Paste)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        emitAlert('TAB_SWITCH', 'HIGH', 'LAPTOP', 'Candidate switched browser tab', {
          hidden: document.hidden,
        });
      }
    };

    const handleBlur = () => {
      emitAlert('TAB_BLUR', 'MEDIUM', 'LAPTOP', 'Interview window lost focus', {
        url: window.location.href,
      });
    };

    const handleCopy = () => {
      emitAlert('COPY_PASTE', 'MEDIUM', 'LAPTOP', 'Copy action detected', {
        type: 'copy',
      });
    };

    const handlePaste = () => {
      emitAlert('COPY_PASTE', 'MEDIUM', 'LAPTOP', 'Paste action detected', {
        type: 'paste',
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [enabled, emitAlert]);

  // 2. Shared YOLOv8 Live Proctoring Stream Loop
  useEffect(() => {
    if (!enabled || !mediaStream || !socket || !sessionId) return;

    const monitorId = yoloProctoringService.startMonitoring({
      source: mediaStream,
      socket,
      sessionId,
      participantId: 1,
      moduleType: 'INTERVIEW',
      cameraSource: 'PC_CAMERA',
      interviewId,
      fps: 5,
      onDetection: ({ event }) => {
        if (event) {
          setAiStatus((prev) => ({
            ...prev,
            yoloEvent: event.eventType,
            yoloConfidence: event.confidence,
            faceDetected: event.eventType !== 'NO_PERSON_DETECTED',
            phoneDetected: event.eventType === 'PHONE_DETECTED',
            lastCheck: Date.now(),
          }));
        }
      },
      onStatusChange: ({ status }) => {
        setAiStatus((prev) => ({
          ...prev,
          cameraStatus: status,
        }));
      },
    });

    return () => {
      yoloProctoringService.stopMonitoring(monitorId);
    };
  }, [enabled, mediaStream, socket, sessionId, interviewId]);

  // 3. Detect Camera Disabled / Track Ended
  const monitorTrack = useCallback(
    (track, deviceType = 'LAPTOP') => {
      if (!track) return;
      const handleEnded = () => {
        if (track.readyState === 'ended') {
          emitAlert('CAMERA_DISABLED', 'HIGH', deviceType, `${deviceType} camera track ended`, {
            kind: track.kind,
          });
        }
      };
      track.addEventListener('ended', handleEnded);
      return () => track.removeEventListener('ended', handleEnded);
    },
    [emitAlert]
  );

  return { emitAlert, monitorTrack, AIMonitorProvider, aiStatus };
}

export default useInterviewDetectors;
