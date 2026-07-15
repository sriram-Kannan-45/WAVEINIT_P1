/**
 * SessionLockedModal.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Shown when POST /api/ai-quiz/participant/start/:quizId returns HTTP 423
 * with `{ error: 'SESSION_LOCKED' }`. The participant tried to start an
 * assessment that's already active on a different device or browser.
 *
 * No "retry" button — the only path forward is admin reset.
 *
 * Props:
 *   open         boolean
 *   lockedAt     ISO string (when the original session was locked)
 *   onCancel     fn() → closes the modal and returns to the dashboard
 *
 * The modal portals into document.body so it floats above any container
 * (consent gate, dashboard, etc.) without being clipped by overflow rules.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertTriangle, ShieldAlert } from 'lucide-react';
import '../../styles/assessment-consent.css';

function fmtLockedAt(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function SessionLockedModal({ open, lockedAt, onCancel }) {
  // ESC closes; lock body scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="bg"
          className="ac-backdrop ac-backdrop--locked"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="slk-title"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="ac-card ac-card--locked"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ac-locked__icon-wrap" aria-hidden>
              <Lock size={28} />
            </div>

            <h2 id="slk-title" className="ac-locked__title">
              Assessment Already Active on Another Device
            </h2>

            <p className="ac-locked__lead">
              This assessment session is currently locked to another device or
              browser. You cannot access it from this device.
            </p>

            <div className="ac-locked__hint">
              <ShieldAlert size={15} aria-hidden />
              <span>
                If you believe this is an error or you have changed devices,
                please contact your administrator to request a device reset.
              </span>
            </div>

            <div className="ac-locked__meta">
              <AlertTriangle size={13} aria-hidden />
              Session started: <strong>{fmtLockedAt(lockedAt)}</strong>
            </div>

            <div className="ac-locked__actions">
              <button
                type="button"
                className="ac-btn ac-btn--primary ac-btn--block"
                onClick={onCancel}
                autoFocus
              >
                OK, Return to Dashboard
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
