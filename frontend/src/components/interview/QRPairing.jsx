/**
 * QRPairing Component
 * Renders a real scannable QR code for mobile device pairing and handles
 * expiry countdown, refresh (with backend error surfacing), and status.
 */
import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { buildMobilePairingUrl } from '../../utils/mobilePairingUrl'

export default function QRPairing({ qrPayload, onRefresh, expiresAt, tokenStatus }) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)

  useEffect(() => {
    if (!expiresAt) return
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000))
      setTimeLeft(remaining)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  // Encode the full URL the phone browser will open after scanning.
  const pairUrl = buildMobilePairingUrl(qrPayload?.shortUrl)

  const targetIsLocalhost = !!pairUrl && /localhost|127\.0\.0\.1/.test(pairUrl)
  const targetIsSecure = !!pairUrl && /^https:/.test(pairUrl)
  const insecurePhoneContext = !targetIsSecure && !targetIsLocalhost

  const isExpired = timeLeft <= 0

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await onRefresh()
    } catch (err) {
      setRefreshError(err?.message || 'Unable to refresh QR code. Please try again.')
    } finally {
      setRefreshing(false)
    }
  }

  if (!qrPayload) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-6 text-center">
        <div className="text-sm text-surface-500">QR code will appear once you join.</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 flex flex-col items-center">
      <h3 className="text-surface-900 font-semibold text-sm mb-1">Pair Mobile Device</h3>
      <p className="text-surface-500 text-xs mb-4 text-center">
        Scan with your phone camera to pair it as a second camera.
      </p>

      <div className={`bg-white p-3 rounded-xl border border-surface-200 transition-opacity ${isExpired ? 'opacity-40' : ''}`}>
        {pairUrl ? (
          <QRCodeSVG value={pairUrl} size={168} level="M" />
        ) : (
          <div className="w-[168px] h-[168px] bg-surface-100 rounded-lg" />
        )}
      </div>

      {isExpired ? (
        <div className="text-danger-600 text-xs mt-3 font-medium">QR code expired</div>
      ) : (
        <div className="text-surface-600 text-xs mt-3 font-mono">
          Expires in {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
          {String(timeLeft % 60).padStart(2, '0')}
        </div>
      )}

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="mt-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
      >
        {refreshing ? 'Refreshing...' : 'Refresh QR Code'}
      </button>

      {refreshError && (
        <div className="mt-2 text-danger-600 text-xs text-center max-w-[220px]">{refreshError}</div>
      )}

      {tokenStatus && (
        <p className="text-surface-400 text-[10px] mt-2">{tokenStatus}</p>
      )}

      {targetIsLocalhost && (
        <p className="mt-2 text-warning-600 text-[10px] text-center max-w-[230px]">
          This QR points to localhost. Set VITE_PUBLIC_HOST to this computer's
          LAN IP so the phone can reach it.
        </p>
      )}
      {insecurePhoneContext && (
        <p className="mt-2 text-warning-600 text-[10px] text-center max-w-[230px]">
          The phone will open this page over plain HTTP — camera access may be
          blocked. Use the HTTPS dev server (mkcert) for reliable pairing.
        </p>
      )}

      <p className="text-surface-400 text-[10px] mt-3 text-center max-w-[220px]">
        Opens the interview pairing page on your phone.
      </p>
    </div>
  )
}
