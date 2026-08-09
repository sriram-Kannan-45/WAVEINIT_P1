/**
 * Mobile pairing URL helpers.
 * Builds the URL a phone opens after scanning an interview QR code.
 *
 * The QR must point at a URL the PHONE can reach. When the laptop opens the
 * room at localhost (or 127.0.0.1), the host is not usable from the phone, so
 * we substitute VITE_PUBLIC_HOST / VITE_PUBLIC_PORT / VITE_PUBLIC_PROTOCOL
 * (the machine's LAN address). Set VITE_PUBLIC_URL for a fully custom URL.
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
 * e.g. "https://192.168.1.100:5174"
 */
export function getMobilePairingBaseUrl() {
  if (typeof window === 'undefined') return ''

  const custom = getViteEnv('VITE_PUBLIC_URL')
  if (custom) return custom.replace(/\/+$/, '')

  const location = window.location
  const hostname = normalizeHostname(location.hostname)

  const protocol = getViteEnv('VITE_PUBLIC_PROTOCOL') || location.protocol.replace(':', '')
  let host = hostname

  if (isLocalHostname(hostname)) {
    host = getViteEnv('VITE_PUBLIC_HOST') || hostname
    if (host === hostname) {
      // Opened on localhost with no LAN host configured — the phone can't
      // reach this machine via localhost. Still build a valid-looking URL so
      // the QR renders; the caller can warn the user.
    }
  }

  const port =
    getViteEnv('VITE_PUBLIC_PORT') || location.port || (protocol === 'https' ? '443' : '80')

  const defaultPort = (protocol === 'https' && port === '443') || (protocol === 'http' && port === '80')
  const origin = `${protocol}://${host}${defaultPort ? '' : `:${port}`}`

  return origin
}

/**
 * Build the full mobile pairing page URL from the backend's shortUrl.
 */
export function buildMobilePairingUrl(shortUrl) {
  if (!shortUrl) return null
  if (/^https?:\/\//i.test(shortUrl)) return shortUrl
  return `${getMobilePairingBaseUrl()}${shortUrl.startsWith('/') ? shortUrl : `/${shortUrl}`}`
}

/**
 * True when the current page is a browser secure context (HTTPS or localhost),
 * which is required for getUserMedia camera access.
 */
export function isSecureContextForMedia() {
  if (typeof window === 'undefined') return false
  return window.isSecureContext === true
}
