import { motion } from 'framer-motion'
import { useRef } from 'react'
import { Award, Download, Sparkles } from 'lucide-react'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/**
 * Render the certificate to a hidden <canvas>, then trigger a PNG download.
 * Pure browser — no backend, no extra dependency.
 */
function downloadCertificate({ studentName, courseTitle, score, dateLabel, certId }) {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1100
  const ctx = canvas.getContext('2d')

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1600, 1100)
  grad.addColorStop(0, '#eff6ff')
  grad.addColorStop(0.5, '#ecfeff')
  grad.addColorStop(1, '#f0fdfa')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1600, 1100)

  // Border
  ctx.strokeStyle = '#0D9488'
  ctx.lineWidth = 6
  ctx.strokeRect(40, 40, 1520, 1020)
  ctx.strokeStyle = '#14b8a6'
  ctx.lineWidth = 2
  ctx.strokeRect(70, 70, 1460, 960)

  // Header text
  ctx.textAlign = 'center'
  ctx.fillStyle = '#059669'
  ctx.font = 'bold 48px Outfit, sans-serif'
  ctx.fillText('CERTIFICATE OF ACHIEVEMENT', 800, 200)

  ctx.fillStyle = '#475569'
  ctx.font = '24px Inter, sans-serif'
  ctx.fillText('This certifies that', 800, 290)

  // Student name
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 84px Outfit, sans-serif'
  ctx.fillText(studentName, 800, 410)

  // Underline
  ctx.strokeStyle = '#0D9488'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(400, 440)
  ctx.lineTo(1200, 440)
  ctx.stroke()

  // Body
  ctx.fillStyle = '#475569'
  ctx.font = '24px Inter, sans-serif'
  ctx.fillText('has successfully completed the assessment', 800, 510)

  // Course title
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 42px Outfit, sans-serif'
  // Wrap if long
  const maxWidth = 1300
  const lines = []
  const words = courseTitle.split(' ')
  let line = ''
  words.forEach(w => {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth) { lines.push(line); line = w }
    else line = test
  })
  if (line) lines.push(line)
  lines.forEach((l, i) => ctx.fillText(l, 800, 590 + i * 56))

  const afterCourseY = 590 + Math.max(1, lines.length) * 56 + 20

  // Score
  ctx.fillStyle = '#0D9488'
  ctx.font = 'bold 64px Outfit, sans-serif'
  ctx.fillText(`Score: ${score.toFixed(1)}%`, 800, afterCourseY + 60)

  // Footer
  ctx.fillStyle = '#94a3b8'
  ctx.font = '20px Inter, sans-serif'
  ctx.fillText(`Issued on ${dateLabel}`, 800, 950)
  ctx.fillText(`Certificate ID: ${certId}`, 800, 980)

  ctx.fillStyle = '#059669'
  ctx.font = 'bold 20px Outfit, sans-serif'
  ctx.fillText('WAVE INIT  •  Learning Management System', 800, 1010)

  // Trigger download
  const link = document.createElement('a')
  link.download = `certificate-${certId}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/**
 * CertificateCard — one card per quiz the student has scored ≥70% on.
 * Click "Download" to get a PNG certificate generated on-the-fly.
 */
export default function CertificateCard({ certificate, studentName, index = 0 }) {
  const ref = useRef(null)
  const handleDownload = () => downloadCertificate({
    studentName,
    courseTitle: certificate.title,
    score: certificate.bestScore,
    dateLabel: fmtDate(certificate.evaluatedAt) || fmtDate(new Date()),
    certId: `WI-${certificate.quizId}-${(certificate.bestScore || 0).toFixed(0)}`,
  })

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
      className="ach-cert-card"
    >
      <div className="ach-cert-top">
        <div className="ach-cert-icon-wrap">
          <Award size={22} />
        </div>
        <span className="ach-cert-badge">
          <Sparkles size={11} /> Certified
        </span>
      </div>

      <h4 className="ach-cert-title">
        {certificate.title}
      </h4>
      <p className="ach-cert-subtitle">
        Issued for completing this assessment with distinction
      </p>

      <div className="ach-cert-metrics">
        <div>
          <div className="ach-cert-metric-label">
            Best Score
          </div>
          <div className="ach-cert-score-val">
            {certificate.bestScore?.toFixed(1)}%
          </div>
        </div>
        {certificate.rank != null && (
          <div style={{ textAlign: 'right' }}>
            <div className="ach-cert-metric-label">
              Rank
            </div>
            <div className="ach-cert-rank-val">
              #{certificate.rank}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleDownload}
        className="ach-cert-btn"
      >
        <Download size={14} /> Download Certificate
      </button>
    </motion.article>
  )
}
