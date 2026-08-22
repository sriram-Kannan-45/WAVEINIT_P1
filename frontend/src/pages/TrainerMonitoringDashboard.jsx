import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Camera, Loader2, MonitorPlay, Users } from 'lucide-react';
import { API_BASE } from '../api/api';
import { useSocket } from '../hooks/useSocket';
import ParticipantCard from '../components/ParticipantCard';
import ParticipantDetailModal from '../components/ParticipantDetailModal';

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export default function TrainerMonitoringDashboard({ user }) {
  const token = user?.token;
  const socket = useSocket(token);

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE}/trainer/sessions`, { headers: authHeaders(token) })
      .then((res) => setSessions(res.data?.sessions || []))
      .catch((err) => console.error('Failed to load sessions:', err));
  }, [token]);

  useEffect(() => {
    if (!selectedSessionId || !token) return;

    let aborted = false;
    const fetchParticipants = async () => {
      setLoading(true);
      try {
        const res = await axios.get(
          `${API_BASE}/trainer/sessions/${selectedSessionId}/participants`,
          { headers: authHeaders(token) }
        );
        if (!aborted) {
          setParticipants(res.data?.participants || []);
        }
      } catch (err) {
        console.error('Failed to load participants:', err);
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchParticipants();
    return () => {
      aborted = true;
    };
  }, [selectedSessionId, token]);

  useEffect(() => {
    if (!socket || !selectedSessionId) return;

    socket.emit('join-trainer-room', { sessionId: selectedSessionId });

    const onNewFrame = ({ participantId, imageBase64, timestamp }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? { ...p, latestScreenshot: imageBase64, lastSeen: timestamp }
            : p
        )
      );
    };

    const onViolation = ({ participantId, type, timestamp }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? {
                ...p,
                violationCount: p.violationCount + 1,
                lastViolation: { type, timestamp },
              }
            : p
        )
      );
    };

    const onTestSubmitted = ({ participantId, score, submittedAt, autoSubmitted }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? {
                ...p,
                status: 'Submitted',
                score,
                submittedAt,
                autoSubmitted,
              }
            : p
        )
      );
    };

    const onParticipantFlagged = ({ participantId }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId ? { ...p, status: 'Flagged', flagged: true } : p
        )
      );
    };

    const onProctorUpdate = (msg) => {
      if (msg?.type === 'yolo_monitoring' && msg?.monitoring) {
        const m = msg.monitoring;
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === m.participantId || p.sessionId === m.sessionId
              ? {
                  ...p,
                  yoloMonitoring: m,
                  lastSeen: m.timestamp,
                }
              : p
          )
        );
      }
    };

    socket.on('new-frame', onNewFrame);
    socket.on('violation', onViolation);
    socket.on('test-submitted', onTestSubmitted);
    socket.on('participant-flagged', onParticipantFlagged);
    socket.on('proctor:update', onProctorUpdate);

    return () => {
      socket.off('new-frame', onNewFrame);
      socket.off('violation', onViolation);
      socket.off('test-submitted', onTestSubmitted);
      socket.off('participant-flagged', onParticipantFlagged);
      socket.off('proctor:update', onProctorUpdate);
    };
  }, [socket, selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === Number(selectedSessionId)),
    [sessions, selectedSessionId]
  );

  const handleAction = async (action, attemptId, message = '') => {
    if (!token) return;

    try {
      if (action === 'warn') {
        await axios.post(
          `${API_BASE}/trainer/participants/${attemptId}/warn`,
          { message },
          { headers: authHeaders(token) }
        );
        socket?.emit('send-trainer-warning', { attemptId, message });
      } else if (action === 'flag') {
        await axios.post(
          `${API_BASE}/trainer/participants/${attemptId}/flag`,
          {},
          { headers: authHeaders(token) }
        );
      } else if (action === 'disqualify') {
        await axios.post(
          `${API_BASE}/trainer/participants/${attemptId}/disqualify`,
          { reason: 'Disqualified by trainer' },
          { headers: authHeaders(token) }
        );
      } else if (action === 'force-submit') {
        await axios.post(
          `${API_BASE}/trainer/participants/${attemptId}/force-submit`,
          { reason: 'Force submitted by trainer' },
          { headers: authHeaders(token) }
        );
        socket?.emit('force-submit', { attemptId, reason: 'Force submitted by trainer' });
      }

      const res = await axios.get(
        `${API_BASE}/trainer/sessions/${selectedSessionId}/participants`,
        { headers: authHeaders(token) }
      );
      setParticipants(res.data?.participants || []);
    } catch (err) {
      console.error(`Trainer action ${action} failed:`, err);
    }
  };

  return (
    <div style={{ minHeight: 'auto', background: 'transparent', padding: '0 0 24px' }}>
      <div className="reg-admin">
        {/* Header */}
        <div className="reg-admin-header">
          <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
            <MonitorPlay size={20} color="#16A34A" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="reg-admin-title">Live Monitoring</h1>
            <p className="reg-admin-subtitle">Select a session to monitor participants in real time.</p>
          </div>
          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(Number(e.target.value))}
            className="reg-select"
            style={{ width: 'auto', minWidth: 240, cursor: 'pointer' }}
          >
            <option value="">Select a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Session summary */}
        {selectedSession && (
          <div className="reg-admin-table-wrap" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Camera size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>{selectedSession.title}</h2>
                <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                  {participants.length} participant{participants.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="reg-admin-loading">
            <Loader2 size={20} className="reg-spin" />
            <span>Loading participants…</span>
          </div>
        ) : !selectedSessionId ? (
          <div className="reg-admin-empty">
            <MonitorPlay size={28} />
            <p>Select a session to begin monitoring</p>
          </div>
        ) : participants.length === 0 ? (
          <div className="reg-admin-empty">
            <Users size={28} />
            <p>No participants in this session yet</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {participants.map((p) => (
              <ParticipantCard
                key={p.id}
                participant={p}
                latestScreenshot={p.latestScreenshot}
                onClick={() => setSelectedParticipant(p)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedParticipant && (
        <ParticipantDetailModal
          participant={selectedParticipant}
          token={token}
          onClose={() => setSelectedParticipant(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
