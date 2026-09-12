import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, Loader2, Zap, ShieldAlert, ShieldCheck } from 'lucide-react';

/**
 * BulkDeleteConfirmModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Confirmation modal for deletions with dual options always available:
 * 1. Safe Delete (integrity protection - checks active dependencies)
 * 2. Force Delete (bypasses dependency checks, cascades all linked enrollments/attempts)
 */
export default function BulkDeleteConfirmModal({
  open = false,
  title = '',
  count = 0,
  itemType = 'record',
  onClose,
  onConfirm,
  loading = false,
  failedItems = null,
  onClearFailed,
}) {
  const [selectedMode, setSelectedMode] = useState('safe'); // 'safe' | 'force'

  useEffect(() => {
    setSelectedMode('safe');
  }, [open, failedItems]);

  if (!open) return null;

  const countDisplay = count > 1 ? ` (${count})` : '';
  const displayTitle = title || `Delete ${count > 1 ? `${count} Selected ` : ''}${itemType.charAt(0).toUpperCase() + itemType.slice(1)}${count > 1 ? 's' : ''}?`;

  const handleSafeDelete = () => {
    if (onConfirm) onConfirm(false);
  };

  const handleForceDelete = (overrideIds = null) => {
    if (onConfirm) onConfirm(true, overrideIds);
  };

  return (
    <div
      className="reg-modal-overlay"
      onClick={() => {
        if (!loading) {
          if (failedItems && onClearFailed) onClearFailed();
          onClose();
        }
      }}
      style={{ zIndex: 9999 }}
    >
      <div
        className="reg-modal reg-modal--small"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: failedItems && failedItems.length > 0 ? '600px' : '520px',
          width: '92%',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Modal Header */}
        <div
          className="reg-modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #fee2e2',
            background: selectedMode === 'force' || (failedItems && failedItems.length > 0) ? '#fff1f2' : '#fff5f5',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: selectedMode === 'force' ? '#fee2e2' : '#fef2f2',
                color: selectedMode === 'force' ? '#dc2626' : '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: `1.5px solid ${selectedMode === 'force' ? '#fca5a5' : '#fecaca'}`,
              }}
            >
              {selectedMode === 'force' ? <Zap size={20} /> : <Trash2 size={20} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#991b1b', lineHeight: 1.2 }}>
                {displayTitle}
              </h3>
              <span style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: 500 }}>
                {failedItems && failedItems.length > 0
                  ? 'Active Dependency Notice'
                  : 'Choose Safe Delete or Force Delete'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!loading) {
                if (failedItems && onClearFailed) onClearFailed();
                onClose();
              }
            }}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#64748b',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="reg-modal-body" style={{ padding: '20px' }}>
          {failedItems && failedItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px',
                  background: '#fef2f2',
                  border: '1.5px solid #fecaca',
                  borderRadius: '10px',
                }}
              >
                <AlertTriangle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.5 }}>
                  <strong>Integrity Protection Activated:</strong> The following{' '}
                  <strong>{failedItems.length} {itemType}(s)</strong> were protected from safe deletion because active student enrollments, quiz attempts, or course records depend on them:
                </div>
              </div>

              <div
                style={{
                  maxHeight: '190px',
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  background: '#f8fafc',
                }}
              >
                {failedItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      padding: '8px 0',
                      borderBottom: idx < failedItems.length - 1 ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                      {item.name || item.title || `ID: ${item.id}`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {item.reason || 'Referenced in active LMS records.'}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  color: '#92400e',
                  lineHeight: 1.45,
                }}
              >
                <ShieldAlert size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Force Delete Option:</strong> Click <strong>"Force Delete Protected Items"</strong> below to override dependency protection and cascade all enrollments, quiz attempts, and student submissions.
                </span>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, margin: '0 0 16px' }}>
                Please select how you want to proceed with deleting{' '}
                <strong style={{ color: '#b91c1c' }}>
                  {count > 1 ? `${count} selected ${itemType}s` : `this ${itemType}`}
                </strong>. Both Safe Delete and Force Delete options are available below:
              </p>

              {/* Dual Option Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                {/* Option 1: Safe Delete Card */}
                <div
                  onClick={() => setSelectedMode('safe')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: `2px solid ${selectedMode === 'safe' ? '#2563eb' : '#e2e8f0'}`,
                    background: selectedMode === 'safe' ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <input
                    type="radio"
                    id="safe-delete-radio"
                    name="delete-mode-selector"
                    checked={selectedMode === 'safe'}
                    onChange={() => setSelectedMode('safe')}
                    style={{ marginTop: '3px', accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label
                        htmlFor="safe-delete-radio"
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: selectedMode === 'safe' ? '#1e40af' : '#1e293b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <ShieldCheck size={16} color={selectedMode === 'safe' ? '#2563eb' : '#64748b'} />
                        Safe Delete (Integrity Protection)
                      </label>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#dcfce7',
                          color: '#166534',
                          padding: '2px 8px',
                          borderRadius: '12px',
                        }}
                      >
                        Recommended
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                      Validates data integrity before deleting. If active student enrollments, quiz attempts, or course records exist, deletion is safely prevented and details are displayed.
                    </p>
                  </div>
                </div>

                {/* Option 2: Force Delete Card */}
                <div
                  onClick={() => setSelectedMode('force')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: `2px solid ${selectedMode === 'force' ? '#ef4444' : '#e2e8f0'}`,
                    background: selectedMode === 'force' ? '#fef2f2' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <input
                    type="radio"
                    id="force-delete-radio"
                    name="delete-mode-selector"
                    checked={selectedMode === 'force'}
                    onChange={() => setSelectedMode('force')}
                    style={{ marginTop: '3px', accentColor: '#dc2626', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label
                        htmlFor="force-delete-radio"
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: selectedMode === 'force' ? '#991b1b' : '#1e293b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Zap size={16} color={selectedMode === 'force' ? '#dc2626' : '#64748b'} />
                        Force Delete (Cascade All Dependencies)
                      </label>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#fee2e2',
                          color: '#991b1b',
                          padding: '2px 8px',
                          borderRadius: '12px',
                        }}
                      >
                        ⚡ Cascade
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: selectedMode === 'force' ? '#b91c1c' : '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                      Bypasses integrity checks. Permanently purges and cascades all dependent student enrollments, exam submissions, quiz attempts, progress, and assignments.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informational callout based on active choice */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: selectedMode === 'force' ? '#fff1f2' : '#f0fdf4',
                  color: selectedMode === 'force' ? '#9f1239' : '#166534',
                  border: `1px solid ${selectedMode === 'force' ? '#fecdd3' : '#bbf7d0'}`,
                }}
              >
                {selectedMode === 'force' ? <Zap size={14} /> : <AlertCircle size={14} />}
                <span>
                  {selectedMode === 'force'
                    ? 'Click "Force Delete" to cascade and delete without restriction.'
                    : 'Click "Safe Delete" to check for dependencies and delete safely.'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with selected action button based on user radio choice */}
        <div
          className="reg-modal-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '14px 20px',
            borderTop: '1px solid #f1f5f9',
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={() => {
              if (failedItems && onClearFailed) onClearFailed();
              onClose();
            }}
            disabled={loading}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600 }}
          >
            {failedItems && failedItems.length > 0 ? 'Close' : 'Cancel'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {failedItems && failedItems.length > 0 ? (
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--danger"
                onClick={() => handleForceDelete(failedItems.map((item) => item.id))}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Force Deleting...
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    Force Delete Protected Items ({failedItems.length})
                  </>
                )}
              </button>
            ) : selectedMode === 'safe' ? (
              /* ── Show Safe Delete Button only when Safe Delete is selected ── */
              <button
                type="button"
                onClick={handleSafeDelete}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
                  transition: 'all 0.15s ease',
                }}
                title="Integrity check enabled. Protects records with active enrollments."
              >
                {loading ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Deleting...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} color="#ffffff" />
                    Safe Delete{countDisplay}
                  </>
                )}
              </button>
            ) : (
              /* ── Show Force Delete Button only when Force Delete is selected ── */
              <button
                type="button"
                onClick={() => handleForceDelete()}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
                  transition: 'all 0.15s ease',
                }}
                title="Cascade delete all dependencies, enrollments, and quiz attempts immediately."
              >
                {loading ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Force Deleting...
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    Force Delete{countDisplay}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
