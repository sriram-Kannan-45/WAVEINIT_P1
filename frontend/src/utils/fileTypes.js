/**
 * fileTypes.js — UI helpers for resource files.
 *
 * The backend stores Note.fileType as one of the existing ENUM values
 * (PDF | IMAGE | VIDEO | LINK), but the original filename extension drives
 * a richer set of icons/labels in the UI. These helpers centralise that
 * derivation so every component (uploader, list card, preview modal,
 * lesson viewer) shows the same icon/colour for the same file.
 */

import {
  FileText, FileSpreadsheet, Presentation, FileArchive,
  Image as ImageIcon, Video as VideoIcon, Music, Link as LinkIcon,
  File as FileGenericIcon,
} from 'lucide-react'

/* ───── Extension groups ──────────────────────────────────────────────── */
export const EXT = {
  pdf:        ['pdf'],
  doc:        ['doc', 'docx', 'odt', 'rtf', 'pages'],
  text:       ['txt', 'md', 'log'],
  sheet:      ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
  slide:      ['ppt', 'pptx', 'odp', 'key'],
  image:      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'],
  video:      ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'],
  audio:      ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
  archive:    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
}

/** Get the lowercase extension (no dot) from a filename. */
export function getExtension(name = '') {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/i)
  return m ? m[1] : ''
}

/**
 * Resolve a file/note to a UI category. Prefers original filename extension
 * (richer) and falls back to the ENUM fileType.
 *
 * Returns: 'pdf' | 'doc' | 'text' | 'sheet' | 'slide' | 'image' | 'video'
 *        | 'audio' | 'archive' | 'link' | 'file'
 */
export function getFileCategory(noteOrName, fileType) {
  const name = typeof noteOrName === 'string'
    ? noteOrName
    : (noteOrName?.fileName || noteOrName?.name || '')
  const tFromArg = typeof fileType === 'string' ? fileType : noteOrName?.fileType

  const ext = getExtension(name)
  if (ext) {
    for (const key of Object.keys(EXT)) {
      if (EXT[key].includes(ext)) return key
    }
  }

  // External link (http/https) with no useful extension
  if (tFromArg === 'LINK') {
    const url = typeof noteOrName === 'object' ? (noteOrName?.fileUrl || '') : ''
    if (/^https?:\/\//i.test(url)) return 'link'
  }

  // Fall back to ENUM
  switch ((tFromArg || '').toUpperCase()) {
    case 'PDF':   return 'pdf'
    case 'IMAGE': return 'image'
    case 'VIDEO': return 'video'
    case 'LINK':  return 'link'
    default:      return 'file'
  }
}

/* ───── Visual config per category ────────────────────────────────────── */
const CATEGORY_META = {
  pdf:     { label: 'PDF',         icon: FileText,        color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
  doc:     { label: 'Document',    icon: FileText,        color: '#0F766E', bg: 'rgba(37,99,235,0.10)' },
  text:    { label: 'Text',        icon: FileText,        color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  sheet:   { label: 'Spreadsheet', icon: FileSpreadsheet, color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  slide:   { label: 'Slides',      icon: Presentation,    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  image:   { label: 'Image',       icon: ImageIcon,       color: '#14B8A6', bg: 'rgba(20,184,166,0.10)' },
  video:   { label: 'Video',       icon: VideoIcon,       color: '#ec4899', bg: 'rgba(236,72,153,0.10)' },
  audio:   { label: 'Audio',       icon: Music,           color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
  archive: { label: 'Archive',     icon: FileArchive,     color: '#a16207', bg: 'rgba(161,98,7,0.12)' },
  link:    { label: 'Link',        icon: LinkIcon,        color: '#0D9488', bg: 'rgba(13,148,136,0.10)' },
  file:    { label: 'File',        icon: FileGenericIcon, color: '#475569', bg: 'rgba(71,85,105,0.10)' },
}

export function getFileMeta(noteOrName, fileType) {
  const cat = getFileCategory(noteOrName, fileType)
  return { category: cat, ...CATEGORY_META[cat] }
}

/** Convenience: just the icon component. */
export function getIconForFile(noteOrName, fileType) {
  return getFileMeta(noteOrName, fileType).icon
}

/* ───── Format helpers ────────────────────────────────────────────────── */
export function formatFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d)) return ''
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

/** Whether the browser can render the file inline (modal preview). */
export function isPreviewable(noteOrName, fileType) {
  const cat = getFileCategory(noteOrName, fileType)
  return ['pdf', 'image', 'video', 'audio', 'text'].includes(cat)
}

/** Whether the resource is an external link (http/https URL). */
export function isExternalLink(note) {
  return note?.fileType === 'LINK' && /^https?:\/\//i.test(note?.fileUrl || '')
}

/* ───── Filter facets shared by trainer + participant lists ──────────── */
export const FILTER_FACETS = [
  { key: 'ALL',     label: 'All',         match: () => true },
  { key: 'PDF',     label: 'PDFs',        match: (n) => getFileCategory(n) === 'pdf' },
  { key: 'DOC',     label: 'Documents',   match: (n) => ['doc', 'text'].includes(getFileCategory(n)) },
  { key: 'SHEET',   label: 'Sheets',      match: (n) => getFileCategory(n) === 'sheet' },
  { key: 'SLIDE',   label: 'Slides',      match: (n) => getFileCategory(n) === 'slide' },
  { key: 'IMAGE',   label: 'Images',      match: (n) => getFileCategory(n) === 'image' },
  { key: 'VIDEO',   label: 'Videos',      match: (n) => getFileCategory(n) === 'video' },
  { key: 'AUDIO',   label: 'Audio',       match: (n) => getFileCategory(n) === 'audio' },
  { key: 'ARCHIVE', label: 'Archives',    match: (n) => getFileCategory(n) === 'archive' },
  { key: 'LINK',    label: 'Links',       match: (n) => isExternalLink(n) },
]

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB — must match backend



/* ───── Lesson enrichment helpers ─────────────────────────────────────── */

/**
 * Estimate engagement time for a lesson — honest derivation, not fake.
 * - Video / Audio: 1 MB ≈ 1 min (rough but plausible for compressed media).
 * - PDF / Doc / Slides / Sheets: 1 MB ≈ 8 min reading.
 * - Image / Archive / Link: based on description word count, fallback 3 min.
 * Returns { value: number, unit: 'min' | 'mins', label: string }.
 */
export function estimateLessonDuration(lesson) {
  if (!lesson) return { value: 3, unit: 'min', label: '~3 min' }
  const cat = getFileCategory(lesson)
  const bytes = Number(lesson.fileSize) || 0
  const mb = bytes / (1024 * 1024)
  let mins = 0

  if (cat === 'video' || cat === 'audio') {
    mins = Math.max(1, Math.round(mb * 1.0))
  } else if (['pdf', 'doc', 'text', 'slide', 'sheet'].includes(cat)) {
    mins = Math.max(2, Math.round(mb * 8))
  } else {
    // link / image / archive — derive from description length
    const words = String(lesson.description || '').trim().split(/\s+/).filter(Boolean).length
    mins = words ? Math.max(2, Math.round(words / 180)) : 3
  }
  // Sensible cap so a giant archive doesn't read as "120 min".
  if (mins > 60) mins = 60
  const unit = mins === 1 ? 'min' : 'min'
  return { value: mins, unit, label: `${mins} ${unit}` }
}

/** True if lesson was created within the last 7 days. */
export function isLessonNew(lesson) {
  const ts = lesson?.created_at || lesson?.createdAt
  if (!ts) return false
  const created = new Date(ts).getTime()
  if (isNaN(created)) return false
  return (Date.now() - created) < 7 * 86400000
}

/** Decorative gradient banner for a lesson card, color-keyed to file type. */
export function getLessonBannerGradient(lesson) {
  const meta = getFileMeta(lesson)
  // Two-tone soft gradient using the category's accent color
  const c = meta.color
  // Build a softer companion stop
  return `linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.6) 60%, ${meta.bg} 100%), ${c}10`
}
