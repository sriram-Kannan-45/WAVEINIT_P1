/**
 * useYOLOProctoring Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook to effortlessly attach live YOLO proctoring to any camera stream
 * (PC or Mobile) for Quiz, Coding, and Interview modules.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import yoloProctoringService from '../../services/yoloProctoringService';

export function useYOLOProctoring({
  source,
  socket,
  sessionId,
  participantId,
  moduleType = 'QUIZ',
  cameraSource = 'PC_CAMERA',
  fps = 5,
  enabled = true,
  quizId = null,
  assessmentId = null,
  interviewId = null,
}) {
  const [detectionState, setDetectionState] = useState({
    eventType: 'PERSON_DETECTED',
    severity: 'INFO',
    confidence: 1.0,
    detectedClasses: ['person'],
    lastCheckTime: null,
    cameraStatus: 'Monitoring',
    isCameraActive: true,
  });

  const monitorIdRef = useRef(null);

  useEffect(() => {
    if (!enabled || !source || !sessionId || !socket) {
      if (monitorIdRef.current) {
        yoloProctoringService.stopMonitoring(monitorIdRef.current);
        monitorIdRef.current = null;
      }
      return;
    }

    const monitorId = yoloProctoringService.startMonitoring({
      source,
      socket,
      sessionId,
      participantId,
      moduleType,
      cameraSource,
      fps,
      quizId,
      assessmentId,
      interviewId,
      onDetection: ({ event, detections, timestamp }) => {
        if (event) {
          setDetectionState((prev) => ({
            ...prev,
            eventType: event.eventType,
            severity: event.severity,
            confidence: event.confidence,
            detectedClasses: event.detectedClasses || [],
            lastCheckTime: timestamp,
          }));
        }
      },
      onStatusChange: ({ status, active }) => {
        setDetectionState((prev) => ({
          ...prev,
          cameraStatus: status,
          isCameraActive: active,
        }));
      },
    });

    monitorIdRef.current = monitorId;

    return () => {
      if (monitorIdRef.current) {
        yoloProctoringService.stopMonitoring(monitorIdRef.current);
        monitorIdRef.current = null;
      }
    };
  }, [
    source,
    socket,
    sessionId,
    participantId,
    moduleType,
    cameraSource,
    fps,
    enabled,
    quizId,
    assessmentId,
    interviewId,
  ]);

  return detectionState;
}

export default useYOLOProctoring;
