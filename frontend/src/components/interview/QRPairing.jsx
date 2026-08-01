/**
 * QRPairing Component
 * Renders a QR code for mobile device pairing and handles refresh.
 */
import { useState, useEffect } from 'react'

export default function QRPairing({ qrPayload, onRefresh, expiresAt, tokenStatus }) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [qrSvg, setQrSvg] = useState('')

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

  // Generate a simple QR-like SVG (placeholder — frontend can use qrcode.react in production)
  useEffect(() => {
    if (!qrPayload?.payload) return
    // Create a simple encoded data visualization
    const data = qrPayload.payload
    const size = 200
    const cellSize = 8
    const cells = Math.floor(size / cellSize)

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    svgContent += `<rect width="${size}" height="${size}" fill="white"/>`

    // Simple hash-based pattern generation
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }

    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        // Corner patterns (finder patterns)
        const isCorner = (x < 4 && y < 4) || (x >= cells - 4 && y < 4) || (x < 4 && y >= cells - 4)
        const isCornerBorder = isCorner && (x === 0 || y === 0 || x === 3 || y === 3 ||
          x === cells - 1 || y === 3 || x === 3 || y === cells - 1)

        if (isCorner) {
          const isInner = (x >= 1 && x <= 2 && y >= 1 && y <= 2) ||
            (x >= cells - 3 && x <= cells - 2 && y >= 1 && y <= 2) ||
            (x >= 1 && x <= 2 && y >= cells - 3 && y <= cells - 2)
          if (isInner || isCornerBorder || (x === 0 || y === 0 || x === 3 || y === 3 ||
            x === cells - 1 || x === cells - 4)) {
            svgContent += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`
          }
        } else {
          // Data pattern from hash
          const idx = y * cells + x
          const bit = ((hash >> (idx % 31)) ^ (idx * 7)) & 1
          if (bit) {
            svgContent += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`
          }
        }
      }
    }
    svgContent += '</svg>'
    setQrSvg(svgContent)
  }, [qrPayload])

  if (!qrPayload) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
        <div className="text-gray-400 text-sm">QR code will appear when ready</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center p-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50">
      <h3 className="text-white font-semibold text-sm mb-3">Scan to pair mobile device</h3>

      <div className="bg-white p-3 rounded-xl mb-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />

      {timeLeft > 0 ? (
        <div className="text-amber-400 text-xs mb-2">
          Expires in {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>
      ) : (
        <div className="text-red-400 text-xs mb-2">QR code expired</div>
      )}

      <button
        onClick={onRefresh}
        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
      >
        Refresh QR Code
      </button>

      <p className="text-gray-400 text-xs mt-3 text-center max-w-[240px]">
        Open the LMS mobile page and scan this code to pair your phone as a secondary camera
      </p>
    </div>
  )
}
