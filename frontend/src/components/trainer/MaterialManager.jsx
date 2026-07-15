import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import {
  X, FileText, Video, Image as ImageIcon, Link as LinkIcon, FilePenLine, Presentation,
  Bold, Italic, Underline, Heading1, Heading2, Heading3, List, ListOrdered, Code,
  Upload, Trash2, Pencil, GripVertical, Save, ExternalLink, FileQuestion,
  Paperclip, Calendar,
} from 'lucide-react'
import { API, assetUrl } from '../../api/api'
import { useToast } from '../Toast'
import { colors, btnPrimary, btnSecondary, iconBtn, TYPE_BADGE, lblStyle, inputStyle, typography } from '../../theme/tokens'

const TYPES = [
  { key: 'NOTE',  label: 'Note',  icon: <FilePenLine size={16} />,  hint: 'Rich-text notes (paragraphs, headings, lists, links, images)' },
  { key: 'PDF',   label: 'PDF',   icon: <FileText size={16} />,     hint: 'Upload a PDF document (max 50 MB)' },
  { key: 'PPT',   label: 'PPT',   icon: <Presentation size={16} />, hint: 'Upload a PowerPoint deck (.pptx, .ppt — max 100 MB)' },
  { key: 'VIDEO', label: 'Video', icon: <Video size={16} />,        hint: 'Upload a video file (mp4/webm — max 500 MB) or paste a YouTube/Vimeo link' },
  { key: 'IMAGE', label: 'Image', icon: <ImageIcon size={16} />,    hint: 'Upload images (JPG/PNG/GIF/WEBP — max 10 MB each)' },
  { key: 'LINK',  label: 'Link',  icon: <LinkIcon size={16} />,     hint: 'Save an external URL (article, doc, anything web-hosted)' },
  { key: 'ATTACHMENT', label: 'Attachment', icon: <Paperclip size={16} />, hint: 'Upload any general file attachment (max 100 MB)' },
  { key: 'LIVE_SESSION', label: 'Live Session', icon: <Calendar size={16} />, hint: 'Link a scheduled live session URL (Zoom, Meet, Teams)' },
]

const TYPE_ACCEPT = {
  PDF:   '.pdf,application/pdf',
  PPT:   '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint',
  VIDEO: 'video/*',
  IMAGE: 'image/*',
  ATTACHMENT: '*',
}

const TYPE_LIMIT_MB = { PDF: 50, PPT: 100, VIDEO: 500, IMAGE: 10, ATTACHMENT: 100 }

function uploadWithProgress({ url, formData, token, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      let body = {}
      try { body = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body.error || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(formData)
  })
}

function NoteEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: 'Start writing your note…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  useEffect(() => {
    return () => editor?.destroy()
  }, [editor])

  if (!editor) return null

  const ToolbarBtn = ({ onClick, active, title, children }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, border: 'none', cursor: 'pointer',
        borderRadius: 6, fontSize: 12,
        background: active ? colors.primary[600] : 'transparent',
        color: active ? colors.surface.primary : colors.slate[600],
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const insertImage = () => {
    const url = window.prompt('Image URL')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div style={{ border: `1px solid ${colors.slate[300]}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8,
        background: colors.surface.secondary, borderBottom: `1px solid ${colors.border.default}`,
      }}>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()}     active={editor.isActive('bold')}      title="Bold">
          <Bold size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()}   active={editor.isActive('italic')}    title="Italic">
          <Italic size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()}   active={editor.isActive('strike')}    title="Strikethrough">
          <span style={{ textDecoration: 'line-through', fontWeight: 700 }}>S</span>
        </ToolbarBtn>
        <div style={{ width: 1, background: colors.border.default, margin: '0 4px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
          <Heading1 size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
          <Heading2 size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
          <Heading3 size={14} />
        </ToolbarBtn>
        <div style={{ width: 1, background: colors.border.default, margin: '0 4px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}  title="Bullet list">
          <List size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()}   active={editor.isActive('codeBlock')}   title="Code block">
          <Code size={14} />
        </ToolbarBtn>
        <div style={{ width: 1, background: colors.border.default, margin: '0 4px' }} />
        <ToolbarBtn onClick={setLink}      active={editor.isActive('link')}  title="Add/edit link">
          <LinkIcon size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={insertImage}  title="Insert image by URL">
          <ImageIcon size={14} />
        </ToolbarBtn>
      </div>
      <div style={{ background: colors.surface.primary, padding: 12, minHeight: 200, maxHeight: 360, overflow: 'auto' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function DropZone({ accept, onFile, file, hint, limitMb }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  const handlePick = (e) => {
    const f = e.target.files[0]
    if (f) onFile(f)
  }

  const fmtSize = (b) => {
    if (b == null) return ''
    const mb = b / 1024 / 1024
    return mb < 0.1 ? `${(b/1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handlePick}
        style={{ display: 'none' }}
      />
      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${over ? colors.primary[600] : colors.slate[300]}`,
            borderRadius: 12, padding: 28, textAlign: 'center',
            background: over ? '#eef2ff' : colors.surface.secondary,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <Upload size={36} color={over ? colors.primary[600] : colors.slate[400]} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, marginBottom: 4 }}>
            Drop a file or click to browse
          </div>
          <div style={{ fontSize: 12, color: colors.slate[500] }}>{hint || `Max ${limitMb} MB`}</div>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${colors.border.default}`, borderRadius: 10, padding: 12,
          display: 'flex', alignItems: 'center', gap: 12, background: colors.surface.secondary,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: '#eef2ff', color: colors.primary[600],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: colors.slate[500] }}>{fmtSize(file.size)}</div>
          </div>
          <button
            type="button"
            onClick={() => onFile(null)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: colors.danger[600], padding: 6, borderRadius: 6,
            }}
            title="Remove"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function MaterialManager({ user, lessonId, lessonTitle, open, onClose, onSaved }) {
  const { success, error: showError, info } = useToast()
  const [type, setType] = useState('NOTE')
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [title, setTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkDesc, setLinkDesc] = useState('')
  const [file, setFile] = useState(null)
  const [videoExternalUrl, setVideoExternalUrl] = useState('')
  const [progress, setProgress] = useState(null)
  const [saving, setSaving] = useState(false)

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchMaterials = async () => {
    if (!lessonId) return
    try {
      setLoading(true)
      const r = await fetch(API.TRAINER_COURSES.MATERIALS(lessonId), { headers: auth() })
      const d = await r.json()
      if (d.success) setMaterials(d.materials || [])
      else showError(d.error || 'Failed to load materials')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (open) fetchMaterials() }, [open, lessonId])

  const resetForm = () => {
    setTitle(''); setNoteContent(''); setLinkUrl(''); setLinkDesc('')
    setFile(null); setVideoExternalUrl(''); setProgress(null); setEditingId(null)
  }
  const switchType = (t) => { setType(t); resetForm() }

  const save = async () => {
    if (!title.trim()) { showError('Title is required'); return }

    const isEdit = !!editingId

    if (isEdit) {
      try {
        setSaving(true)
        const r = await fetch(API.TRAINER_COURSES.MATERIAL(lessonId, editingId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify({
            title,
            content:  type === 'NOTE' ? noteContent : (type === 'LINK' || type === 'LIVE_SESSION' ? linkDesc : undefined),
            linkUrl:  type === 'LINK' || type === 'LIVE_SESSION' ? linkUrl : (type === 'VIDEO' && !file ? videoExternalUrl : undefined),
          }),
        })
        const d = await r.json()
        if (!r.ok || d.success === false) { showError(d.error || 'Save failed'); return }
        success('Material updated')
        resetForm()
        await fetchMaterials()
        onSaved?.()
      } catch (e) { showError(e.message) }
      finally { setSaving(false) }
      return
    }

    try {
      setSaving(true); setProgress(null)

      if (type === 'NOTE' || type === 'LINK' || type === 'LIVE_SESSION' || (type === 'VIDEO' && !file && videoExternalUrl)) {
        const body = {
          materialType: type,
          title,
          content:  type === 'NOTE' ? noteContent : (type === 'LINK' || type === 'LIVE_SESSION' ? linkDesc : null),
          linkUrl:  type === 'LINK' || type === 'LIVE_SESSION' ? linkUrl : (type === 'VIDEO' ? videoExternalUrl : null),
        }
        const r = await fetch(API.TRAINER_COURSES.MATERIALS(lessonId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify(body),
        })
        const d = await r.json()
        if (!r.ok || d.success === false) { showError(d.error || 'Save failed'); return }
        success('Material saved')
      } else {
        if (!file) { showError('Please select a file'); return }
        const fd = new FormData()
        fd.append('materialType', type)
        fd.append('title', title)
        fd.append('file', file)
        const data = await uploadWithProgress({
          url: API.TRAINER_COURSES.MATERIALS(lessonId),
          formData: fd,
          token: user.token,
          onProgress: setProgress,
        })
        if (data.success === false) { showError(data.error || 'Upload failed'); return }
        success('Material uploaded')
      }

      resetForm()
      await fetchMaterials()
      onSaved?.()
    } catch (e) {
      showError(e.message || 'Save failed')
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  const beginEdit = (m) => {
    setType(m.materialType)
    setEditingId(m.id)
    setTitle(m.title || '')
    setNoteContent(m.materialType === 'NOTE' ? (m.content || '') : '')
    setLinkUrl(m.materialType === 'LINK' || m.materialType === 'LIVE_SESSION' || m.materialType === 'VIDEO' ? (m.linkUrl || '') : '')
    setLinkDesc(m.materialType === 'LINK' || m.materialType === 'LIVE_SESSION' ? (m.content || '') : '')
    setVideoExternalUrl(m.materialType === 'VIDEO' && !m.fileUrl ? (m.linkUrl || '') : '')
    setFile(null)
  }

  const removeMat = async (m) => {
    if (!window.confirm(`Delete "${m.title}"?`)) return
    try {
      const r = await fetch(API.TRAINER_COURSES.MATERIAL(lessonId, m.id), { method: 'DELETE', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Delete failed'); return }
      success('Material deleted')
      if (editingId === m.id) resetForm()
      await fetchMaterials()
      onSaved?.()
    } catch (e) { showError(e.message) }
  }

  if (!open) return null

  const TypeBadge = ({ value }) => {
    const v = TYPE_BADGE[value] || TYPE_BADGE.NOTE
    return (
      <span style={{ ...v, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
        {value}
      </span>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => !saving && onClose()}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            zIndex: 100, display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ x: 600 }} animate={{ x: 0 }} exit={{ x: 600 }}
            transition={{ type: 'spring', damping: 32, stiffness: 280 }}
            style={{
              width: '100%', maxWidth: 600, background: colors.surface.primary, height: '100vh',
              display: 'flex', flexDirection: 'column', boxShadow: '-25px 0 50px -10px rgba(0,0,0,0.25)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: 16, borderBottom: `1px solid ${colors.border.default}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.slate[400], letterSpacing: 1, textTransform: 'uppercase' }}>
                  Manage Materials
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>
                  {lessonTitle || 'Lesson'}
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  border: 'none', background: colors.slate[100], color: colors.slate[600],
                  padding: 8, borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Type tabs */}
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${colors.border.default}`,
              display: 'flex', gap: 6, overflowX: 'auto',
            }}>
              {TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => switchType(t.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', border: 'none', cursor: 'pointer',
                    borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                    background: type === t.key ? colors.primary[600] : colors.slate[100],
                    color: type === t.key ? colors.surface.primary : colors.slate[600],
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Form scroll area */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <div style={{
                fontSize: 12, color: colors.slate[500], marginBottom: 12,
                background: colors.surface.secondary, padding: '8px 12px', borderRadius: 8,
              }}>
                {TYPES.find(t => t.key === type)?.hint}
              </div>

              <label style={lblStyle}>Title <span style={{ color: colors.danger[600] }}>*</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. ${type === 'NOTE' ? 'Lesson summary' : type === 'LINK' ? 'External reference' : 'Course handout'}`}
                style={inputStyle}
              />

              {type === 'NOTE' && (
                <>
                  <label style={lblStyle}>Content</label>
                  <NoteEditor value={noteContent} onChange={setNoteContent} />
                </>
              )}

              {type === 'PDF' && (
                <>
                  <label style={lblStyle}>PDF file</label>
                  <DropZone
                    accept={TYPE_ACCEPT.PDF}
                    file={file}
                    onFile={setFile}
                    hint={`PDF only · max ${TYPE_LIMIT_MB.PDF} MB`}
                    limitMb={TYPE_LIMIT_MB.PDF}
                  />
                </>
              )}

              {type === 'PPT' && (
                <>
                  <label style={lblStyle}>Presentation file</label>
                  <DropZone
                    accept={TYPE_ACCEPT.PPT}
                    file={file}
                    onFile={setFile}
                    hint={`.pptx or .ppt · max ${TYPE_LIMIT_MB.PPT} MB`}
                    limitMb={TYPE_LIMIT_MB.PPT}
                  />
                </>
              )}

              {type === 'VIDEO' && (
                <>
                  <label style={lblStyle}>Upload video file</label>
                  <DropZone
                    accept={TYPE_ACCEPT.VIDEO}
                    file={file}
                    onFile={(f) => { setFile(f); if (f) setVideoExternalUrl('') }}
                    hint={`mp4 / webm · max ${TYPE_LIMIT_MB.VIDEO} MB`}
                    limitMb={TYPE_LIMIT_MB.VIDEO}
                  />
                  <div style={{
                    margin: '14px 0', display: 'flex', alignItems: 'center', gap: 12,
                    color: colors.slate[400], fontSize: 11,
                  }}>
                    <div style={{ flex: 1, height: 1, background: colors.border.default }} />
                    <span>OR</span>
                    <div style={{ flex: 1, height: 1, background: colors.border.default }} />
                  </div>
                  <label style={lblStyle}>External URL (YouTube, Vimeo, etc.)</label>
                  <input
                    value={videoExternalUrl}
                    onChange={(e) => { setVideoExternalUrl(e.target.value); if (e.target.value) setFile(null) }}
                    placeholder="https://www.youtube.com/watch?v=…"
                    style={inputStyle}
                  />
                </>
              )}

              {type === 'IMAGE' && (
                <>
                  <label style={lblStyle}>Image file</label>
                  <DropZone
                    accept={TYPE_ACCEPT.IMAGE}
                    file={file}
                    onFile={setFile}
                    hint={`JPG / PNG / GIF / WEBP · max ${TYPE_LIMIT_MB.IMAGE} MB`}
                    limitMb={TYPE_LIMIT_MB.IMAGE}
                  />
                  <div style={{ marginTop: 8, fontSize: 11, color: colors.slate[400] }}>
                    For multiple images, save one then upload the next — each becomes its own material.
                  </div>
                </>
              )}

              {type === 'ATTACHMENT' && (
                <>
                  <label style={lblStyle}>Attachment file</label>
                  <DropZone
                    accept={TYPE_ACCEPT.ATTACHMENT}
                    file={file}
                    onFile={setFile}
                    hint={`Any file format · max ${TYPE_LIMIT_MB.ATTACHMENT} MB`}
                    limitMb={TYPE_LIMIT_MB.ATTACHMENT}
                  />
                </>
              )}

              {type === 'LIVE_SESSION' && (
                <>
                  <label style={lblStyle}>Live Session URL (Zoom/Meet/Teams) <span style={{ color: colors.danger[600] }}>*</span></label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                    style={inputStyle}
                  />
                  <label style={lblStyle}>Description (optional)</label>
                  <textarea
                    value={linkDesc}
                    onChange={(e) => setLinkDesc(e.target.value)}
                    rows={3}
                    placeholder="Enter session passcode, agenda, or timing details..."
                    style={inputStyle}
                  />
                </>
              )}

              {type === 'LINK' && (
                <>
                  <label style={lblStyle}>URL <span style={{ color: colors.danger[600] }}>*</span></label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://…"
                    style={inputStyle}
                  />
                  <label style={lblStyle}>Description (optional)</label>
                  <textarea
                    value={linkDesc}
                    onChange={(e) => setLinkDesc(e.target.value)}
                    rows={3}
                    placeholder="Why is this link relevant to participants?"
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </>
              )}

              {progress != null && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: colors.slate[500], marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Uploading…</span><span>{progress}%</span>
                  </div>
                  <div style={{ height: 8, background: colors.border.default, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: colors.primary[600], transition: 'width 0.15s' }} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 28 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: colors.text.primary, margin: '0 0 10px',
                              textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Existing materials ({materials.length})
                </h4>
                {loading ? (
                  <div style={{ height: 60, background: colors.slate[100], borderRadius: 8 }} />
                ) : materials.length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.slate[400], padding: 12,
                                border: `1px dashed ${colors.border.default}`, borderRadius: 8, textAlign: 'center' }}>
                    No materials yet — fill the form above and click Save.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {materials.map(m => (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: 10, border: `1px solid ${colors.border.default}`, borderRadius: 8, background: colors.surface.primary,
                      }}>
                        <GripVertical size={14} color={colors.slate[300]} />
                        <TypeBadge value={m.materialType} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary,
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.title}
                          </div>
                          {(m.fileUrl || m.linkUrl) && (
                            <a
                              href={m.fileUrl ? assetUrl(m.fileUrl) : m.linkUrl}
                              target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, color: colors.primary[600], textDecoration: 'none',
                                       display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            >
                              <ExternalLink size={11} />
                              {m.fileName || m.linkUrl?.replace(/^https?:\/\//, '').slice(0, 40)}
                            </a>
                          )}
                        </div>
                        <button onClick={() => beginEdit(m)} title="Edit" style={iconBtn('#eef2ff', colors.primary[600])}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => removeMat(m)} title="Delete" style={iconBtn('#fee2e2', colors.danger[600])}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: 16, borderTop: `1px solid ${colors.border.default}`,
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              background: colors.surface.secondary,
            }}>
              {editingId && (
                <button type="button" onClick={resetForm} disabled={saving} style={btnSecondary}>
                  Cancel edit
                </button>
              )}
              <button type="button" onClick={onClose} disabled={saving} style={btnSecondary}>
                Close
              </button>
              <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
                <Save size={14} style={{ marginRight: 6 }} />
                {saving ? (progress != null ? `Uploading ${progress}%` : 'Saving…') : (editingId ? 'Update' : 'Save Material')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
