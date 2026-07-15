import { useEffect, useRef } from 'react'

const UPDATE_INTERVAL_MS = 30000

function formatTimestamp(date) {
  const d = new Date(date)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mon = months[d.getMonth()]
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const hrs = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  return `${day} ${mon} ${year} ${hrs}:${min}:${sec}`
}

export default function QuizWatermark({ participantName, participantId }) {
  const svgRef = useRef(null)
  const textRef = useRef(null)

  useEffect(() => {
    const updateText = () => {
      if (textRef.current) {
        const ts = formatTimestamp(Date.now())
        textRef.current.textContent = `${participantName || 'Participant'} | ID: ${participantId || 'N/A'} | ${ts}`
      }
    }

    updateText()
    const interval = setInterval(updateText, UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [participantName, participantId])

  if (!participantName && !participantId) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          <pattern
            id="watermark-pattern"
            x="0"
            y="0"
            width="400"
            height="300"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-30)"
          >
            <text
              ref={textRef}
              x="30"
              y="160"
              fill="rgba(59, 130, 246, 0.09)"
              fontFamily="monospace"
              fontSize="14"
              fontWeight="500"
              letterSpacing="0.5"
            >
              {participantName || 'Participant'} | ID: {participantId || 'N/A'}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#watermark-pattern)" />
      </svg>
    </div>
  )
}
