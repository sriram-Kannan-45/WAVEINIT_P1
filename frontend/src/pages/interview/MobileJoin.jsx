/**
 * MobileJoin Page
 * Lightweight mobile web page for pairing a secondary camera device.
 * Accessed via QR code scan — no login required (token-based auth).
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : 'http://localhost:3001'

export default function MobileJoin() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('connecting') // connecting | camera | pairing | connected | error
  const [error, setError] = useState(null)
  const [stream, setStream] = useState(null)
  const videoRef = useRef(null)

  useEffect(() => {
    if (!token) {
      setError('Invalid QR code — no token found')
      setStatus('error')
    }
  }, [token])

  // Request camera access
  const requestCamera = async () => {
    try {
      setStatus('camera')
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setStatus('pairing')
    } catch (err) {
      setError('Camera access denied. Please allow camera access to pair your device.')
      setStatus('error')
    }
  }

  // Pair with interview session
  const handlePair = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/interviews/pair-by-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const res = await response.json()

      if (response.ok && res.success) {
        setStatus('connected')
      } else {
        setError(res.error || 'Pairing failed')
        setStatus('error')
      }
    } catch (err) {
      setError('Failed to connect to server')
      setStatus('error')
    }
  }

  // Auto-pair when camera is ready
  useEffect(() => {
    if (status === 'pairing') {
      handlePair()
    }
  }, [status])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-red-500/30 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-white mb-2">Pairing Error</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => { setStatus('connecting'); setError(null) }}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (status === 'connected') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-green-500/30 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-bold text-white mb-2">Device Paired!</h2>
          <p className="text-gray-400 text-sm mb-4">
            Your mobile camera is now connected as a secondary monitoring device.
          </p>
          <p className="text-gray-500 text-xs">
            Keep this page open during the interview. Do not navigate away.
          </p>
        </div>

        {/* Live preview */}
        <div className="mt-6 w-full max-w-sm">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-2xl border border-gray-700/50"
          />
          <p className="text-center text-green-400 text-xs mt-2 font-medium">
            📹 Camera Active — Monitoring Mode
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl border border-gray-700/50 p-8 max-w-sm w-full text-center"
      >
        <div className="text-4xl mb-3">📱</div>
        <h2 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Pair Mobile Device
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          This device will be used as a secondary monitoring camera during the interview.
          Position it to show your desk and workspace.
        </p>

        {status === 'connecting' && (
          <button
            onClick={requestCamera}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Enable Camera & Pair
          </button>
        )}

        {status === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm">Requesting camera access...</span>
          </div>
        )}

        {status === 'pairing' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm">Pairing with interview session...</span>
          </div>
        )}

        <div className="mt-6 bg-gray-700/50 rounded-xl p-3 text-xs text-gray-400">
          <p>💡 Tips:</p>
          <ul className="mt-1 space-y-1 text-left">
            <li>• Position phone to show your desk area</li>
            <li>• Ensure good lighting</li>
            <li>• Keep this page open during the interview</li>
          </ul>
        </div>
      </motion.div>
    </div>
  )
}
