/**
 * REST client for the proctoring module.
 *
 *  - Reuses the existing API_BASE from frontend/src/api/api.js
 *  - Reads the JWT from localStorage 'user' (the rest of the app does this)
 *  - All session-locked endpoints require the X-Proctor-Session-Token header
 *  - Errors are normalised: e.message is server message; e.status, e.code,
 *    e.payload are kept for caller-side decisions.
 */
import { API_BASE } from '../api/api';

function getAuthToken() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || parsed?.accessToken || null;
  } catch { return null; }
}

async function request(path, { method = 'GET', body, sessionToken } = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (sessionToken) headers['X-Proctor-Session-Token'] = sessionToken;

  let res;
  try {
    res = await fetch(`${API_BASE}/proctor${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
  } catch (networkErr) {
    const err = new Error('Network error — please check your connection');
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch { /* may be empty */ }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    err.payload = data;
    throw err;
  }
  return data?.data ?? data;
}

export const proctorApi = {
  startSession: (payload) =>
    request('/sessions/start', { method: 'POST', body: payload }),

  getActiveSession: () =>
    request('/sessions/active'),

  activate: (sessionId, sessionToken) =>
    request(`/sessions/${sessionId}/activate`, { method: 'POST', sessionToken }),

  heartbeat: (sessionId, sessionToken) =>
    request(`/sessions/${sessionId}/heartbeat`, { method: 'POST', sessionToken }),

  recordViolation: (sessionId, sessionToken, payload) =>
    request(`/sessions/${sessionId}/violation`, {
      method: 'POST', sessionToken, body: payload,
    }),

  recordActivity: (sessionId, sessionToken, payload) =>
    request(`/sessions/${sessionId}/activity`, {
      method: 'POST', sessionToken, body: payload,
    }),

  getExamData: (sessionId, sessionToken) =>
    request(`/sessions/${sessionId}/exam`, { sessionToken }),

  saveAnswers: (sessionId, sessionToken, answers) =>
    request(`/sessions/${sessionId}/answers`, {
      method: 'POST', sessionToken, body: { answers },
    }),

  finalize: (sessionId, sessionToken, answers) =>
    request(`/sessions/${sessionId}/finalize`, {
      method: 'POST', sessionToken, body: answers ? { answers } : undefined,
    }),

  getResult: (sessionId) =>
    request(`/sessions/${sessionId}/result`),

  submit: (sessionId, sessionToken) =>
    request(`/sessions/${sessionId}/submit`, { method: 'POST', sessionToken }),

  terminate: (sessionId, sessionToken, reason) =>
    request(`/sessions/${sessionId}/terminate`, {
      method: 'POST', sessionToken, body: { reason },
    }),

  getSession: (sessionId) =>
    request(`/sessions/${sessionId}`),

  getViolations: (sessionId) =>
    request(`/sessions/${sessionId}/violations`),

  getQuizMonitor: (quizId) =>
    request(`/quiz/${quizId}/monitor`),

  exportLogsUrl: (sessionId) =>
    `${API_BASE}/proctor/sessions/${sessionId}/export.json`,

  forceTerminate: (sessionId, reason) =>
    request(`/sessions/${sessionId}/force-terminate`, {
      method: 'POST', body: { reason },
    }),

  getQuizReport: (quizId) =>
    request(`/quiz/${quizId}/report`),

  getQuizReportCSVUrl: (quizId) =>
    `${API_BASE}/proctor/quiz/${quizId}/report/csv`,

  // ── Recording endpoints ──────────────────────────────────────────────
  getRecordings: (sessionId) =>
    request(`/sessions/${sessionId}/recordings`),

  getRecordingStreamUrl: (sessionId, recordingId) =>
    `${API_BASE}/proctor/recordings/${recordingId}/stream`,

  getRecordingDownloadUrl: (sessionId, recordingId) =>
    `${API_BASE}/proctor/recordings/${recordingId}/download`,
};
