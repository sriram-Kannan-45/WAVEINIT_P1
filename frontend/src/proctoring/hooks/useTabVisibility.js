/**
 * useTabVisibility — fires onHidden / onShown when the document
 * visibility changes (tab switch, browser minimize, OS lock).
 *
 * Also listens to `blur` so window-switch (Alt-Tab) is caught even
 * before the document hidden event fires.
 */
import { useEffect } from 'react';

export default function useTabVisibility({ onHidden, onShown, onBlur, onFocus, enabled = true }) {
  useEffect(() => {
    if (!enabled) return;
    const visHandler = () => {
      if (document.hidden) onHidden?.();
      else onShown?.();
    };
    const blurHandler = () => onBlur?.();
    const focusHandler = () => onFocus?.();

    document.addEventListener('visibilitychange', visHandler);
    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
    return () => {
      document.removeEventListener('visibilitychange', visHandler);
      window.removeEventListener('blur', blurHandler);
      window.removeEventListener('focus', focusHandler);
    };
  }, [enabled, onHidden, onShown, onBlur, onFocus]);
}
