import { useCallback, useEffect, useRef, useState } from 'react';

export default function useAntiCheat({ attemptId, participantId, socket, enabled }) {
  const [warningMessage, setWarningMessage] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const warningTimerRef = useRef(null);
  const listenersAttachedRef = useRef(false);

  const showLocalWarning = useCallback((message, duration = 4000) => {
    setWarningMessage(message);
    setShowWarning(true);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => setShowWarning(false), duration);
  }, []);

  const emitViolation = useCallback((type) => {
    if (!socket || !attemptId || !participantId) return;

    const newCount = violationCount + 1;
    setViolationCount(newCount);

    socket.emit('violation', {
      attemptId,
      participantId,
      type,
      timestamp: new Date().toISOString(),
    });

    if (newCount >= 5) {
      socket.emit('auto-flag', {
        attemptId,
        participantId,
        reason: 'Too many violations',
      });
    }
  }, [socket, attemptId, participantId, violationCount]);

  useEffect(() => {
    if (!enabled || listenersAttachedRef.current) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        emitViolation('tab_switch');
        showLocalWarning('Warning: Switching tabs is not allowed!');
      }
    };

    const handleBlur = () => {
      emitViolation('window_blur');
      showLocalWarning('Warning: Please keep focus on the test window!');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        emitViolation('fullscreen_exit');
        showLocalWarning('Warning: Please return to fullscreen mode!');
        setTimeout(() => {
          document.documentElement.requestFullscreen().catch(() => {});
        }, 3000);
      }
    };

    const handleCopy = (e) => {
      e.preventDefault();
      emitViolation('copy_attempt');
    };

    const handlePaste = (e) => {
      e.preventDefault();
      emitViolation('paste_attempt');
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      emitViolation('right_click_attempt');
    };

    const handleKeyDown = (e) => {
      const blocked =
        (e.ctrlKey && ['c', 'v', 'u', 's', 'a'].includes(e.key.toLowerCase())) ||
        (e.altKey && e.key === 'Tab') ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i');

      if (blocked) {
        e.preventDefault();
        emitViolation('keyboard_shortcut_attempt');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    listenersAttachedRef.current = true;

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      listenersAttachedRef.current = false;
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [enabled, emitViolation, showLocalWarning]);

  return {
    warningMessage,
    showWarning,
    violationCount,
    emitViolation,
    showLocalWarning,
  };
}
