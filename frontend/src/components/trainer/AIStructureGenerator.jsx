import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Sparkles, Loader2, Trash2, Pencil, Check, X,
  ChevronRight, GripVertical, AlertCircle, CheckCircle2, RotateCcw,
  ChevronDown, Plus, BookOpen, Clock, FileUp, CheckCircle,
  HelpCircle, Layers, Folder, RefreshCw
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import './AIStructureGenerator.css'

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function normalizeStructure(data) {
  if (!data || !Array.isArray(data.modules)) return null
  return {
    courseTitle: data.courseTitle || '',
    modules: data.modules.map((m, mi) => ({
      id: m.id || `mod_${Date.now()}_${mi}`,
      title: m.title || `Module ${mi + 1}`,
      duration: m.duration || '',
      description: m.description || '',
      expanded: mi === 0, // expand first by default
      subModules: (m.subModules || []).map((sm, si) => ({
        id: sm.id || `sub_${Date.now()}_${mi}_${si}`,
        title: sm.title || `Sub Module ${si + 1}`,
        duration: sm.duration || '',
        expanded: true,
        topics: (sm.topics || []).map((t, ti) => ({
          id: t.id || `top_${Date.now()}_${mi}_${si}_${ti}`,
          title: t.title || `Topic ${ti + 1}`,
          duration: t.duration || '',
          description: t.description || '',
        })),
      })),
    })),
  }
}

export default function AIStructureGenerator({ user, courseId, onStructureSaved }) {
  const { success, error: showError } = useToast()
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [structure, setStructure] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [expandedModules, setExpandedModules] = useState({})


  const fileRef = useRef(null)
  const dropRef = useRef(null)

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  // Fetch initial structure on mount
  const fetchStructure = useCallback(async () => {
    try {
      setLoadingInitial(true)
      const r = await fetch(API.TRAINER_COURSES.STRUCTURE(courseId), { headers: auth() })
      const d = await r.json()
      if (d.success && d.structure && d.structure.modules?.length > 0) {
        const norm = normalizeStructure(d.structure)
        setStructure(norm)
        if (norm?.modules?.length > 0) {
          setExpandedModules({ [norm.modules[0].id]: true })
        }
      } else {
        setStructure(null)
      }
    } catch (e) {
      console.error('fetchStructure error:', e)
    } finally {
      setLoadingInitial(false)
    }
  }, [courseId])

  useEffect(() => {
    fetchStructure()
  }, [fetchStructure])

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
    const trimmed = prompt.trim()
    if (!trimmed && !file) {
      setError('Please enter a course structure prompt or upload a document.')
      return
    }

    setGenerating(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('prompt', trimmed)
      formData.append('replaceExisting', 'true')
      if (file) formData.append('file', file)

      const r = await fetch(API.TRAINER_COURSES.GENERATE_STRUCTURE(courseId), {
        method: 'POST',
        headers: auth(),
        body: formData,
      })
      const d = await r.json()

      if (!r.ok || !d.success) {
        throw new Error(d.error || 'Failed to generate course structure.')
      }

      const normalized = normalizeStructure(d.structure)
      setStructure(normalized)
      if (normalized?.modules?.length > 0) {
        setExpandedModules({ [normalized.modules[0].id]: true })
      }
      success(d.message || 'Course structure generated and saved successfully!')
      onStructureSaved?.()
    } catch (e) {
      setError(e.message || 'Unable to generate the course structure. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const [confirmModal, setConfirmModal] = useState(null) // { title, desc, onConfirm, dangerText }
  const [deleting, setDeleting] = useState(false)

  const toggleModule = (id) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const getTotalTopicsCount = (mod) => {
    let count = 0
    for (const sm of (mod.subModules || [])) {
      count += (sm.topics || []).length
    }
    return count
  }

  // ── DELETE ACTIONS ──

  // 1. Delete entire course structure
  const requestClearAllStructure = () => {
    setConfirmModal({
      title: 'Delete Entire Course Structure?',
      desc: 'This will permanently remove all modules, sub-modules, and learning topics from this course. This action cannot be undone.',
      dangerText: 'Delete All Structure',
      onConfirm: async () => {
        setDeleting(true)
        try {
          const r = await fetch(API.TRAINER_COURSES.CLEAR_STRUCTURE(courseId), {
            method: 'DELETE',
            headers: auth(),
          })
          const d = await r.json()
          if (!r.ok || !d.success) throw new Error(d.error || 'Failed to clear structure')
          
          setStructure(null)
          setExpandedModules({})
          success('Course structure cleared successfully.')
          onStructureSaved?.()
        } catch (e) {
          showError(e.message || 'Unable to delete structure.')
        } finally {
          setDeleting(false)
          setConfirmModal(null)
        }
      }
    })
  }

  // 2. Delete an individual Module
  const requestDeleteModule = (mod) => {
    setConfirmModal({
      title: `Delete Module "${mod.title}"?`,
      desc: 'This will permanently delete this module along with all its sub-modules and learning topics.',
      dangerText: 'Delete Module',
      onConfirm: async () => {
        setDeleting(true)
        try {
          // Collect all lesson IDs for this module and its children
          const ids = [mod.id]
          for (const sm of (mod.subModules || [])) {
            if (sm.id) ids.push(sm.id)
            for (const t of (sm.topics || [])) {
              if (t.id) ids.push(t.id)
            }
          }
          const numericIds = ids.filter(id => typeof id === 'number' || (!isNaN(id) && String(id).trim() !== ''))

          const r = await fetch(API.TRAINER_COURSES.DELETE_MODULE(courseId, mod.id), {
            method: 'DELETE',
            headers: { ...auth(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: numericIds }),
          })
          const d = await r.json()
          if (!r.ok || !d.success) throw new Error(d.error || 'Failed to delete module')

          // Update UI immediately
          setStructure(prev => {
            if (!prev) return null
            const updatedMods = prev.modules.filter(m => m.id !== mod.id)
            if (updatedMods.length === 0) return null
            return { ...prev, modules: updatedMods }
          })
          success(`Module "${mod.title}" deleted successfully.`)
          onStructureSaved?.()
        } catch (e) {
          showError(e.message || 'Unable to delete module.')
        } finally {
          setDeleting(false)
          setConfirmModal(null)
        }
      }
    })
  }

  // 3. Delete an individual Sub Module
  const requestDeleteSubModule = (mod, subMod) => {
    setConfirmModal({
      title: `Delete Sub Module "${subMod.title}"?`,
      desc: 'This will permanently delete this sub-module and all of its learning topics.',
      dangerText: 'Delete Sub Module',
      onConfirm: async () => {
        setDeleting(true)
        try {
          const ids = [subMod.id]
          for (const t of (subMod.topics || [])) {
            if (t.id) ids.push(t.id)
          }
          const numericIds = ids.filter(id => typeof id === 'number' || (!isNaN(id) && String(id).trim() !== ''))

          const r = await fetch(API.TRAINER_COURSES.DELETE_SUBMODULE(courseId, subMod.id), {
            method: 'DELETE',
            headers: { ...auth(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: numericIds }),
          })
          const d = await r.json()
          if (!r.ok || !d.success) throw new Error(d.error || 'Failed to delete sub module')

          // Update UI immediately
          setStructure(prev => {
            if (!prev) return null
            const updatedMods = prev.modules.map(m => {
              if (m.id !== mod.id) return m
              return {
                ...m,
                subModules: (m.subModules || []).filter(sm => sm.id !== subMod.id),
              }
            })
            return { ...prev, modules: updatedMods }
          })
          success(`Sub Module "${subMod.title}" deleted successfully.`)
          onStructureSaved?.()
        } catch (e) {
          showError(e.message || 'Unable to delete sub module.')
        } finally {
          setDeleting(false)
          setConfirmModal(null)
        }
      }
    })
  }

  // 4. Delete an individual Topic
  const requestDeleteTopic = (mod, subMod, topic) => {
    setConfirmModal({
      title: `Delete Topic "${topic.title}"?`,
      desc: 'Are you sure you want to delete this topic? This action cannot be undone.',
      dangerText: 'Delete Topic',
      onConfirm: async () => {
        setDeleting(true)
        try {
          const r = await fetch(API.TRAINER_COURSES.DELETE_TOPIC(courseId, topic.id), {
            method: 'DELETE',
            headers: auth(),
          })
          const d = await r.json()
          if (!r.ok || !d.success) throw new Error(d.error || 'Failed to delete topic')

          // Update UI immediately
          setStructure(prev => {
            if (!prev) return null
            const updatedMods = prev.modules.map(m => {
              if (m.id !== mod.id) return m
              return {
                ...m,
                subModules: (m.subModules || []).map(sm => {
                  if (sm.id !== subMod.id) return sm
                  return {
                    ...sm,
                    topics: (sm.topics || []).filter(t => t.id !== topic.id),
                  }
                }),
              }
            })
            return { ...prev, modules: updatedMods }
          })
          success(`Topic "${topic.title}" deleted.`)
          onStructureSaved?.()
        } catch (e) {
          showError(e.message || 'Unable to delete topic.')
        } finally {
          setDeleting(false)
          setConfirmModal(null)
        }
      }
    })
  }


  return (
    <div className="wls-structure-workspace">
      {/* ── Main Top Row: Left Generation Panel + Right Info Cards ── */}
      <div className="wls-generator-row">
        {/* Left Card: Generator Form */}
        <div className="wls-generator-card">
          {/* Header */}
          <div className="wls-generator-header">
            <div className="wls-generator-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="wls-generator-title">Generate Course Structure</h2>
              <p className="wls-generator-subtitle">
                Let AI create your course hierarchy from a prompt or document
              </p>
            </div>
          </div>

          {/* Section A: Generate from Document */}
          <div className="wls-form-section">
            <h3 className="wls-section-title">Generate from Document</h3>
            <div
              ref={dropRef}
              className={`wls-dropzone ${dragOver ? 'wls-dropzone--active' : ''} ${file ? 'wls-dropzone--has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !file && fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt"
                onChange={handleFileSelect}
                hidden
              />

              {file ? (
                <div className="wls-file-info-pill">
                  <FileText size={18} style={{ color: '#16A34A' }} />
                  <span className="wls-file-name">{file.name}</span>
                  <span className="wls-file-size">({formatBytes(file.size)})</span>
                  <button
                    className="wls-file-remove"
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                    title="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="wls-dropzone-inner">
                  <div className="wls-upload-arrow-icon">
                    <Upload size={22} />
                  </div>
                  <p className="wls-dropzone-text">Drop a PDF, DOCX, PPTX, or TXT file here</p>
                  <span className="wls-dropzone-or">or</span>
                  <button
                    type="button"
                    className="wls-browse-btn"
                    onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                  >
                    Browse files
                  </button>
                </div>
              )}
            </div>
            <span className="wls-supported-formats">Supported formats: PDF, DOCX, PPTX, TXT (Max 50MB)</span>
          </div>

          {/* OR Divider */}
          <div className="wls-or-divider">
            <span>OR</span>
          </div>

          {/* Section B: Generate from Prompt */}
          <div className="wls-form-section">
            <h3 className="wls-section-title">Generate from Prompt</h3>
            <p className="wls-section-desc">Describe the course structure you want AI to create.</p>
            <div className="wls-textarea-wrapper">
              <textarea
                className="wls-prompt-textarea"
                value={prompt}
                onChange={(e) => {
                  if (e.target.value.length <= 2000) {
                    setPrompt(e.target.value)
                  }
                  if (error) setError('')
                }}
                placeholder="e.g., Create a complete Python course for beginners, from basics to advanced, for 1 month with 7 hours of learning every day."
                rows={4}
                disabled={generating}
              />
              <span className="wls-char-counter">{prompt.length} / 2000</span>
            </div>
            <span className="wls-field-helper">
              Provide details like number of modules, topics, subtopics, projects, exercises, and duration.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="wls-error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            className="wls-generate-submit-btn"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="ai-spin" />
                <span>Generating Structure...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>✨ Generate Structure</span>
              </>
            )}
          </button>
        </div>

        {/* Right Info Cards */}
        <div className="wls-info-column">
          {/* Card 1: What AI will create */}
          <div className="wls-info-card">
            <h4 className="wls-info-card-title">What AI will create</h4>
            <div className="wls-checklist">
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Logical Modules</div>
                  <div className="wls-check-desc">Organized main modules</div>
                </div>
              </div>
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Sub Modules</div>
                  <div className="wls-check-desc">Detailed sub modules</div>
                </div>
              </div>
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Learning Topics</div>
                  <div className="wls-check-desc">Comprehensive topics</div>
                </div>
              </div>
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Practical Exercises</div>
                  <div className="wls-check-desc">Hands-on practice</div>
                </div>
              </div>
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Projects</div>
                  <div className="wls-check-desc">Real-world projects</div>
                </div>
              </div>
              <div className="wls-checklist-item">
                <Check size={16} className="wls-check-icon" />
                <div>
                  <div className="wls-check-label">Estimated Duration</div>
                  <div className="wls-check-desc">Time estimation</div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Tips for better results */}
          <div className="wls-info-card wls-info-card--tips">
            <div className="wls-tips-header">
              <div className="wls-tips-icon">💡</div>
              <h4 className="wls-info-card-title">Tips for better results</h4>
            </div>
            <div className="wls-tips-body">
              <p className="wls-tips-intro">Be specific about:</p>
              <ul className="wls-tips-list">
                <li>• Course level (beginner/advanced)</li>
                <li>• Number of modules</li>
                <li>• Specific topics to include</li>
                <li>• Projects or exercises</li>
                <li>• Duration if known</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Section: Generated Structure Preview ── */}
      {structure && structure.modules?.length > 0 && (
        <div className="wls-preview-card">
          {/* Header */}
          <div className="wls-preview-card-header">
            <div className="wls-preview-title-row">
              <h3 className="wls-preview-main-title">Generated Structure Preview</h3>
              <span className="wls-preview-module-badge">
                {structure.modules.length} Modules
              </span>
            </div>
            
            <div className="wls-preview-actions-group">
              <button
                className="wls-clear-all-btn"
                onClick={requestClearAllStructure}
                disabled={deleting}
                title="Delete all modules and structure"
              >
                <Trash2 size={14} />
                <span>Clear Structure</span>
              </button>

              <button
                className="wls-refresh-btn"
                onClick={fetchStructure}
                disabled={loadingInitial || deleting}
              >
                <RefreshCw size={14} className={loadingInitial ? 'ai-spin' : ''} />
                <span>Refresh Structure</span>
              </button>
            </div>
          </div>

          {/* Modules Accordion List */}
          <div className="wls-modules-accordion-list">
            {structure.modules.map((m, mi) => {
              const isOpen = !!expandedModules[m.id]
              const totalTopics = getTotalTopicsCount(m)

              return (
                <div key={m.id} className="wls-accordion-item">
                  <div
                    className="wls-accordion-header"
                    onClick={() => toggleModule(m.id)}
                  >
                    <div className="wls-accordion-header-left">
                      <div className="wls-accordion-folder-icon">
                        <Folder size={18} />
                      </div>
                      <span className="wls-accordion-title">{m.title}</span>
                    </div>

                    <div className="wls-accordion-header-right">
                      <span className="wls-accordion-stat">{m.subModules?.length || 0} Sub Modules</span>
                      <span className="wls-accordion-stat">{totalTopics} Topics</span>
                      
                      {/* Delete Module Action */}
                      <button
                        className="wls-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          requestDeleteModule(m)
                        }}
                        title="Delete Module"
                      >
                        <Trash2 size={15} />
                      </button>

                      <span className={`wls-accordion-chevron ${isOpen ? 'wls-accordion-chevron--open' : ''}`}>
                        <ChevronDown size={18} />
                      </span>
                    </div>
                  </div>

                  {/* Expanded Submodules & Topics */}
                  {isOpen && (
                    <div className="wls-accordion-body">
                      {m.description && (
                        <p className="wls-module-description-text">{m.description}</p>
                      )}

                      <div className="wls-submodules-list">
                        {(m.subModules || []).map((sm, si) => (
                          <div key={sm.id} className="wls-submodule-block">
                            <div className="wls-submodule-header">
                              <span className="wls-submodule-tag">Sub Module {si + 1}</span>
                              <span className="wls-submodule-title">{sm.title}</span>
                              {sm.duration && (
                                <span className="wls-submodule-dur">
                                  <Clock size={12} /> {sm.duration}
                                </span>
                              )}

                              {/* Delete Sub Module Action */}
                              <button
                                className="wls-delete-btn"
                                onClick={() => requestDeleteSubModule(m, sm)}
                                title="Delete Sub Module"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div className="wls-topics-grid">
                              {(sm.topics || []).map((t, ti) => (
                                <div key={t.id} className="wls-topic-item">
                                  <span className="wls-topic-bullet">•</span>
                                  <span className="wls-topic-title">{t.title}</span>
                                  {t.duration && (
                                    <span className="wls-topic-dur">{t.duration}</span>
                                  )}

                                  {/* Delete Topic Action */}
                                  <button
                                    className="wls-delete-btn wls-topic-delete-btn"
                                    onClick={() => requestDeleteTopic(m, sm, t)}
                                    title="Delete Topic"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ── */}
      <AnimatePresence>
        {confirmModal && (
          <div className="wls-modal-backdrop" onClick={() => !deleting && setConfirmModal(null)}>
            <motion.div
              className="wls-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wls-modal-header">
                <div className="wls-modal-icon-danger">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h4 className="wls-modal-title">{confirmModal.title}</h4>
                  <p className="wls-modal-desc">{confirmModal.desc}</p>
                </div>
              </div>

              <div className="wls-modal-actions">
                <button
                  className="wls-modal-btn-cancel"
                  onClick={() => setConfirmModal(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="wls-modal-btn-danger"
                  onClick={confirmModal.onConfirm}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <Loader2 size={14} className="ai-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>{confirmModal.dangerText || 'Delete'}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

