/**
 * useAntiCheat — global event blockers for the duration of an exam.
 */
import { useEffect } from 'react';

const DEVTOOLS_KEYS = [
  // F12
  { match: e => e.key === 'F12' || e.code === 'F12' },
  // Ctrl+Shift+I/J/C/U
  { match: e => e.ctrlKey && e.shiftKey && /^[ijcu]$/i.test(e.key) },
];

const BLOCKED_KEYS = [
  // Refresh (F5, Ctrl+R)
  { match: e => e.key === 'F5' || e.code === 'F5' },
  { match: e => e.ctrlKey && /^r$/i.test(e.key) },
  // New tab / window / close
  { match: e => e.ctrlKey && /^[twn]$/i.test(e.key) },
  // Print / Save / Find
  { match: e => e.ctrlKey && /^[psaf]$/i.test(e.key) },
  // Alt-Tab — best-effort
  { match: e => e.altKey && (e.key === 'Tab' || e.code === 'Tab') },
  // Zoom (Ctrl+=, Ctrl+-, Ctrl+0, Ctrl++)
  { match: e => e.ctrlKey && /^[0=\-+]$/.test(e.key) },
];

export default function useAntiCheat({ enabled = true, onViolation } = {}) {
  useEffect(() => {
    if (!enabled) return;

    const onContext = (e) => {
      e.preventDefault();
      onViolation?.('RIGHT_CLICK', 'Right Click is disabled during assessment.');
    };

    const onCopy = (e) => { e.preventDefault(); onViolation?.('COPY_ATTEMPT', 'Copy is disabled during the assessment.'); };
    const onPaste = (e) => { e.preventDefault(); onViolation?.('PASTE_ATTEMPT', 'Paste is disabled during the assessment.'); };
    const onCut = (e) => { e.preventDefault(); onViolation?.('COPY_ATTEMPT', 'Cut is disabled during the assessment.'); };

    const onSelectStart = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return; // allow candidate to select text inside textareas/inputs
      }
      e.preventDefault();
    };

    const onKeyDown = (e) => {
      // DevTools
      for (const rule of DEVTOOLS_KEYS) {
        if (rule.match(e)) {
          e.preventDefault();
          e.stopPropagation();
          onViolation?.('DEVTOOLS_OPENED', 'Developer Tools are not allowed.');
          return;
        }
      }

      // PrintScreen Screenshot
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        onViolation?.('SCREENSHOT_ATTEMPT', 'Screenshot capture is prohibited during the assessment.');
        return;
      }

      // Other Blocked Shortcuts
      for (const rule of BLOCKED_KEYS) {
        if (rule.match(e)) {
          e.preventDefault();
          e.stopPropagation();
          onViolation?.('BLOCKED_SHORTCUT', `Shortcut Ctrl+${e.key.toUpperCase()} is disabled during the assessment.`);
          return;
        }
      }
    };

    const onKeyUp = (e) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        onViolation?.('SCREENSHOT_ATTEMPT', 'Screenshot capture is prohibited during the assessment.');
      }
    };

    const onBeforeUnload = (e) => {
      onViolation?.('REFRESH_ATTEMPT', 'Refreshing is disabled during the assessment.');
      e.preventDefault();
      e.returnValue = ''; // shows a generic browser warning
      return '';
    };

    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // block Ctrl+Scroll zoom
      }
    };

    // DevTools detection (heuristic — gap between outer and inner sizes)
    let devtoolsOpen = false;
    const dtCheck = () => {
      const widthGap = window.outerWidth - window.innerWidth;
      const heightGap = window.outerHeight - window.innerHeight;
      const open = widthGap > 160 || heightGap > 160;
      if (open && !devtoolsOpen) {
        devtoolsOpen = true;
        onViolation?.('DEVTOOLS_OPENED', 'Developer Tools are not allowed.');
      } else if (!open) {
        devtoolsOpen = false;
      }
    };
    const dtTimer = setInterval(dtCheck, 2000);

    const preventDefaultEvent = (e) => e.preventDefault();

    document.addEventListener('contextmenu', onContext, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('selectstart', onSelectStart, true);
    document.addEventListener('dragstart', preventDefaultEvent, true);
    document.addEventListener('drop', preventDefaultEvent, true);
    document.addEventListener('dragover', preventDefaultEvent, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      clearInterval(dtTimer);
      document.removeEventListener('contextmenu', onContext, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('selectstart', onSelectStart, true);
      document.removeEventListener('dragstart', preventDefaultEvent, true);
      document.removeEventListener('drop', preventDefaultEvent, true);
      document.removeEventListener('dragover', preventDefaultEvent, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('wheel', onWheel);
    };
  }, [enabled, onViolation]);
}
