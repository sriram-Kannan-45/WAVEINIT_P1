import { useState, useRef, useCallback } from 'react'
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

function StatCard({ icon: Icon, bg, color, value, label }) {
  return (
    <div className="reg-admin-stat">
      <div className="reg-admin-stat-icon" style={{ background: bg, color: color }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="reg-admin-stat-num">{value}</div>
        <div className="reg-admin-stat-label">{label}</div>
      </div>
    </div>
  )
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
  }, [showError])

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

  return (
    <div className="reg-admin" style={{ position: 'relative' }}>
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon">
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h1 className="reg-admin-title">Bulk Import Participants</h1>
          <p className="reg-admin-subtitle">Import hundreds of participants in seconds</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ width: 24, height: 2, borderRadius: 2, background: i <= stepIndex ? '#16a34a' : '#e2e8f0' }} />}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999,
                background: i <= stepIndex ? '#f0fdf4' : '#f1f5f9',
                border: `1px solid ${i <= stepIndex ? '#bbf7d0' : '#e2e8f0'}`,
                fontFamily: 'var(--font-primary)',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i < stepIndex ? '#16a34a' : i === stepIndex ? '#16a34a' : '#e2e8f0',
                color: i <= stepIndex ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700,
              }}>
                {i < stepIndex ? <CheckCircle2 size={12} /> : i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: i <= stepIndex ? '#15803d' : '#64748b' }}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="reg-modal-overlay">
          <div className="reg-admin-table-wrap" style={{ minWidth: 320 }}>
            <div className="reg-admin-loading">
              <Loader2 size={22} className="bulk-spin" />
              <span>{loadingMsg}</span>
            </div>
          </div>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && !loading && (
        <div>
          {/* Upload Area */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload Excel file"
            onKeyDown={(e) => { if (e.key === 'Enter' && !file) fileRef.current?.click() }}
            className="reg-admin-table-wrap"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
            style={{
              borderStyle: 'dashed', cursor: file ? 'default' : 'pointer', textAlign: 'center',
              padding: '48px 24px', borderColor: dragOver ? '#16a34a' : file ? '#86efac' : '#cbd5e1',
              background: dragOver ? '#f0fdf4' : file ? '#f0fdf4' : '#fff',
              transition: 'all 150ms ease',
            }}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} hidden />
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileSpreadsheet size={22} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-primary)' }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-primary)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button className="reg-admin-btn reg-admin-btn--secondary" type="button" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setFile(null) }}>
                  <X size={14} /> Remove
                </button>
              </div>
            ) : (
              <div>
                <Upload size={34} style={{ color: '#94a3b8' }} />
                <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600, color: '#334155', fontFamily: 'var(--font-primary)' }}>Drag & Drop Excel File</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, fontFamily: 'var(--font-primary)' }}>or click to browse</div>
                <div style={{ marginTop: 12, display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-primary)' }}>
                  .xlsx, .xls — Maximum 10,000 rows
                </div>
              </div>
            )}
          </div>

          {/* Download Template */}
          <div style={{ marginTop: 14 }}>
            <a href={API.ADMIN.BULK_TEMPLATE} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#0d9488', textDecoration: 'none', fontFamily: 'var(--font-primary)' }}>
              <Download size={14} /> Download Sample Template
            </a>
          </div>

          {/* Validate Button */}
          <div style={{ marginTop: 20 }}>
            <button className="reg-admin-btn reg-admin-btn--primary" type="button" onClick={handleValidate} disabled={!file} style={{ cursor: file ? 'pointer' : 'not-allowed' }}>
              <ArrowRight size={15} /> Upload & Validate
            </button>
          </div>
        </div>
      )}

      {/* Step: Validate */}
      {step === 'validate' && !loading && (
        <div>
          {/* Summary Cards */}
          <div className="reg-admin-stats" style={{ marginBottom: 16 }}>
            <StatCard icon={Users} bg="#f0f9ff" color="#0284c7" value={summary.totalRows} label="Total Rows" />
            <StatCard icon={CheckCircle2} bg="#f0fdf4" color="#16a34a" value={summary.validRows} label="Valid" />
            <StatCard icon={AlertCircle} bg="#fef2f2" color="#dc2626" value={summary.invalidRows} label="Invalid" />
            {summary.normalizedNames > 0 && (
              <StatCard icon={RefreshCw} bg="#eff6ff" color="#2563eb" value={summary.normalizedNames} label="Normalized" />
            )}
          </div>

          {/* Data Table */}
          {validRows.length > 0 && (
            <div className="reg-admin-table-wrap" style={{ marginBottom: 16 }}>
              <div className="reg-card-header">
                <h3 className="reg-card-title">
                  <CheckCircle2 size={15} style={{ color: '#059669', verticalAlign: '-2px', marginRight: 6 }} />
                  Valid Participants ({validRows.length})
                </h3>
              </div>
              <div className="reg-admin-table-wrap" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th>Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td>{r.row}</td>
                        <td>
                          {r.name}
                          {r.normalizedName && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#2563eb', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-primary)' }}>Normalized</span>}
                        </td>
                        <td>{r.email}</td>
                        <td>{r.phone}</td>
                        <td>{r.department || '—'}</td>
                        <td>{r.batch || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 100 && (
                  <div className="reg-card-body" style={{ paddingTop: 8, fontSize: 12, color: '#94a3b8', fontFamily: 'var(--font-primary)' }}>
                    Showing 100 of {validRows.length} rows
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Table */}
          {errors.length > 0 && (
            <div className="reg-admin-table-wrap" style={{ marginBottom: 16, border: '1px solid #fecaca' }}>
              <div className="reg-card-header">
                <h3 className="reg-card-title" style={{ color: '#dc2626' }}>
                  <AlertCircle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Validation Errors ({errors.length})
                </h3>
              </div>
              <div className="reg-admin-table-wrap" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                <table className="reg-admin-table">
                  <thead>
                    <tr><th>Row</th><th>Name</th><th>Email</th><th>Issues</th></tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.row}</td>
                        <td>{e.name || '—'}</td>
                        <td>{e.email || '—'}</td>
                        <td><span style={{ fontSize: 12, color: '#dc2626', fontFamily: 'var(--font-primary)' }}>{e.errors.join('; ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="reg-form-actions">
            <button className="reg-admin-btn reg-admin-btn--secondary" type="button" onClick={reset} style={{ cursor: 'pointer' }}>
              <RefreshCw size={14} /> Start Over
            </button>
            <button className="reg-admin-btn reg-admin-btn--primary" type="button" onClick={handleImport} disabled={validRows.length === 0} style={{ cursor: validRows.length ? 'pointer' : 'not-allowed' }}>
              <Users size={15} /> Generate {validRows.length} Accounts
            </button>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && importResult && !loading && (
        <div>
          {/* Success Banner */}
          <div className="reg-admin-table-wrap" style={{ marginBottom: 16, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
              <CheckCircle2 size={26} style={{ color: '#16a34a' }} />
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#166534', fontFamily: 'var(--font-primary)', margin: 0 }}>Import Completed Successfully!</h3>
                <p style={{ fontSize: 13, color: '#15803d', margin: '2px 0 0', fontFamily: 'var(--font-primary)' }}>{importResult.summary.imported} accounts created, {importResult.summary.failed} failed</p>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="reg-admin-stats" style={{ marginBottom: 16 }}>
            <StatCard icon={Users} bg="#f0f9ff" color="#0284c7" value={importResult.summary.totalProcessed} label="Processed" />
            <StatCard icon={CheckCircle2} bg="#f0fdf4" color="#16a34a" value={importResult.summary.imported} label="Imported" />
            {importResult.summary.failed > 0 && (
              <StatCard icon={AlertCircle} bg="#fef2f2" color="#dc2626" value={importResult.summary.failed} label="Failed" />
            )}
          </div>

          {/* Credentials Table */}
          {importResult.credentials?.length > 0 && (
            <div className="reg-admin-table-wrap" style={{ marginBottom: 16 }}>
              <div className="reg-card-header">
                <h3 className="reg-card-title">
                  <CheckCircle2 size={15} style={{ color: '#059669', verticalAlign: '-2px', marginRight: 6 }} />
                  Generated Credentials ({importResult.credentials.length})
                </h3>
                <button className="reg-admin-btn reg-admin-btn--secondary" type="button" onClick={() => setShowPasswords(!showPasswords)} style={{ cursor: 'pointer' }}>
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPasswords ? 'Hide' : 'Show'} Passwords
                </button>
              </div>
              <div className="reg-admin-table-wrap" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Name</th><th>Email</th><th>Password</th><th>Department</th><th>Batch</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.credentials.map((c, i) => (
                      <tr key={i}>
                        <td><span style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#334155', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{c.participantId}</span></td>
                        <td>{c.name}</td>
                        <td>{c.email}</td>
                        <td><code style={{ fontSize: 12, background: '#f8fafc', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>{showPasswords ? c.password : '••••••••••'}</code></td>
                        <td>{c.department || '—'}</td>
                        <td>{c.batch || '—'}</td>
                        <td><span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-primary)', background: '#f0fdf4', color: '#15803d' }}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Download Actions */}
          <div className="reg-form-actions">
            <button className="reg-admin-btn reg-admin-btn--secondary" type="button" onClick={reset} style={{ cursor: 'pointer' }}>
              <RefreshCw size={14} /> Import More
            </button>
            {importResult.credentialExcel && (
              <button className="reg-admin-btn reg-admin-btn--primary" type="button" onClick={() => downloadBase64Excel(importResult.credentialExcel, 'Participant_Credentials.xlsx')} style={{ cursor: 'pointer' }}>
                <Download size={15} /> Download Credentials
              </button>
            )}
            {importResult.errorExcel && (
              <button className="reg-admin-btn reg-admin-btn--danger" type="button" onClick={() => downloadBase64Excel(importResult.errorExcel, 'Failed_Participants.xlsx')} style={{ cursor: 'pointer' }}>
                <Download size={15} /> Download Error Report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
