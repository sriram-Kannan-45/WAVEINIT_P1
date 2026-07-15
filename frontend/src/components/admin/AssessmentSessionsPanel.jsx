/**
 * AssessmentSessionsPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Admin / trainer view of currently-active assessment sessions. Polls
 * /api/ai-quiz/admin/locked-sessions every 30 seconds and exposes a
 * per-row "Reset Session" action backed by
 * POST /api/ai-quiz/admin/reset-session/:sessionId.
 *
 * Resetting a session frees the participant from their old device-lock so
 * they can restart the exam from a different device or browser.
 *
 * Mounted inside AdminDashboard via the 'sessions' tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Lock, AlertTriangle, ShieldCheck, Loader2, Search, X,
} from 'lucide-react';
import { API_BASE } from '../../api/api';
import { getAuthHeaders } from '../../api/request';
import { useToast } from '../Toast';
import '../../styles/admin-sessions.css';

const POLL_MS = 30_000;

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function shortenUA(ua) {
  if (!ua) return '—';
  // Best-effort browser/OS extraction without a UA-parser dependency.
  const trimmed = ua.length > 90 ? ua.slice(0, 90) + '…' : ua;
  return trimmed;
}

function StatusPill({ status }) {
  const cls = {
    ACTIVE: 'as-pill as-pill--green',
    EXPIRED: 'as-pill as-pill--grey',
    RESET: 'as-pill as-pill--blue',
  }[status] || 'as-pill';
  return <span className={cls}>{status}</span>;
}

export default function AssessmentSessionsPanel() {
  const { success, error: showError } = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null); // session row
  const [resetting, setResetting] = useState(false);
  const pollHandle = useRef(null);

  const fetchSessions = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/ai-quiz/admin/locked-sessions`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sessions');
      setSessions(data.sessions || []);
    } catch (err) {
      showError(err.message || 'Could not load assessment sessions');
    } finally {
      if (initial) setLoading(false); else setRefreshing(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchSessions({ initial: true });
    pollHandle.current = setInterval(() => fetchSessions(), POLL_MS);
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, [fetchSessions]);

  const handleConfirmReset = async () => {
    if (!confirmTarget) return;
    setResetting(true);
    try {
      const res = await fetch(
        `${API_BASE}/ai-quiz/admin/reset-session/${confirmTarget.id}`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Admin override from sessions panel' }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      success(data.message || 'Session reset. Participant can now log in from a new device.');
      // Optimistic: mark this row's status as RESET locally; full refresh
      // happens on the next 30-second tick.
      setSessions((prev) => prev.map((s) => (s.id === confirmTarget.id ? { ...s, status: 'RESET' } : s)));
      setConfirmTarget(null);
    } catch (err) {
      showError(err.message || 'Could not reset session');
    } finally {
      setResetting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter((s) =>
      [s.participantName, s.participantEmail, s.quizTitle, s.ipAddress]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [sessions, search]);

  return (
    <div className="as-panel">
      {/* Header */}
      <div className="as-header">
        <div className="as-header__title">
          <Lock size={18} className="as-header__icon" aria-hidden />
          <div>
            <h2>Assessment Sessions</h2>
            <p>Active device locks for in-progress quiz attempts.</p>
          </div>
        </div>
        <div className="as-header__actions">
          <div className="as-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              placeholder="Search by name, email, quiz, or IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sessions"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="as-search__clear"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => fetchSessions()}
            className="as-btn as-btn--ghost"
            disabled={refreshing}
            aria-label="Refresh sessions"
          >
            <RefreshCw size={13} className={refreshing ? 'as-spin' : ''} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="as-state">
          <Loader2 size={20} className="as-spin" aria-hidden />
          <span>Loading active sessions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="as-state as-state--empty">
          <ShieldCheck size={28} aria-hidden />
          <h3>No active sessions</h3>
          <p>
            {sessions.length === 0
              ? 'No participants have an active assessment lock right now.'
              : 'No sessions match your search.'}
          </p>
        </div>
      ) : (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Quiz</th>
                <th>IP Address</th>
                <th>Device</th>
                <th>Started At</th>
                <th>Expires At</th>
                <th>Status</th>
                <th className="as-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((s) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    layout
                  >
                    <td>
                      <div className="as-cell-stack">
                        <strong>{s.participantName || 'Unknown'}</strong>
                        <span className="as-muted">{s.participantEmail || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span title={s.quizTitle} className="as-quiz-title">
                        {s.quizTitle}
                      </span>
                    </td>
                    <td className="as-mono">{s.ipAddress || '—'}</td>
                    <td>
                      <span className="as-ua" title={s.userAgent || ''}>
                        {shortenUA(s.userAgent)}
                      </span>
                    </td>
                    <td className="as-mono">{fmtDateTime(s.lockedAt)}</td>
                    <td className="as-mono">{fmtDateTime(s.expiresAt)}</td>
                    <td><StatusPill status={s.status} /></td>
                    <td className="as-table__actions">
                      {s.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="as-btn as-btn--danger"
                          onClick={() => setConfirmTarget(s)}
                        >
                          Reset Session
                        </button>
                      ) : (
                        <span className="as-muted">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmTarget && (
          <motion.div
            key="bg"
            className="as-modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !resetting && setConfirmTarget(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="as-confirm-title"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              className="as-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="as-modal__icon" aria-hidden>
                <AlertTriangle size={22} />
              </div>
              <h3 id="as-confirm-title" className="as-modal__title">
                Reset session for {confirmTarget.participantName}?
              </h3>
              <p className="as-modal__lead">
                Reset session for <strong>{confirmTarget.participantName}</strong> on quiz
                <strong> {confirmTarget.quizTitle}</strong>? This will allow the participant
                to restart from a new device.
              </p>
              <div className="as-modal__actions">
                <button
                  type="button"
                  className="as-btn as-btn--ghost"
                  onClick={() => setConfirmTarget(null)}
                  disabled={resetting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="as-btn as-btn--danger"
                  onClick={handleConfirmReset}
                  disabled={resetting}
                >
                  {resetting ? (
                    <><Loader2 size={13} className="as-spin" aria-hidden /> Resetting…</>
                  ) : 'Confirm Reset'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
