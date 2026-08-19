/**
 * QRPairing Component
 * Renders an HTTPS scannable QR code for mobile device pairing.
 * Enforces secure context validation (HTTPS) before generating the QR.
 */
import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, Lock } from 'lucide-react'
import { buildMobilePairingUrl, isSecureContextForMedia } from '../../utils/mobilePairingUrl'

export default function QRPairing({ qrPayload, onRefresh, expiresAt, tokenStatus }) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)

  const isSecure = isSecureContextForMedia() && (typeof window !== 'undefined' && window.location.protocol === 'https:')

  useEffect(() => {
    const targetExpiry = expiresAt || qrPayload?.expiresAt
    if (!targetExpiry) return
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(targetExpiry) - Date.now()) / 1000))
      setTimeLeft(remaining)
      
      // Notify when expiring soon
      if (remaining === 60 && !refreshing) {
        console.log('[QR] QR code expiring in 1 minute')
      }
      if (remaining === 0) {
        console.warn('[QR] QR code has expired')
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, qrPayload, refreshing])

  // Encode the full HTTPS URL the phone browser will open after scanning.
  const rawPairUrl = buildMobilePairingUrl(qrPayload?.shortUrl)
  // Ensure protocol is always https://
  const pairUrl = rawPairUrl ? rawPairUrl.replace(/^http:\/\//i, 'https://') : null

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

  if (!isSecure) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 text-center space-y-3">
        <h3 className="text-surface-900 font-semibold text-sm">Pair Mobile Device</h3>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 leading-relaxed flex items-start gap-1.5">
          <Lock size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <span>Secure HTTPS connection is required before generating the mobile camera QR code.</span>
        </div>
      </div>
    )
  }

  if (!qrPayload) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-6 text-center">
        <div className="text-sm text-surface-500">QR code will appear once you join.</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3 flex flex-col items-center">
      <h3 className="text-surface-900 font-semibold text-xs mb-1">Pair Mobile Device</h3>
      <p className="text-surface-500 text-[11px] mb-2 text-center leading-tight">
        Scan with your phone camera to pair it as a second camera.
      </p>

      <div className={`bg-white p-2 rounded-lg border border-surface-200 transition-opacity ${isExpired ? 'opacity-40' : ''}`}>
        {pairUrl ? (
          <QRCodeSVG value={pairUrl} size={120} level="M" />
        ) : (
          <div className="w-[120px] h-[120px] bg-surface-100 rounded-lg flex items-center justify-center text-xs text-surface-400">
            Generating...
          </div>
        )}
      </div>

      {isExpired ? (
        <div className="text-rose-600 text-[11px] mt-2 font-medium flex items-center gap-1">
          <AlertTriangle size={12} /> QR code expired
        </div>
      ) : (
        <div className="text-surface-600 text-[10px] mt-2 font-mono bg-surface-50 px-2 py-0.5 rounded border border-surface-200">
          Expires in {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
          {String(timeLeft % 60).padStart(2, '0')}
        </div>
      )}

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="mt-2 px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-medium rounded-md transition-colors shadow-xs"
      >
        {refreshing ? 'Refreshing...' : 'Refresh QR Code'}
      </button>

      {refreshError && (
        <div className="mt-1 text-rose-600 text-[10px] text-center max-w-[200px]">{refreshError}</div>
      )}

      {tokenStatus && (
        <p className="text-surface-400 text-[10px] mt-1.5">{tokenStatus}</p>
      )}

      {pairUrl && (
        <p className="text-surface-400 text-[9px] mt-2 text-center max-w-[200px] font-mono break-all bg-surface-50 p-1 rounded border border-surface-100">
          {pairUrl}
        </p>
      )}
    </div>
  )
}
