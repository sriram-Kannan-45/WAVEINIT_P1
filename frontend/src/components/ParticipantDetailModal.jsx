import { useEffect, useState } from 'react';
import axios from 'axios';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{participant.name}</h2>
            <p className="text-sm text-slate-500">{participant.email}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Info section */}
        <div className="grid grid-cols-3 gap-4 border-b bg-slate-50 px-6 py-4 text-sm">
          <div>
            <p className="text-slate-500">Started at</p>
            <p className="font-medium text-slate-800">{formatDate(participant.startedAt)}</p>
          </div>
          <div>
            <p className="text-slate-500">Time remaining</p>
            <p className="font-medium text-slate-800">{participant.timeRemaining}s</p>
          </div>
          <div>
            <p className="text-slate-500">Violations</p>
            <p className="font-medium text-slate-800">{participant.violationCount}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {[
            { id: 'violations', label: 'Violation Log' },
            { id: 'screenshots', label: 'Screenshots' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto p-6">
          {loading ? (
            <p className="text-center text-slate-500">Loading…</p>
          ) : activeTab === 'violations' ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {violations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-400">
                      No violations recorded
                    </td>
                  </tr>
                )}
                {violations.map((v, idx) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2">{idx + 1}</td>
                    <td className="py-2 capitalize">{v.type.replace(/_/g, ' ')}</td>
                    <td className="py-2">{formatTime(v.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {screenshots.length === 0 && (
                <p className="col-span-full text-center text-slate-400">No screenshots yet</p>
              )}
              {screenshots.map((ss) => (
                <div key={ss.id} className="rounded-lg border bg-slate-50 p-2">
                  <img
                    src={assetUrl(ss.filePath)}
                    alt={`Screenshot at ${formatTime(ss.timestamp)}`}
                    className="mb-2 aspect-video w-full rounded-md object-cover"
                  />
                  <p className="text-center text-xs text-slate-500">{formatTime(ss.timestamp)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t bg-slate-50 p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              onClick={() => onAction('flag', participant.id)}
              className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-200"
            >
              Flag Participant
            </button>
            <button
              onClick={() => onAction('disqualify', participant.id)}
              className="rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-200"
            >
              Disqualify
            </button>
            <button
              onClick={() => onAction('force-submit', participant.id)}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
            >
              Force Submit
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={warningText}
              onChange={(e) => setWarningText(e.target.value)}
              placeholder="Warning message…"
              className="flex-1 rounded-lg border px-4 py-2 text-sm"
            />
            <button
              onClick={() => {
                onAction('warn', participant.id, warningText);
                setWarningText('');
              }}
              disabled={!warningText.trim()}
              className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Send Warning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
