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
import {
  RefreshCw, Lock, AlertTriangle, ShieldCheck, Loader2, Search, X,
} from 'lucide-react';
import { API_BASE } from '../../api/api';
import { getAuthHeaders } from '../../api/request';
import { useToast } from '../Toast';

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

const pillStyles = {
  ACTIVE: { background: '#f0fdf4', color: '#15803d' },
  EXPIRED: { background: '#f1f5f9', color: '#64748b' },
  RESET: { background: '#eff6ff', color: '#1d4ed8' },
};

function StatusPill({ status }) {
  const style = pillStyles[status] || { background: '#f1f5f9', color: '#475569' };
  return (
    <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-primary)', ...style }}>
      {status}
    </span>
  );
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
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
          <Lock size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="reg-admin-title">Assessment Sessions</h1>
          <p className="reg-admin-subtitle">Active device locks for in-progress quiz attempts.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div className="reg-admin-search" style={{ width: 250 }}>
            <Search size={14} />
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => fetchSessions()}
            className="reg-admin-btn reg-admin-btn--secondary"
            disabled={refreshing}
            aria-label="Refresh sessions"
            style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <RefreshCw size={14} className={refreshing ? 'reg-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="reg-admin-loading">
          <Loader2 size={18} className="reg-spin" />
          <span>Loading active sessions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="reg-admin-empty">
          <ShieldCheck size={30} />
          <h3>No active sessions</h3>
          <p>
            {sessions.length === 0
              ? 'No participants have an active assessment lock right now.'
              : 'No sessions match your search.'}
          </p>
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Quiz</th>
                <th>IP Address</th>
                <th>Device</th>
                <th>Started At</th>
                <th>Expires At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: 13.5, color: '#0f172a', fontFamily: 'var(--font-primary)' }}>{s.participantName || 'Unknown'}</strong>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'var(--font-primary)' }}>{s.participantEmail || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span title={s.quizTitle} style={{ fontSize: 13, color: '#334155', fontFamily: 'var(--font-primary)' }}>
                      {s.quizTitle}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#475569' }}>{s.ipAddress || '—'}</td>
                  <td>
                    <span title={s.userAgent || ''} style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>
                      {shortenUA(s.userAgent)}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#475569' }}>{fmtDateTime(s.lockedAt)}</td>
                  <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#475569' }}>{fmtDateTime(s.expiresAt)}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td>
                    {s.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="reg-admin-btn reg-admin-btn--danger"
                        onClick={() => setConfirmTarget(s)}
                        style={{ cursor: 'pointer' }}
                      >
                        Reset Session
                      </button>
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      {confirmTarget && (
        <div
          className="reg-modal-overlay"
          onClick={() => !resetting && setConfirmTarget(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="as-confirm-title"
            className="reg-modal reg-modal--small"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reg-modal-header">
              <h3 id="as-confirm-title">Reset session for {confirmTarget.participantName}?</h3>
              <button type="button" onClick={() => setConfirmTarget(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={16} />
              </button>
            </div>
            <div className="reg-modal-body">
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12 }}>
                <AlertTriangle size={17} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 13, color: '#7c2d12', lineHeight: 1.55, fontFamily: 'var(--font-primary)' }}>
                  Reset session for <strong>{confirmTarget.participantName}</strong> on quiz{' '}
                  <strong>{confirmTarget.quizTitle}</strong>? This will allow the participant
                  to restart from a new device.
                </p>
              </div>
            </div>
            <div className="reg-modal-footer">
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={resetting}
                style={{ cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--danger"
                onClick={handleConfirmReset}
                disabled={resetting}
                style={{ cursor: 'pointer' }}
              >
                {resetting ? (
                  <><Loader2 size={14} className="reg-spin" /> Resetting…</>
                ) : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
