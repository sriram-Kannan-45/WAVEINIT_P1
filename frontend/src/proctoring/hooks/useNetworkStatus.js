/**
 * useNetworkStatus — online/offline detection with ping fallback so
 * we catch flaky networks where `navigator.onLine` lies.
 */
import { useEffect, useState } from 'react';

export default function useNetworkStatus({ pingUrl = '/health', interval = 15_000 } = {}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onUp = () => setIsOnline(true);
    const onDown = () => setIsOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);

    let cancelled = false;
    const ping = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(pingUrl, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (!cancelled) setIsOnline(res.ok);
      } catch {
        if (!cancelled) setIsOnline(false);
      }
    };
    ping();
    const id = setInterval(ping, interval);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, [pingUrl, interval]);

  return isOnline;
}
