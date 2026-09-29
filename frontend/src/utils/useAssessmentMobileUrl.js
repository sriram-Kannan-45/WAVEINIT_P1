import { useEffect, useState } from 'react';
import { buildAssessmentMobileUrl } from './assessmentPairingUrl';

const isLocalBrowser = () => typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function useAssessmentMobileUrl(shortUrl) {
  const needsLanLookup = import.meta.env.DEV && isLocalBrowser() &&
    !import.meta.env.VITE_PUBLIC_URL;
  const [lanOrigin, setLanOrigin] = useState(null);

  useEffect(() => {
    if (!needsLanLookup) return undefined;
    const controller = new AbortController();
    const refresh = () => fetch('/__local-lan-origin', { cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('LAN address unavailable');
        return response.json();
      })
      .then(data => setLanOrigin(data.origin || null))
      .catch(() => { if (!controller.signal.aborted) setLanOrigin(null); });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [needsLanLookup, shortUrl]);

  // Never display a QR with an old configured IP while the live address loads.
  if (needsLanLookup && !lanOrigin) return null;
  return buildAssessmentMobileUrl(shortUrl, lanOrigin);
}
