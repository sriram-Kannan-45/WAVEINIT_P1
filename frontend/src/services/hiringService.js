import { api } from './api';

const BASE = '/api/hire';

const query = (params = {}) => {
  const clean = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'ALL');
  const value = new URLSearchParams(clean).toString();
  return value ? `?${value}` : '';
};

export const hiringService = {
  createAssessment: (data) => api.post(`${BASE}/assessments`, data),
  listAssessments: (params) => api.get(`${BASE}/assessments${query(params)}`),
  getAssessment: (id) => api.get(`${BASE}/assessments/${id}`),
  updateAssessment: (id, data) => api.put(`${BASE}/assessments/${id}`, data),
  deleteAssessment: (id) => api.delete(`${BASE}/assessments/${id}`),
  publishAssessment: (id) => api.post(`${BASE}/assessments/${id}/publish`),
  closeAssessment: (id) => api.post(`${BASE}/assessments/${id}/close`),
  getReport: (id) => api.get(`${BASE}/assessments/${id}/report`),
  uploadCandidatesCsv: (id, formData) => api.post(`${BASE}/assessments/${id}/candidates/upload`, formData),
  listCandidates: (id, params) => api.get(`${BASE}/assessments/${id}/candidates${query(params)}`),
  recheckRegistration: (id) => api.post(`${BASE}/assessments/${id}/candidates/recheck`),
  assignCandidates: (id, candidateIds = []) => api.post(`${BASE}/assessments/${id}/candidates/assign`, { candidateIds }),
  toggleAssignCandidate: (id, candidateId) => api.post(`${BASE}/assessments/${id}/candidates/${candidateId}/toggle-assign`),
  removeCandidate: (id, candidateId) => api.delete(`${BASE}/assessments/${id}/candidates/${candidateId}`),
  getMyAssessments: () => api.get(`${BASE}/my-assessments`),
  getProctoringPolicy: (type, engineId, sessionId = null) => api.get(`${BASE}/proctoring/policy/${type}/${engineId}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
  updateProctoringPolicy: (type, engineId, data) => api.put(`${BASE}/proctoring/policy/${type}/${engineId}`, data),
  getLivenessChallenge: (sessionId) => api.post(`${BASE}/proctoring/sessions/${sessionId}/challenge`),
  captureIdentity: (sessionId, data) => api.post(`${BASE}/proctoring/sessions/${sessionId}/identity/reference`, data),
  verifyIdentity: (sessionId, frame) => api.post(`${BASE}/proctoring/sessions/${sessionId}/identity/verify`, { frame }),
  inspectRoom: (sessionId, frames) => api.post(`${BASE}/proctoring/sessions/${sessionId}/room-scan`, { frames }),
};

export default hiringService;
