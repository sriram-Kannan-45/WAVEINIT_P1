/**
 * useInterviewDetectors Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side monitoring detectors for the Interview module.
 * Integrates with the unified MonitoringEngineClient (MediaPipe Laptop pipeline)
 * and emits structured alerts for:
 *   - Tab switches / blur / copy-paste
 *   - Face absence & Multiple faces (MediaPipe)
 *   - 3D Iris Gaze & Head Pose telemetry
 *   - Camera track lifecycle & disconnects
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE } from '../api/api';
import { getStoredToken } from '../services/auth';
import monitoringClient from '../proctoring/engine/MonitoringEngineClient';

export class AIMonitorProvider {
  async analyzeFrame(_frameData) {
    return [];
  }
}

export function useInterviewDetectors({
  socket,
  sessionId,
  monitoringSessionId,
  interviewId,
  participantId,
  startedAt, durationMinutes,
  enabled = true,
  mediaStream = null,
}) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const [aiStatus, setAiStatus] = useState({
    faceDetected: true,
    gaze: 'ON_SCREEN',
    headPose: { yaw: 0, pitch: 0, roll: 0 },
    cameraStatus: 'Monitoring',
    lastCheck: Date.now(),
  });

  const videoElementRef = useRef(null);

  const emitAlert = useCallback(
    (alertType, severity, sourceDevice, message, metadata) => {
      if (!socket || !sessionId || !enabledRef.current) return;

      // 1. Emit to interview room socket
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

      // 2. Report to unified monitoring engine API
      monitoringClient.reportEvent({
        source: sourceDevice === 'MOBILE' ? 'MOBILE' : 'LAPTOP',
        eventType: alertType,
        severity: severity || 'MEDIUM',
        durationMs: 1500,
        confidence: 0.9,
        metadata: { ...metadata, message },
      });
    },
    [socket, sessionId, interviewId]
  );

  // 1. Browser Event Listeners (Tab switch, Blur, Copy-Paste)
  useEffect(() => {
    if (!enabled) return;

    // Visibility and focus are handled once by MonitoringEngineClient's shared incident policy.
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

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [enabled, emitAlert]);

  // 2. Unified MediaPipe Laptop Monitoring Loop
  useEffect(() => {
    if (!enabled || !mediaStream || !monitoringSessionId) return;

    if (!videoElementRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      videoElementRef.current = video;
    }

    const videoEl = videoElementRef.current;
    videoEl.srcObject = mediaStream;
    videoEl.play().catch(() => {});

    monitoringClient.init({
      sessionId:monitoringSessionId,
      participantId, token: getStoredToken(), isTestActive: true, testStartedAt: startedAt, configuredDurationSeconds: Number(durationMinutes||60)*60,
      contextType: 'INTERVIEW',
      socket,
    });

    monitoringClient.startLaptopMonitoring(mediaStream, videoEl, (metrics) => {
      socket?.emit('interview:monitoring-status',{interviewId,sessionId,faceDetected:metrics.faceDetected===true,cameraActive:mediaStream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled)});
      setAiStatus((prev) => ({
        ...prev,
        faceDetected: metrics.faceDetected,
        gaze: metrics.gaze,
        headPose: metrics.headPose,
        cameraStatus: 'Monitoring',
        lastCheck: Date.now(),
      }));
    });

    return () => {
      monitoringClient.stopLaptopMonitoring({stopTracks:false});
    };
  }, [enabled, mediaStream, monitoringSessionId, participantId, socket]);

  // 3. Detect Camera Disabled / Track Ended
  const monitorTrack = useCallback(
    (track, deviceType = 'LAPTOP') => {
      if (!track) return;
      const handleEnded = () => {
        if (track.readyState === 'ended') {
          socket?.emit('interview:monitoring-status',{interviewId,sessionId,faceDetected:false,cameraActive:false});
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
