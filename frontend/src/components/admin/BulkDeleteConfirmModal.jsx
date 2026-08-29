import React from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, Loader2 } from 'lucide-react';

/**
 * BulkDeleteConfirmModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Confirmation modal for multi-select bulk deletions.
 * Provides clear count warning, permanent deletion notice, loading state,
 * and detailed dependency feedback if any records could not be deleted.
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
  if (!open) return null;

  const displayTitle = title || `Delete ${count} Selected ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}${count > 1 ? 's' : ''}?`;

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
        style={{ maxWidth: failedItems && failedItems.length > 0 ? '560px' : '440px', width: '90%' }}
      >
        <div className="reg-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #fee2e2', background: '#fff5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Trash2 size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#991b1b' }}>
              {displayTitle}
            </h3>
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="reg-modal-body" style={{ padding: '20px' }}>
          {failedItems && failedItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.5 }}>
                  <strong>Dependency Notice:</strong> The following {failedItems.length} {itemType}(s) could not be deleted because they are connected to active course enrollments, quiz attempts, or assigned LMS records:
                </div>
              </div>

              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', background: '#f8fafc' }}>
                {failedItems.map((item, idx) => (
                  <div key={item.id || idx} style={{ padding: '8px 0', borderBottom: idx < failedItems.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      {item.name || item.title || `ID: ${item.id}`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {item.reason || 'Referenced in active records.'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: '0 0 12px' }}>
                Are you sure you want to permanently delete <strong style={{ color: '#dc2626' }}>{count} selected {itemType}{count > 1 ? 's' : ''}</strong>?
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
                <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                <span>
                  This action cannot be undone. Records with active dependencies will be checked for data integrity before deletion.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="reg-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
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

          {(!failedItems || failedItems.length === 0) && (
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--danger"
              onClick={onConfirm}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={15} />
                  Confirm Delete ({count})
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
