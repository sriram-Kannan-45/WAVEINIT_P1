import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Download } from 'lucide-react'
import { assetUrl } from '../../../api/api'
import {
  getFileCategory, getFileMeta, isExternalLink, formatFileSize,
} from '../../../utils/fileTypes'

/**
 * LessonViewer — modal that renders the appropriate media for any Note.
 * Category-aware (driven by filename extension):
 *   pdf      → <iframe>
 *   image    → <img>
 *   video    → <video controls>
 *   audio    → <audio controls>
 *   text     → fetched and shown in <pre>
 *   link     → "Open in new tab" CTA
 *   doc/ppt/sheet/archive/file → "Download" CTA + icon
 */
export default function LessonViewer({ lesson, onClose }) {
  const [textContent, setTextContent] = useState(null)
  const [loadingText, setLoadingText] = useState(false)

  const meta = lesson ? getFileMeta(lesson) : null
  const Icon = meta?.icon
  const category = lesson ? getFileCategory(lesson) : 'file'
  const isExternal = lesson ? isExternalLink(lesson) : false
  const url = lesson?.fileUrl ? (isExternal ? lesson.fileUrl : assetUrl(lesson.fileUrl)) : ''

  // Esc to close + body scroll lock
  useEffect(() => {
    if (!lesson) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lesson, onClose])

  // Fetch inline text for text/markdown
  useEffect(() => {
    setTextContent(null)
    if (!lesson || !url || isExternal) return
    if (category !== 'text') return
    let cancelled = false
    setLoadingText(true)
    fetch(url)
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((t) => { if (!cancelled) setTextContent(t.slice(0, 50000)) })
      .catch(() => { if (!cancelled) setTextContent(null) })
      .finally(() => { if (!cancelled) setLoadingText(false) })
    return () => { cancelled = true }
  }, [lesson, url, category, isExternal])

  if (!lesson) return null

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <motion.div
          key="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-title"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--academic-surface)',
            borderRadius: 'var(--academic-radius-lg)',
            width: '100%', maxWidth: 960, maxHeight: '92vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: 'var(--academic-shadow-pop)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between" style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--academic-border-soft)',
            background: 'var(--academic-surface-soft)',
          }}>
            <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                background: meta?.bg, color: meta?.color,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {Icon && <Icon size={18} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <h2
                  id="lesson-title"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: 16, fontWeight: 700,
                    color: 'var(--academic-text)',
                    margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {lesson.title}
                </h2>
                <p style={{ fontSize: 12, color: 'var(--academic-text-muted)', margin: 0 }}>
                  {meta?.label || 'Lesson'}
                  {lesson.fileSize ? ` · ${formatFileSize(lesson.fileSize)}` : ''}
                  {' · '}By {lesson.trainer?.name || 'Instructor'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {url && !isExternal && (
                <a href={url} download className="ac-btn ac-btn-sm ac-focus-ring" title="Download">
                  <Download size={12} /> Download
                </a>
              )}
              {url && isExternal && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="ac-btn ac-btn-sm ac-focus-ring">
                  <ExternalLink size={12} /> Open in new tab
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ac-btn ac-btn-ghost ac-focus-ring"
                aria-label="Close lesson viewer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{
            flex: 1, overflow: 'auto',
            padding: ['image', 'audio'].includes(category) ? 24 : 0,
            background: category === 'video' ? '#000' : 'var(--academic-surface)',
            minHeight: 320,
          }}>
            {category === 'video' && url && (
              <video
                src={url}
                controls
                preload="metadata"
                style={{ width: '100%', height: '70vh', background: '#000', display: 'block' }}
              >
                Sorry, your browser doesn't support embedded videos.
              </video>
            )}

            {category === 'pdf' && url && (
              <iframe
                src={url}
                title={lesson.title}
                style={{ width: '100%', height: '78vh', border: 'none' }}
              />
            )}

            {category === 'image' && url && (
              <img
                src={url}
                alt={lesson.title}
                style={{
                  display: 'block', maxWidth: '100%', maxHeight: '74vh',
                  margin: '0 auto', borderRadius: 12,
                  boxShadow: 'var(--academic-shadow-card)',
                }}
              />
            )}

            {category === 'audio' && url && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0' }}>
                <span style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: meta.bg, color: meta.color,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={28} />
                </span>
                <audio src={url} controls style={{ width: '100%', maxWidth: 500 }} />
              </div>
            )}

            {category === 'text' && (
              <div style={{ padding: 24, maxHeight: '78vh', overflow: 'auto' }}>
                {loadingText && <p style={{ color: 'var(--academic-text-muted)' }}>Loading…</p>}
                {!loadingText && textContent != null && (
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--academic-text)',
                    margin: 0,
                  }}>
                    {textContent}
                  </pre>
                )}
                {!loadingText && textContent == null && url && (
                  <FallbackPanel meta={meta} message="Couldn't load text content. Use Download to read locally." downloadHref={url} />
                )}
              </div>
            )}

            {category === 'link' && url && (
              <FallbackPanel meta={meta} message="External resource — opens in a new tab." externalHref={url} url={url} />
            )}

            {['doc', 'sheet', 'slide', 'archive', 'file'].includes(category) && url && (
              <FallbackPanel
                meta={meta}
                message={`${meta.label} files cannot be previewed in the browser. Download the file to view it locally.`}
                downloadHref={url}
              />
            )}

            {!url && (
              <FallbackPanel meta={meta} message="No file URL available for this lesson." />
            )}
          </div>

          {/* Description footer */}
          {lesson.description && (
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--academic-border-soft)',
              fontSize: 13, color: 'var(--academic-text-secondary)', lineHeight: 1.55,
            }}>
              {lesson.description}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function FallbackPanel({ meta, message, downloadHref, externalHref, url }) {
  const Icon = meta?.icon
  return (
    <div style={{
      padding: 36, textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, minHeight: 300,
    }}>
      <span style={{
        width: 72, height: 72, borderRadius: 18,
        background: meta?.bg, color: meta?.color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {Icon && <Icon size={32} />}
      </span>
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--academic-text)' }}>
        {meta?.label || 'File'}
      </h4>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--academic-text-muted)', maxWidth: 460 }}>
        {message}
      </p>
      {url && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--academic-text-muted)', wordBreak: 'break-all', maxWidth: 480 }}>
          {url}
        </p>
      )}
      {downloadHref && (
        <a href={downloadHref} download className="ac-btn ac-btn-primary ac-focus-ring">
          <Download size={14} /> Download file
        </a>
      )}
      {externalHref && (
        <a href={externalHref} target="_blank" rel="noopener noreferrer" className="ac-btn ac-btn-primary ac-focus-ring">
          <ExternalLink size={14} /> Open link
        </a>
      )}
    </div>
  )
}
