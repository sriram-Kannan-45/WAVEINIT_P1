/**
 * useFullscreen — request, monitor, and report fullscreen state.
 *
 *   const { isFullscreen, request, exit, exitsCount } = useFullscreen({
 *     onExit: () => violation('FULLSCREEN_EXIT'),
 *   });
 */
import { useCallback, useEffect, useRef, useState } from 'react';

function getFsElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

async function requestFs(target = document.documentElement) {
  if (target.requestFullscreen) return target.requestFullscreen();
  if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
  if (target.mozRequestFullScreen) return target.mozRequestFullScreen();
  if (target.msRequestFullscreen) return target.msRequestFullscreen();
  throw new Error('Fullscreen API unsupported');
}

async function exitFs() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

export default function useFullscreen({ onEnter, onExit, enabled = true } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(!!getFsElement());
  const [exitsCount, setExitsCount] = useState(0);
  const wasFs = useRef(isFullscreen);

  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      const fs = !!getFsElement();
      setIsFullscreen(fs);
      if (wasFs.current && !fs) {
        setExitsCount(c => c + 1);
        onExit?.();
      } else if (!wasFs.current && fs) {
        onEnter?.();
      }
      wasFs.current = fs;
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    document.addEventListener('mozfullscreenchange', handler);
    document.addEventListener('MSFullscreenChange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
      document.removeEventListener('mozfullscreenchange', handler);
      document.removeEventListener('MSFullscreenChange', handler);
    };
  }, [enabled, onEnter, onExit]);

  const request = useCallback(async () => {
    try { await requestFs(); return true; } catch { return false; }
  }, []);

  const exit = useCallback(async () => {
    try { await exitFs(); } catch { /* swallow */ }
  }, []);

  return { isFullscreen, request, exit, exitsCount };
}
