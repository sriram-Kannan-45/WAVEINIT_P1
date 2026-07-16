import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileSpreadsheet, Download, Loader2, CheckCircle2,
  AlertCircle, X, Users, ArrowRight, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'

const STEPS = [
  { key: 'upload', label: 'Upload File' },
  { key: 'validate', label: 'Validate Data' },
  { key: 'import', label: 'Generate Accounts' },
  { key: 'complete', label: 'Completed' },
]

function downloadBase64Excel(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function BulkImportParticipants({ user }) {
  const { success, error: showError } = useToast()
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [summary, setSummary] = useState(null)
  const [errors, setErrors] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const fileRef = useRef(null)

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const reset = () => {
    setStep('upload'); setFile(null); setPreview(null); setSummary(null)
    setErrors([]); setImportResult(null); setLoading(false); setShowPasswords(false)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (['xlsx', 'xls'].includes(ext)) { setFile(f); setErrors([]) }
      else showError('Only .xlsx and .xls files are supported.')
    }
  }, [])

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setErrors([]) }
  }

  const handleValidate = async () => {
    if (!file) { showError('Please select a file first.'); return }
    setLoading(true); setLoadingMsg('Reading and validating Excel file...')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await fetch(API.ADMIN.BULK_VALIDATE, { method: 'POST', headers: auth(), body: formData })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Validation failed')
      setPreview(d.preview)
      setSummary(d.summary)
      setErrors(d.errors || [])
      setStep('validate')
      if (d.summary.validRows === 0) {
        showError('No valid rows found. Check the error details below.')
      }
    } catch (e) {
      showError(e.message)
    } finally { setLoading(false); setLoadingMsg('') }
  }

  const handleImport = async () => {
    const validRows = preview?.filter(r => r.valid) || []
    if (validRows.length === 0) { showError('No valid rows to import.'); return }
    setLoading(true); setLoadingMsg('Generating accounts and passwords...')
    try {
      const r = await fetch(API.ADMIN.BULK_IMPORT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ rows: validRows }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Import failed')
      setImportResult(d)
      setStep('complete')
      success(`Successfully imported ${d.summary.imported} participants!`)
    } catch (e) {
      showError(e.message)
    } finally { setLoading(false); setLoadingMsg('') }
  }

  const stepIndex = STEPS.findIndex(s => s.key === step)
  const validRows = preview?.filter(r => r.valid) || []
  const invalidRows = preview?.filter(r => !r.valid) || []

  return (
    <div className="bulk-import">
      {/* Header */}
      <div className="bulk-import-header">
        <div className="bulk-import-header-icon">
          <FileSpreadsheet size={22} />
        </div>
        <div>
          <h2 className="bulk-import-title">Bulk Import Participants</h2>
          <p className="bulk-import-subtitle">Import hundreds of participants in seconds</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bulk-import-steps">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`bulk-import-step ${i <= stepIndex ? 'bulk-import-step--active' : ''} ${i < stepIndex ? 'bulk-import-step--done' : ''}`}>
            <div className="bulk-import-step-num">
              {i < stepIndex ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className="bulk-import-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div className="bulk-import-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 size={28} className="bulk-spin" />
            <p>{loadingMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step: Upload */}
      {step === 'upload' && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Upload Area */}
          <div
            className={`bulk-import-upload ${dragOver ? 'bulk-import-upload--active' : ''} ${file ? 'bulk-import-upload--has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} hidden />
            {file ? (
              <div className="bulk-import-file-info">
                <FileSpreadsheet size={22} />
                <div className="bulk-import-file-details">
                  <span className="bulk-import-file-name">{file.name}</span>
                  <span className="bulk-import-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button className="bulk-import-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null) }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="bulk-import-upload-content">
                <Upload size={32} />
                <span className="bulk-import-upload-title">Drag & Drop Excel File</span>
                <span className="bulk-import-upload-hint">or click to browse</span>
                <span className="bulk-import-upload-formats">.xlsx, .xls — Maximum 10,000 rows</span>
              </div>
            )}
          </div>

          {/* Download Template */}
          <a href={API.ADMIN.BULK_TEMPLATE} className="bulk-import-template-link" target="_blank" rel="noreferrer">
            <Download size={14} />
            Download Sample Template
          </a>

          {/* Validate Button */}
          <button className="bulk-import-btn bulk-import-btn--primary" onClick={handleValidate} disabled={!file}>
            <ArrowRight size={16} />
            Upload & Validate
          </button>
        </motion.div>
      )}

      {/* Step: Validate */}
      {step === 'validate' && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bulk-import-validate">
          {/* Summary Cards */}
          <div className="bulk-import-stats">
            <div className="bulk-import-stat bulk-import-stat--total">
              <Users size={20} />
              <div><span className="bulk-import-stat-num">{summary.totalRows}</span><span className="bulk-import-stat-label">Total Rows</span></div>
            </div>
            <div className="bulk-import-stat bulk-import-stat--valid">
              <CheckCircle2 size={20} />
              <div><span className="bulk-import-stat-num">{summary.validRows}</span><span className="bulk-import-stat-label">Valid</span></div>
            </div>
            <div className="bulk-import-stat bulk-import-stat--invalid">
              <AlertCircle size={20} />
              <div><span className="bulk-import-stat-num">{summary.invalidRows}</span><span className="bulk-import-stat-label">Invalid</span></div>
            </div>
            {summary.normalizedNames > 0 && (
              <div className="bulk-import-stat bulk-import-stat--info">
                <RefreshCw size={20} />
                <div><span className="bulk-import-stat-num">{summary.normalizedNames}</span><span className="bulk-import-stat-label">Normalized</span></div>
              </div>
            )}
          </div>

          {/* Data Table */}
          {validRows.length > 0 && (
            <div className="bulk-import-table-card">
              <h3 className="bulk-import-table-title">
                <CheckCircle2 size={16} style={{ color: '#059669' }} />
                Valid Participants ({validRows.length})
              </h3>
              <div className="bulk-import-table-wrap">
                <table className="bulk-import-table">
                  <thead>
                    <tr>
                      <th>Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td>{r.row}</td>
                        <td>{r.name} {r.normalizedName && <span className="bulk-import-tag">AI normalized</span>}</td>
                        <td>{r.email}</td>
                        <td>{r.phone}</td>
                        <td>{r.department || '—'}</td>
                        <td>{r.batch || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 100 && <p className="bulk-import-table-more">Showing 100 of {validRows.length} rows</p>}
              </div>
            </div>
          )}

          {/* Error Table */}
          {errors.length > 0 && (
            <div className="bulk-import-table-card bulk-import-table-card--error">
              <h3 className="bulk-import-table-title">
                <AlertCircle size={16} style={{ color: '#dc2626' }} />
                Validation Errors ({errors.length})
              </h3>
              <div className="bulk-import-table-wrap">
                <table className="bulk-import-table">
                  <thead>
                    <tr><th>Row</th><th>Name</th><th>Email</th><th>Issues</th></tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.row}</td>
                        <td>{e.name || '—'}</td>
                        <td>{e.email || '—'}</td>
                        <td><span className="bulk-import-error-text">{e.errors.join('; ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bulk-import-actions">
            <button className="bulk-import-btn bulk-import-btn--secondary" onClick={reset}>
              <RefreshCw size={14} /> Start Over
            </button>
            <button className="bulk-import-btn bulk-import-btn--primary" onClick={handleImport} disabled={validRows.length === 0}>
              <Users size={16} /> Generate {validRows.length} Accounts
            </button>
          </div>
        </motion.div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && importResult && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bulk-import-complete">
          <div className="bulk-import-success-banner">
            <CheckCircle2 size={24} />
            <div>
              <h3>Import Completed Successfully!</h3>
              <p>{importResult.summary.imported} accounts created, {importResult.summary.failed} failed</p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bulk-import-stats">
            <div className="bulk-import-stat bulk-import-stat--total">
              <Users size={20} />
              <div><span className="bulk-import-stat-num">{importResult.summary.totalProcessed}</span><span className="bulk-import-stat-label">Processed</span></div>
            </div>
            <div className="bulk-import-stat bulk-import-stat--valid">
              <CheckCircle2 size={20} />
              <div><span className="bulk-import-stat-num">{importResult.summary.imported}</span><span className="bulk-import-stat-label">Imported</span></div>
            </div>
            {importResult.summary.failed > 0 && (
              <div className="bulk-import-stat bulk-import-stat--invalid">
                <AlertCircle size={20} />
                <div><span className="bulk-import-stat-num">{importResult.summary.failed}</span><span className="bulk-import-stat-label">Failed</span></div>
              </div>
            )}
          </div>

          {/* Credentials Table */}
          {importResult.credentials?.length > 0 && (
            <div className="bulk-import-table-card">
              <div className="bulk-import-table-header">
                <h3 className="bulk-import-table-title">
                  <CheckCircle2 size={16} style={{ color: '#059669' }} />
                  Generated Credentials ({importResult.credentials.length})
                </h3>
                <button className="bulk-import-btn bulk-import-btn--ghost" onClick={() => setShowPasswords(!showPasswords)}>
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPasswords ? 'Hide' : 'Show'} Passwords
                </button>
              </div>
              <div className="bulk-import-table-wrap">
                <table className="bulk-import-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Name</th><th>Email</th><th>Password</th><th>Department</th><th>Batch</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.credentials.map((c, i) => (
                      <tr key={i}>
                        <td><span className="bulk-import-id">{c.participantId}</span></td>
                        <td>{c.name}</td>
                        <td>{c.email}</td>
                        <td><code className="bulk-import-pw">{showPasswords ? c.password : '••••••••••'}</code></td>
                        <td>{c.department || '—'}</td>
                        <td>{c.batch || '—'}</td>
                        <td><span className="bulk-import-status bulk-import-status--created">{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Download Actions */}
          <div className="bulk-import-actions">
            <button className="bulk-import-btn bulk-import-btn--secondary" onClick={reset}>
              <RefreshCw size={14} /> Import More
            </button>
            {importResult.credentialExcel && (
              <button className="bulk-import-btn bulk-import-btn--primary" onClick={() => downloadBase64Excel(importResult.credentialExcel, 'Participant_Credentials.xlsx')}>
                <Download size={16} /> Download Credentials
              </button>
            )}
            {importResult.errorExcel && (
              <button className="bulk-import-btn bulk-import-btn--danger" onClick={() => downloadBase64Excel(importResult.errorExcel, 'Failed_Participants.xlsx')}>
                <Download size={16} /> Download Error Report
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
