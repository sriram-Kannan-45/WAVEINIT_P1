import { useCallback, useEffect, useRef, useState } from 'react';

export default function useScreenShare({ onStop, onDenied, onInvalidShare } = {}) {
  const [stream, setStream] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState(null);
  const onStopRef = useRef(onStop);
  const onDeniedRef = useRef(onDenied);
  const onInvalidShareRef = useRef(onInvalidShare);
  const trackRef = useRef(null);

  useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  useEffect(() => { onDeniedRef.current = onDenied; }, [onDenied]);
  useEffect(() => { onInvalidShareRef.current = onInvalidShare; }, [onInvalidShare]);

  const request = useCallback(async () => {
    setError(null);
    console.log('[useScreenShare] Requesting display media...');
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const e = new Error('Screen sharing is not supported in this browser');
      setError(e); onDeniedRef.current?.(e);
      return null;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      const track = s.getVideoTracks()[0];
      if (!track) {
        s.getTracks().forEach(t => t.stop());
        const e = new Error('No video track available');
        setError(e); onDeniedRef.current?.(e);
        return null;
      }

      trackRef.current = track;

      let surface = track?.getSettings?.().displaySurface;
      if (surface && surface === 'browser') {
        s.getTracks().forEach(t => t.stop());
        const e = new Error('Please share your entire screen or an application window, not a browser tab.');
        setError(e);
        onInvalidShareRef.current?.(e);
        return null;
      }

      await new Promise((resolve) => {
        if (track.readyState === 'live' && !track.muted) {
          resolve();
        } else {
          const onUnmute = () => {
            if (track.readyState === 'live') {
              track.removeEventListener('unmute', onUnmute);
              resolve();
            }
          };
          track.addEventListener('unmute', onUnmute);
          setTimeout(resolve, 1000);
        }
      });

      setStream(s);
      setIsSharing(true);
      console.log('[useScreenShare] Stream acquired and active, surface:', surface || 'unknown');

      const handleEnded = () => {
        console.log('[useScreenShare] Track ended by user/browser');
        setIsSharing(false);
        setStream(null);
        onStopRef.current?.();
      };

      const handleMute = () => {
        console.log('[useScreenShare] Track muted');
      };

      const handleUnmute = () => {
        console.log('[useScreenShare] Track unmuted');
      };

      track.addEventListener('ended', handleEnded);
      track.addEventListener('mute', handleMute);
      track.addEventListener('unmute', handleUnmute);

      const cleanup = () => {
        track.removeEventListener('ended', handleEnded);
        track.removeEventListener('mute', handleMute);
        track.removeEventListener('unmute', handleUnmute);
      };

      const origStop = track.stop.bind(track);
      track.stop = function() {
        cleanup();
        origStop();
      };

      return s;
    } catch (err) {
      console.error('[useScreenShare] getDisplayMedia failed:', err);
      setError(err);
      onDeniedRef.current?.(err);
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    const track = trackRef.current;
    if (track) {
      track.stop();
    }
    setStream(null);
    setIsSharing(false);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    return () => {
      if (track && track.readyState === 'live') {
        track.stop();
      }
    };
  }, []);

  return { stream, isSharing, request, stop, error };
}
