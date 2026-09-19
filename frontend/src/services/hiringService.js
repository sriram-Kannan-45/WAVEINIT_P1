import { api } from './api';

const BASE = '/api/hire';

const query = (params = {}) => {
  const clean = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'ALL');
  const value = new URLSearchParams(clean).toString();
  return value ? `?${value}` : '';
};

export const hiringService = {
  createAssessment: (data, opts) => api.post(`${BASE}/assessments`, data, opts),
  listAssessments: (params, opts) => api.get(`${BASE}/assessments${query(params)}`, opts),
  getAssessment: (id, opts) => api.get(`${BASE}/assessments/${id}`, opts),
  updateAssessment: (id, data, opts) => api.put(`${BASE}/assessments/${id}`, data, opts),
  deleteAssessment: (id, force = false, opts) => api.delete(`${BASE}/assessments/${id}${force ? '?force=true' : ''}`, { data: { force }, ...opts }),
  bulkDeleteAssessments: (ids, force = false, opts) => api.post(`${BASE}/assessments/bulk-delete`, { ids, force }, opts),
  publishAssessment: (id, opts) => api.post(`${BASE}/assessments/${id}/publish`, null, opts),
  closeAssessment: (id, opts) => api.post(`${BASE}/assessments/${id}/close`, null, opts),
  ensureQuiz: (id, opts) => api.post(`${BASE}/assessments/${id}/quiz`, null, opts),
  ensureCoding: (id, opts) => api.post(`${BASE}/assessments/${id}/coding`, null, opts),
  getReport: (id, opts) => api.get(`${BASE}/assessments/${id}/report`, opts),
  uploadCandidatesCsv: (id, formData, opts) => api.post(`${BASE}/assessments/${id}/candidates/upload`, formData, opts),
  listCandidates: (id, params, opts) => api.get(`${BASE}/assessments/${id}/candidates${query(params)}`, opts),
  recheckRegistration: (id, opts) => api.post(`${BASE}/assessments/${id}/candidates/recheck`, null, opts),
  assignCandidates: (id, candidateIds = [], opts) => api.post(`${BASE}/assessments/${id}/candidates/assign`, candidateIds && candidateIds.length ? { candidateIds } : {}, opts),
  toggleAssignCandidate: (id, candidateId, opts) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/toggle-assign`, null, opts),
  revokeCandidate: (id, candidateId, opts) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/revoke`, null, opts),
  reassignCandidate: (id, candidateId, opts) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/reassign`, null, opts),
  resetCandidateAttempt: (id, candidateId, opts) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/reset-attempt`, null, opts),
  extendCandidateTime: (id, candidateId, minutes = 15, opts) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/extend-time`, { minutes }, opts),
  removeCandidate: (id, candidateId, opts) => api.delete(`${BASE}/assessments/${id}/candidates/${candidateId}`, opts),
  getMyAssessments: (opts) => api.get(`${BASE}/my-assessments`, opts),
  getProctoringPolicy: (type, engineId, sessionId = null, opts) => api.get(`${BASE}/proctoring/policy/${type}/${engineId}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, opts),
  updateProctoringPolicy: (type, engineId, data, opts) => api.put(`${BASE}/proctoring/policy/${type}/${engineId}`, data, opts),
  getLivenessChallenge: (sessionId, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/challenge`, null, opts),
  captureIdentity: (sessionId, data, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/identity/reference`, data, opts),
  verifyIdentity: (sessionId, frame, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/identity/verify`, { frame }, opts),
  inspectRoom: (sessionId, frames, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/room-scan`, { frames }, opts),
  analyzeRoomStep: (sessionId, step, frame, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/room-step`, { step, frame }, opts),
  analyzeRoomScan360: (sessionId, frames, opts) => api.post(`${BASE}/proctoring/sessions/${sessionId}/room-scan-360`, { frames }, opts),
  getRoomVerificationState: (sessionId, opts) => api.get(`${BASE}/proctoring/sessions/${sessionId}/room-state`, opts),
};

export default hiringService;
