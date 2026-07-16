import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Sparkles, Loader2, Trash2, Pencil, Check, X,
  ChevronRight, GripVertical, AlertCircle, CheckCircle2, RotateCcw,
  ChevronDown, ChevronUp, Plus, BookOpen
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'

const TAXONOMY = {
  module:    { label: 'Module',     bg: '#f0fdfa', fg: '#0D9488', depth: 0 },
  subModule: { label: 'Sub Module', bg: '#f0fdfa', fg: '#0D9488', depth: 1 },
  topic:     { label: 'Topic',      bg: '#f0fdf4', fg: '#16a34a', depth: 2 },
}

let _nextId = 1
function uid() { return `_ai_${_nextId++}` }

function makeNode(type, title = '', duration = '') {
  const base = { id: uid(), type, title, duration, expanded: true }
  if (type === 'module') return { ...base, subModules: [makeNode('subModule')] }
  if (type === 'subModule') return { ...base, topics: [makeNode('topic')] }
  return base
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)) }

function parseAIResponse(data) {
  const modules = (data.modules || []).map((m, mi) => ({
    id: uid(), type: 'module', title: m.title || `Module ${mi + 1}`,
    duration: m.duration || '', description: m.description || '', expanded: true,
    subModules: (m.subModules || [{}]).map((sm, si) => ({
      id: uid(), type: 'subModule', title: sm.title || `Sub Module ${si + 1}`,
      duration: sm.duration || '', expanded: true,
      topics: (sm.topics || [{}]).map((t, ti) => ({
        id: uid(), type: 'topic', title: t.title || `Topic ${ti + 1}`,
        duration: t.duration || '',
      })),
    })),
  }))
  return { courseTitle: data.courseTitle || '', modules }
}

function TreeItem({ node, depth, onUpdate, onRemove, onAdd, dragHandlers, isLast }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(node.title)
  const [durEdit, setDurEdit] = useState(false)
  const [durVal, setDurVal] = useState(node.duration)
  const info = TAXONOMY[node.type] || TAXONOMY.topic
  const indent = depth * 24

  const saveTitle = () => { onUpdate(node.id, { title: editVal }); setEditing(false) }
  const saveDur = () => { onUpdate(node.id, { duration: durVal }); setDurEdit(false) }
  const canAdd = node.type !== 'topic'
  const childType = node.type === 'module' ? 'subModule' : 'topic'

  return (
    <div className="ai-tree-item">
      <div className="ai-tree-row" style={{ paddingLeft: indent + 12 }}>
        <span className="ai-tree-drag" {...(dragHandlers || {})}>
          <GripVertical size={14} />
        </span>
        <button
          className="ai-tree-expand-btn"
          onClick={() => onUpdate(node.id, { expanded: !node.expanded })}
        >
          {node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="ai-tree-badge" style={{ background: info.bg, color: info.fg }}>
          {info.label}
        </span>
        {editing ? (
          <input
            className="ai-tree-inline-input"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditing(false); setEditVal(node.title) } }}
            autoFocus
          />
        ) : (
          <span className="ai-tree-title" onDoubleClick={() => { setEditing(true); setEditVal(node.title) }}>
            {node.title || <span className="ai-tree-placeholder">Untitled</span>}
          </span>
        )}
        {node.type === 'topic' && (
          durEdit ? (
            <input
              className="ai-tree-dur-input"
              value={durVal}
              onChange={e => setDurVal(e.target.value)}
              onBlur={saveDur}
              onKeyDown={e => { if (e.key === 'Enter') saveDur(); if (e.key === 'Escape') { setDurEdit(false); setDurVal(node.duration) } }}
              placeholder="Duration"
              autoFocus
            />
          ) : (
            <span className="ai-tree-duration" onClick={() => { setDurEdit(true); setDurVal(node.duration) }}>
              {node.duration || 'Set duration'}
            </span>
          )
        )}
        <div className="ai-tree-actions">
          {canAdd && (
            <button className="ai-tree-action" title={`Add ${childType === 'subModule' ? 'Sub Module' : 'Topic'}`} onClick={() => onAdd(node.id, childType)}>
              <Plus size={13} />
            </button>
          )}
          <button className="ai-tree-action ai-tree-action--edit" title="Rename" onClick={() => { setEditing(true); setEditVal(node.title) }}>
            <Pencil size={13} />
          </button>
          <button className="ai-tree-action ai-tree-action--delete" title="Delete" onClick={() => onRemove(node.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {node.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {node.type === 'module' && node.subModules?.map((sm, i) => (
              <TreeItem
                key={sm.id}
                node={sm}
                depth={depth + 1}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onAdd={onAdd}
                isLast={i === node.subModules.length - 1}
              />
            ))}
            {node.type === 'subModule' && node.topics?.map((t, i) => (
              <TreeItem
                key={t.id}
                node={t}
                depth={depth + 1}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onAdd={onAdd}
                isLast={i === node.topics.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AIStructureGenerator({ user, courseId, onStructureSaved }) {
  const { success, error: showError } = useToast()
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [structure, setStructure] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const dropRef = useRef(null)

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (['pdf', 'docx', 'pptx', 'txt'].includes(ext)) {
        setFile(f)
        setError('')
      } else {
        setError('Only PDF, DOCX, PPTX, and TXT files are supported.')
      }
    }
  }, [])

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError('') }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) { setError('Please enter a prompt describing your course.'); return }
    setGenerating(true)
    setError('')
    setStructure(null)
    try {
      const formData = new FormData()
      formData.append('prompt', prompt.trim())
      if (file) formData.append('file', file)

      const r = await fetch(API.TRAINER_COURSES.GENERATE_STRUCTURE(courseId), {
        method: 'POST',
        headers: auth(),
        body: formData,
      })
      const d = await r.json()
      if (!r.ok || !d.success) {
        throw new Error(d.error || 'Generation failed')
      }
      setStructure(parseAIResponse(d.structure))
      success('Course structure generated successfully!')
    } catch (e) {
      setError(e.message || 'Failed to generate structure. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleRetry = () => { handleGenerate() }

  const updateNode = (id, updates) => {
    setStructure(prev => {
      const next = deepClone(prev)
      function walk(nodes) {
        for (const n of nodes) {
          if (n.id === id) { Object.assign(n, updates); return true }
          if (n.subModules && walk(n.subModules)) return true
          if (n.topics && walk(n.topics)) return true
        }
        return false
      }
      walk(next.modules)
      return next
    })
  }

  const removeNode = (id) => {
    setStructure(prev => {
      const next = deepClone(prev)
      function walk(nodes) {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === id) { nodes.splice(i, 1); return true }
          if (nodes[i].subModules && walk(nodes[i].subModules)) return true
          if (nodes[i].topics && walk(nodes[i].topics)) return true
        }
        return false
      }
      walk(next.modules)
      return next
    })
  }

  const addNode = (parentId, type) => {
    setStructure(prev => {
      const next = deepClone(prev)
      function walk(nodes) {
        for (const n of nodes) {
          if (n.id === parentId) {
            const child = makeNode(type)
            if (type === 'subModule') n.subModules = [...(n.subModules || []), child]
            else if (type === 'topic') n.topics = [...(n.topics || []), child]
            return true
          }
          if (n.subModules && walk(n.subModules)) return true
          if (n.topics && walk(n.topics)) return true
        }
        return false
      }
      walk(next.modules)
      return next
    })
  }

  const flattenToLessons = () => {
    if (!structure) return []
    const lessons = []
    let order = 0
    for (const m of structure.modules) {
      lessons.push({
        title: `Module: ${m.title}`,
        description: m.description || '',
        content: m.duration ? `Estimated Duration: ${m.duration}` : '',
        orderIndex: order++,
      })
      for (const sm of (m.subModules || [])) {
        lessons.push({
          title: `Sub Module: ${sm.title}`,
          description: '',
          content: sm.duration ? `Estimated Duration: ${sm.duration}` : '',
          orderIndex: order++,
        })
        for (const t of (sm.topics || [])) {
          lessons.push({
            title: `Topic: ${t.title}`,
            description: '',
            content: t.duration ? `Estimated Duration: ${t.duration}` : '',
            orderIndex: order++,
          })
        }
      }
    }
    return lessons
  }

  const handleSave = async () => {
    if (!structure) return
    const lessons = flattenToLessons()
    if (lessons.length === 0) { showError('No lessons to save.'); return }
    setSaving(true)
    try {
      for (const lesson of lessons) {
        const r = await fetch(API.TRAINER_COURSES.LESSONS(courseId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify(lesson),
        })
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || `Failed to save lesson: ${lesson.title}`)
        }
      }
      success(`Saved ${lessons.length} lessons successfully!`)
      setStructure(null)
      setPrompt('')
      setFile(null)
      onStructureSaved?.()
    } catch (e) {
      showError(e.message || 'Failed to save some lessons.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => { setStructure(null); setPrompt(''); setFile(null); setError('') }

  return (
    <div className="ai-structure">
      {/* Prompt & Upload Section */}
      {!structure && (
        <motion.div
          className="ai-structure-prompt-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="ai-structure-prompt-header">
            <div className="ai-structure-prompt-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="ai-structure-prompt-title">Generate Course Structure</h3>
              <p className="ai-structure-prompt-subtitle">Let AI create your course hierarchy from a prompt or document</p>
            </div>
          </div>

          {/* File Upload */}
          <div
            ref={dropRef}
            className={`ai-structure-upload ${dragOver ? 'ai-structure-upload--active' : ''} ${file ? 'ai-structure-upload--has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.txt" onChange={handleFileSelect} hidden />
            {file ? (
              <div className="ai-structure-file-info">
                <FileText size={18} />
                <span className="ai-structure-file-name">{file.name}</span>
                <button className="ai-structure-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null) }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="ai-structure-upload-content">
                <Upload size={24} />
                <span>Drop a PDF, DOCX, PPTX, or TXT file here</span>
                <span className="ai-structure-upload-hint">or click to browse</span>
              </div>
            )}
          </div>

          <div className="ai-structure-or-divider">
            <span>or</span>
          </div>

          {/* Prompt Textarea */}
          <textarea
            className="ai-structure-prompt-input"
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setError('') }}
            placeholder={'Create a beginner to advanced React course.\n\nOrganize into logical modules.\nCreate sub modules.\nCreate learning topics.\nGenerate practical exercises.\nInclude projects.\nEstimated duration 25 hours.'}
            rows={6}
          />

          {error && (
            <div className="ai-structure-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            className="ai-structure-generate-btn"
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="ai-spin" />
                Generating Structure...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Structure
              </>
            )}
          </button>

          {generating && (
            <div className="ai-structure-loading">
              <div className="ai-structure-loading-bar">
                <div className="ai-structure-loading-bar-fill" />
              </div>
              <p>AI is analyzing your content and building the course structure...</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Tree Preview */}
      {structure && (
        <motion.div
          className="ai-structure-preview"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="ai-structure-preview-header">
            <div className="ai-structure-preview-header-left">
              <CheckCircle2 size={18} style={{ color: '#059669' }} />
              <div>
                <h3 className="ai-structure-preview-title">
                  {structure.courseTitle || 'Generated Course Structure'}
                </h3>
                <p className="ai-structure-preview-subtitle">
                  {structure.modules.length} modules &middot; Review and edit before saving
                </p>
              </div>
            </div>
            <div className="ai-structure-preview-actions">
              <button className="ai-structure-btn ai-structure-btn--secondary" onClick={handleReset} disabled={saving}>
                <RotateCcw size={14} /> Regenerate
              </button>
              <button className="ai-structure-btn ai-structure-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="ai-spin" /> : <Check size={14} />}
                {saving ? 'Saving...' : 'Save Structure'}
              </button>
            </div>
          </div>

          {/* Course Title Edit */}
          <div className="ai-structure-course-title-row">
            <BookOpen size={16} style={{ color: '#0D9488' }} />
            <input
              className="ai-structure-course-title-input"
              value={structure.courseTitle}
              onChange={e => setStructure(prev => ({ ...prev, courseTitle: e.target.value }))}
              placeholder="Course Title"
            />
          </div>

          {/* Tree */}
          <div className="ai-tree">
            {structure.modules.map((m, i) => (
              <TreeItem
                key={m.id}
                node={m}
                depth={0}
                onUpdate={updateNode}
                onRemove={removeNode}
                onAdd={addNode}
                isLast={i === structure.modules.length - 1}
              />
            ))}
          </div>

          {structure.modules.length === 0 && (
            <div className="ai-structure-empty-tree">
              <AlertCircle size={20} />
              <p>No modules generated. Try regenerating with a more detailed prompt.</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
