import { useEffect, useState, useRef, useCallback } from 'react';
import { useProctor } from '../ProctorContext';
import useFaceDetection from './useFaceDetection';

const AUDIO_CHECK_INTERVAL_MS = 3000;
const CAMERA_CHECK_INTERVAL_MS = 4000;
const MIC_CHECK_INTERVAL_MS = 3000;

export default function useProctoringMedia({ enabled = true, onAiAlert } = {}) {
  const proctor = useProctor();
  const stream = proctor.proctorStream;
  const setStream = proctor.setProctorStream;
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const talkHistoryRef = useRef([]);
  const micSilentCountRef = useRef(0);
  const cameraOffCountRef = useRef(0);
  const micMutedCountRef = useRef(0);

  const { faceCount } = useFaceDetection({
    enabled: enabled && !!stream,
    stream,
    videoRef,
  });

  const request = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      setStream(mediaStream);
      proctor.setCameraGranted(true);
      proctor.setMicGranted(true);
      return mediaStream;
    } catch (err) {
      let friendlyError = 'Camera/Microphone permission denied or hardware unavailable.';
      if (err.name === 'NotAllowedError') {
        friendlyError = 'Permission was previously denied. Please update your browser site settings to allow camera/microphone access.';
      }
      setError(friendlyError);
      proctor.setCameraGranted(false);
      proctor.setMicGranted(false);
      return null;
    }
  }, [proctor, setStream]);

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    proctor.setCameraGranted(false);
    proctor.setMicGranted(false);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [stream, proctor, setStream]);

  // Audio monitoring via Web Audio API
  useEffect(() => {
    if (!enabled || !stream) return;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      console.warn('[ProctoringMedia] AudioContext init failed:', e.message);
    }

    const audioInterval = setInterval(() => {
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      if (!analyser || !dataArray) return;

      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const history = talkHistoryRef.current;
      history.push(rms);
      if (history.length > 5) history.shift();

      micSilentCountRef.current = rms < 0.01 ? micSilentCountRef.current + 1 : 0;

      if (micSilentCountRef.current >= 4) {
        proctor.report('FACE_ABSENT', 'Microphone appears to be disabled or very quiet');
        onAiAlert?.('FACE_ABSENT');
        micSilentCountRef.current = 0;
      }
    }, AUDIO_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(audioInterval);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [enabled, stream, proctor, onAiAlert]);

  // Camera track monitoring — detect when camera is turned off
  useEffect(() => {
    if (!enabled || !stream) return;

    const cameraInterval = setInterval(() => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        cameraOffCountRef.current++;
        if (cameraOffCountRef.current >= 2) {
          proctor.report('CAMERA_OFF', 'Camera track is no longer available');
          onAiAlert?.('CAMERA_OFF');
          cameraOffCountRef.current = 0;
        }
        return;
      }
      cameraOffCountRef.current = 0;

      if (videoTrack.readyState === 'ended' || !videoTrack.enabled) {
        cameraOffCountRef.current++;
        if (cameraOffCountRef.current >= 2) {
          proctor.report('CAMERA_OFF', 'Camera was turned off during the assessment');
          onAiAlert?.('CAMERA_OFF');
          cameraOffCountRef.current = 0;
        }
      } else {
        cameraOffCountRef.current = Math.max(0, cameraOffCountRef.current - 1);
      }
    }, CAMERA_CHECK_INTERVAL_MS);

    return () => clearInterval(cameraInterval);
  }, [enabled, stream, proctor, onAiAlert]);

  // Microphone mute detection
  useEffect(() => {
    if (!enabled || !stream) return;

    const micInterval = setInterval(() => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        micMutedCountRef.current++;
        if (micMutedCountRef.current >= 2) {
          proctor.report('MIC_MUTED', 'Microphone track is no longer available');
          onAiAlert?.('MIC_MUTED');
          micMutedCountRef.current = 0;
        }
        return;
      }
      micMutedCountRef.current = 0;

      if (audioTrack.readyState === 'ended' || !audioTrack.enabled) {
        micMutedCountRef.current++;
        if (micMutedCountRef.current >= 2) {
          proctor.report('MIC_MUTED', 'Microphone was muted during the assessment');
          onAiAlert?.('MIC_MUTED');
          micMutedCountRef.current = 0;
        }
      } else {
        micMutedCountRef.current = Math.max(0, micMutedCountRef.current - 1);
      }
    }, MIC_CHECK_INTERVAL_MS);

    return () => clearInterval(micInterval);
  }, [enabled, stream, proctor, onAiAlert]);

  return {
    stream,
    error,
    request,
    stop,
    cameraGranted: proctor.cameraGranted,
    micGranted: proctor.micGranted,
    faceCount,
    videoRef,
  };
}
