import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api/api';
import { useSocket } from '../hooks/useSocket';
import ParticipantCard from '../components/ParticipantCard';
import ParticipantDetailModal from '../components/ParticipantDetailModal';
import { colors } from '../theme/tokens';

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

    socket.on('new-frame', onNewFrame);
    socket.on('violation', onViolation);
    socket.on('test-submitted', onTestSubmitted);
    socket.on('participant-flagged', onParticipantFlagged);

    return () => {
      socket.off('new-frame', onNewFrame);
      socket.off('violation', onViolation);
      socket.off('test-submitted', onTestSubmitted);
      socket.off('participant-flagged', onParticipantFlagged);
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
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Monitoring</h1>
            <p className="text-sm text-slate-500">Select a session to monitor participants in real time.</p>
          </div>

          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(Number(e.target.value))}
            className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
          >
            <option value="">Select a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {selectedSession && (
          <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">{selectedSession.title}</h2>
            <p className="text-sm text-slate-500">
              {participants.length} participant{participants.length === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-500">Loading participants…</div>
        ) : !selectedSessionId ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
            Select a session to begin monitoring
          </div>
        ) : participants.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
            No participants in this session yet
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
