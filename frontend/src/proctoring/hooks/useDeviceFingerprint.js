/**
 * useDeviceFingerprint — deterministic SHA-256 of UA + screen + tz +
 * canvas. Pure browser-side; no third-party dependency.
 *
 * NOT a security primitive on its own. The backend uses it together
 * with sessionToken to enforce single-device sessions; it just makes
 * accidental multi-tab use detectable.
 */
import { useEffect, useState } from 'react';

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function canvasFingerprint() {
  try {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 30;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('proctor:fp', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('proctor:fp', 4, 17);
    return c.toDataURL();
  } catch { return 'no-canvas'; }
}

async function compute() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory || 0,
    canvasFingerprint(),
  ].join('|');
  return sha256Hex(parts);
}

export default function useDeviceFingerprint() {
  const [fp, setFp] = useState(null);
  useEffect(() => {
    let alive = true;
    compute().then(v => { if (alive) setFp(v); });
    return () => { alive = false; };
  }, []);
  return fp;
}
