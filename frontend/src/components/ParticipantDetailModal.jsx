import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, X } from 'lucide-react';
import { API_BASE, assetUrl } from '../api/api';

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleString();
}

function formatTime(ts) {
  if (!ts) return '-';
  const date = new Date(ts);
  return date.toLocaleTimeString();
}

export default function ParticipantDetailModal({ participant, token, onClose, onAction }) {
  const [screenshots, setScreenshots] = useState([]);
  const [violations, setViolations] = useState([]);
  const [warningText, setWarningText] = useState('');
  const [activeTab, setActiveTab] = useState('violations');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!participant?.id) return;

    let aborted = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const targetId = participant.attemptId || participant.id;
        const [ssRes, vRes] = await Promise.all([
          axios.get(`${API_BASE}/trainer/participants/${targetId}/screenshots`, {
            headers: authHeaders(token),
          }),
          axios.get(`${API_BASE}/trainer/participants/${targetId}/violations`, {
            headers: authHeaders(token),
          }),
        ]);
        if (!aborted) {
          setScreenshots(ssRes.data?.screenshots || []);
          setViolations(vRes.data?.violations || []);
        }
      } catch (err) {
        console.error('Failed to load participant details:', err);
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      aborted = true;
    };
  }, [participant?.id, token]);

  if (!participant) return null;

  return (
    <div className="reg-modal-overlay" style={{ zIndex: 60 }}>
      <div
        className="reg-modal"
        style={{ maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="reg-modal-header" style={{ flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h3>{participant.name}</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{participant.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Info section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '14px 22px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>Started at</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginTop: 2 }}>{formatDate(participant.startedAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>Time remaining</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginTop: 2 }}>{participant.timeRemaining}s</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>Violations</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginTop: 2 }}>{participant.violationCount}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '12px 22px 0', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div className="reg-admin-filter-tabs">
            {[
              { id: 'violations', label: 'Violation Log' },
              { id: 'screenshots', label: 'Screenshots' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`reg-admin-filter-tab ${activeTab === tab.id ? 'reg-admin-filter-tab--active' : ''}`}
                style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0', color: '#64748b' }}>
              <Loader2 size={18} className="reg-spin" />
              <span style={{ fontSize: 13 }}>Loading…</span>
            </div>
          ) : activeTab === 'violations' ? (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table className="reg-admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Type</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 14px', borderBottom: 'none' }}>
                        No violations recorded
                      </td>
                    </tr>
                  )}
                  {violations.map((v, idx) => (
                    <tr key={v.id}>
                      <td style={{ color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ textTransform: 'capitalize' }}>{v.type.replace(/_/g, ' ')}</td>
                      <td style={{ color: '#64748b' }}>{formatTime(v.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {screenshots.length === 0 && (
                <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: 0, padding: '16px 0' }}>
                  No screenshots yet
                </p>
              )}
              {screenshots.map((ss) => (
                <div key={ss.id} style={{ borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 8 }}>
                  <img
                    src={assetUrl(ss.filePath)}
                    alt={`Screenshot at ${formatTime(ss.timestamp)}`}
                    style={{ aspectRatio: '16 / 9', width: '100%', objectFit: 'cover', borderRadius: 6, marginBottom: 6, display: 'block' }}
                  />
                  <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', margin: 0 }}>{formatTime(ss.timestamp)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '16px 22px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => onAction('flag', participant.id)}
              className="reg-admin-btn"
              style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d', cursor: 'pointer' }}
            >
              Flag Participant
            </button>
            <button
              type="button"
              onClick={() => onAction('disqualify', participant.id)}
              className="reg-admin-btn reg-admin-btn--danger"
              style={{ cursor: 'pointer' }}
            >
              Disqualify
            </button>
            <button
              type="button"
              onClick={() => onAction('force-submit', participant.id)}
              className="reg-admin-btn reg-admin-btn--secondary"
              style={{ cursor: 'pointer' }}
            >
              Force Submit
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={warningText}
              onChange={(e) => setWarningText(e.target.value)}
              placeholder="Warning message…"
              className="reg-input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => {
                onAction('warn', participant.id, warningText);
                setWarningText('');
              }}
              disabled={!warningText.trim()}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{ cursor: warningText.trim() ? 'pointer' : 'not-allowed', opacity: warningText.trim() ? 1 : 0.5 }}
            >
              Send Warning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
