/**
 * deviceFingerprint.js
 * ─────────────────────────────────────────────────────────────────────────
 * Pure-JS, dependency-free device fingerprint generator. Builds a stable
 * identifier from a handful of browser-exposed properties, hashes them
 * with djb2, and returns the result as a hex string.
 *
 * NOT cryptographic. Do NOT use this for authentication or signing —
 * it's only meant to flag "this looks like a different device" for the
 * assessment-session-lock feature. A user-agent change, monitor swap,
 * or timezone change will deliberately produce a different hash.
 *
 * Exports:
 *   getDeviceFingerprint() → Promise<string>   16-hex-char fingerprint
 */

/** djb2 string hash → 32-bit unsigned, then to hex. */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  // Pad to 8 hex chars; combine with a length-mixed suffix for entropy.
  const a = hash.toString(16).padStart(8, '0');
  let secondary = 0;
  for (let i = str.length - 1; i >= 0; i -= 1) {
    secondary = ((secondary << 5) - secondary + str.charCodeAt(i)) >>> 0;
  }
  return a + secondary.toString(16).padStart(8, '0');
}

/** Best-effort access — never throws even on locked-down browsers. */
function safe(getter, fallback = '') {
  try {
    const v = getter();
    return v == null ? fallback : String(v);
  } catch {
    return fallback;
  }
}

export async function getDeviceFingerprint() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return djb2('ssr-no-window');
  }

  const parts = [
    safe(() => navigator.userAgent),
    safe(() => navigator.language),
    safe(() => Array.isArray(navigator.languages) ? navigator.languages.join(',') : ''),
    safe(() => `${screen?.width || 0}x${screen?.height || 0}@${screen?.colorDepth || 0}`),
    safe(() => `avail:${screen?.availWidth || 0}x${screen?.availHeight || 0}`),
    safe(() => `cores:${navigator.hardwareConcurrency || 0}`),
    safe(() => `mem:${navigator.deviceMemory || 0}`),
    safe(() => `platform:${navigator.platform || ''}`),
    safe(() => `tz:${Intl?.DateTimeFormat?.().resolvedOptions().timeZone || ''}`),
    safe(() => `tzo:${new Date().getTimezoneOffset()}`),
    safe(() => `cookies:${navigator.cookieEnabled ? 1 : 0}`),
    safe(() => `dnt:${navigator.doNotTrack || ''}`),
    safe(() => `pdf:${navigator.pdfViewerEnabled ? 1 : 0}`),
    safe(() => `dpr:${window.devicePixelRatio || 1}`),
  ];

  const raw = parts.join('|');
  return djb2(raw);
}

export default getDeviceFingerprint;
