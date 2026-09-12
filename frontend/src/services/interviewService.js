/**
 * Interview API Service
 * Thin wrapper around the existing apiClient for interview endpoints.
 */
import { api } from '../services/api'

const INTERVIEW_BASE = '/api/interviews'

export const interviewService = {
  create: (data) => api.post(`${INTERVIEW_BASE}/create`, data),

  list: (params = {}) => {
    const clean = {}
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'undefined') {
        clean[k] = v
      }
    }
    const query = new URLSearchParams(clean).toString()
    return api.get(`${INTERVIEW_BASE}${query ? '?' + query : ''}`)
  },

  get: (id) => api.get(`${INTERVIEW_BASE}/${id}`),
  report: (id) => api.get(`${INTERVIEW_BASE}/${id}/report`),
  evaluateParticipant: (id,userId,data) => api.post(`${INTERVIEW_BASE}/${id}/participants/${userId}/evaluation`,data),
  update: (id, data) => api.put(`${INTERVIEW_BASE}/${id}`, data),

  updateStatus: (id, status) => api.patch(`${INTERVIEW_BASE}/${id}/status`, { status }),

  delete: (id) => api.delete(`${INTERVIEW_BASE}/${id}`),

  bulkDelete: (ids, force = false) => api.post(`${INTERVIEW_BASE}/bulk-delete`, { ids, force }),

  join: (id) => api.post(`${INTERVIEW_BASE}/${id}/join`),

  recordConsent: (id) => api.post(`${INTERVIEW_BASE}/${id}/consent`),

  pairMobile: (id, token) => api.post(`${INTERVIEW_BASE}/${id}/pair-mobile`, { token }),

  refreshQr: (id) => api.post(`${INTERVIEW_BASE}/${id}/refresh-qr`),

  start: (id) => api.post(`${INTERVIEW_BASE}/${id}/start`),

  end: (id) => api.post(`${INTERVIEW_BASE}/${id}/end`),

  submitFeedback: (id, data) => api.post(`${INTERVIEW_BASE}/${id}/feedback`, data),

  getFeedback: (id) => api.get(`${INTERVIEW_BASE}/${id}/feedback`),

  submitResult: (id, data) => api.post(`${INTERVIEW_BASE}/${id}/result`, data),

  publishResult: (id) => api.post(`${INTERVIEW_BASE}/${id}/publish-result`),

  getStatus: (id) => api.get(`${INTERVIEW_BASE}/${id}/status`),

  getRecordings: (id) => api.get(`${INTERVIEW_BASE}/${id}/recordings`),

  getNotes: (id) => api.get(`${INTERVIEW_BASE}/${id}/notes`),

  createNote: (id, data) => api.post(`${INTERVIEW_BASE}/${id}/notes`, data),

  logAlert: (id, data) => api.post(`${INTERVIEW_BASE}/${id}/alerts`, data),

  getCandidates: () => api.get(`${INTERVIEW_BASE}/candidates`),

  getInterviewers: () => api.get(`${INTERVIEW_BASE}/interviewers`),

  getStats: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString()
    return api.get(`${INTERVIEW_BASE}/stats${query ? `?${query}` : ''}`)
  },
}

export default interviewService
