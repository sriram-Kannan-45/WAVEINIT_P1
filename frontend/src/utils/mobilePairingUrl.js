/**
 * Mobile pairing URL helpers.
 * Builds the HTTPS URL a phone opens after scanning an interview QR code.
 *
 * Requirements:
 *  - Mobile camera access REQUIRES a secure context (HTTPS).
 *  - The QR URL generated MUST always start with https://.
 *  - Uses window.location.origin (e.g. "https://192.168.0.102:5174") as the default base.
 *  - Can be overridden via VITE_PUBLIC_URL or VITE_PUBLIC_HOST / VITE_PUBLIC_PORT environment variables.
 */

function getViteEnv(name) {
  return import.meta.env[name]
}

function normalizeHostname(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h.replace(/^\[|\]$/g, '') // strip IPv6 brackets
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === ''
  )
}

/**
 * Resolve the base origin used for the mobile pairing QR.
 * e.g. "https://192.168.0.102:5174"
 */
export function getMobilePairingBaseUrl() {
  if (typeof window === 'undefined') return ''

  // Custom full URL override if explicitly defined
  const custom = getViteEnv('VITE_PUBLIC_URL')
  if (custom) return custom.replace(/\/+$/, '')

  const location = window.location
  const hostname = normalizeHostname(location.hostname)

  // Enforce HTTPS protocol for mobile media context
  let protocol = getViteEnv('VITE_PUBLIC_PROTOCOL') || 'https'
  if (location.protocol === 'https:') {
    protocol = 'https'
  }

  let host = hostname
  if (isLocalHostname(hostname)) {
    host = getViteEnv('VITE_PUBLIC_HOST') || hostname
  }

  const port = getViteEnv('VITE_PUBLIC_PORT') || location.port || '5174'
  const defaultPort = (protocol === 'https' && port === '443') || (protocol === 'http' && port === '80')
  const origin = `${protocol}://${host}${defaultPort ? '' : `:${port}`}`

  return origin
}

/**
 * Build the full mobile pairing page URL from shortUrl or token.
 * Output format: "https://192.168.0.102:5174/interview/mobile/<token>"
 */
export function buildMobilePairingUrl(shortUrl) {
  if (!shortUrl) return null
  if (/^https?:\/\//i.test(shortUrl)) {
    // If backend returns an http:// URL, rewrite scheme to https:// for secure context
    return shortUrl.replace(/^http:\/\//i, 'https://')
  }
  const base = getMobilePairingBaseUrl()
  const path = shortUrl.startsWith('/') ? shortUrl : `/${shortUrl}`
  return `${base}${path}`
}

/**
 * True when the current page is a browser secure context (HTTPS or localhost).
 */
export function isSecureContextForMedia() {
  if (typeof window === 'undefined') return false
  return window.isSecureContext === true
}
