import { useRef, useCallback, useEffect } from 'react';
import { useProctor } from '../ProctorContext';

const FACE_CHECK_INTERVAL_MS = 2800;
const FACE_ABSENT_THRESHOLD = 3;
const FACE_MULTIPLE_THRESHOLD = 2;

export default function useFaceDetection({ enabled = true, stream, videoRef }) {
  const proctor = useProctor();
  const faceAbsentCountRef = useRef(0);
  const faceMultipleCountRef = useRef(0);
  const earbudCountRef = useRef(0);
  const phoneCountRef = useRef(0);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const canvasRef = useRef(null);
  const lastFaceCountRef = useRef(0);

  const initDetector = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current;
    try {
      if ('FaceDetector' in window) {
        const detector = new window.FaceDetector({
          maxDetectedFaces: 5,
          fastMode: true,
        });
        detectorRef.current = detector;
        return detector;
      }
    } catch (e) {
      console.warn('[FaceDetection] FaceDetector API not available:', e.message);
    }
    return null;
  }, []);

  const inspectFrame = useCallback(async () => {
    if (!stream || !stream.active) return { faceCount: 0, hasEarbuds: false, hasPhone: false };

    const video = videoRef?.current;
    if (!video || video.paused || video.ended || video.readyState < 2) {
      return { faceCount: lastFaceCountRef.current, hasEarbuds: false, hasPhone: false };
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { faceCount: 1, hasEarbuds: false, hasPhone: false };

    ctx.drawImage(video, 0, 0, 320, 240);
    const imgData = ctx.getImageData(0, 0, 320, 240);
    const data = imgData.data;

    let faceCount = 0;
    const detector = await initDetector();
    if (detector) {
      try {
        const faces = await detector.detect(video);
        faceCount = faces.length;
      } catch (_) {}
    }

    // Biometric skin fallback
    if (detector === null || faceCount === 0) {
      let headSkin = 0;
      for (let y = 20; y <= 100; y += 4) {
        for (let x = 110; x <= 210; x += 4) {
          const idx = (y * 320 + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          if (luma >= 42 && luma <= 235 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g) {
            headSkin++;
          }
        }
      }
      if (headSkin >= 60) faceCount = 1;
    }

    // Earbud / Audio Device check (Ear canal contrast)
    let earDarkLeft = 0, earDarkRight = 0;
    for (let y = 45; y <= 85; y += 4) {
      for (let x = 85; x <= 125; x += 4) {
        const idx = (y * 320 + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (luma < 35) earDarkLeft++;
      }
      for (let x = 195; x <= 235; x += 4) {
        const idx = (y * 320 + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (luma < 35) earDarkRight++;
      }
    }
    const hasEarbuds = earDarkLeft >= 8 || earDarkRight >= 8;

    // Mobile Phone / Screen check in lower area
    let chestGlare = 0;
    for (let y = 170; y <= 235; y += 4) {
      for (let x = 100; x <= 220; x += 4) {
        const idx = (y * 320 + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma > 180 && b > r + 15 && b > g) {
          chestGlare++;
        }
      }
    }
    const hasPhone = chestGlare >= 18;

    lastFaceCountRef.current = faceCount;
    return { faceCount, hasEarbuds, hasPhone };
  }, [stream, videoRef, initDetector]);

  const checkFrame = useCallback(async () => {
    if (!enabled || !stream || !proctor?.isActive) return;

    const { faceCount, hasEarbuds, hasPhone } = await inspectFrame();

    // 1. Face Absence / Multi-face
    if (faceCount === 0) {
      faceAbsentCountRef.current++;
      faceMultipleCountRef.current = 0;

      if (faceAbsentCountRef.current >= FACE_ABSENT_THRESHOLD) {
        proctor.report('FACE_ABSENT', 'No candidate face detected in camera view');
        faceAbsentCountRef.current = 0;
      }
    } else if (faceCount >= FACE_MULTIPLE_THRESHOLD) {
      faceMultipleCountRef.current++;
      faceAbsentCountRef.current = 0;

      if (faceMultipleCountRef.current >= 2) {
        proctor.report('FACE_MULTIPLE', `Multiple faces detected (${faceCount} people present)`);
        faceMultipleCountRef.current = 0;
      }
    } else {
      faceAbsentCountRef.current = Math.max(0, faceAbsentCountRef.current - 1);
      faceMultipleCountRef.current = Math.max(0, faceMultipleCountRef.current - 1);
    }

    // 2. Earbuds / In-ear Audio Device
    if (hasEarbuds) {
      earbudCountRef.current++;
      if (earbudCountRef.current === 2) {
        proctor.report('AUDIO_DEVICE_DETECTED', 'Unauthorized in-ear audio device / earbud detected');
      }
    } else {
      earbudCountRef.current = Math.max(0, earbudCountRef.current - 1);
    }

    // 3. Mobile Phone in Frame
    if (hasPhone) {
      phoneCountRef.current++;
      if (phoneCountRef.current === 2) {
        proctor.report('CELL_PHONE_DETECTED', 'Unauthorized mobile phone / screen detected in frame');
      }
    } else {
      phoneCountRef.current = Math.max(0, phoneCountRef.current - 1);
    }
  }, [enabled, stream, proctor, inspectFrame]);

  useEffect(() => {
    if (!enabled || !stream) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    initDetector();
    intervalRef.current = setInterval(checkFrame, FACE_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, stream, checkFrame, initDetector]);

  return {
    faceCount: lastFaceCountRef.current,
  };
}
