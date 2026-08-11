/**
 * Interview API Service
 * Thin wrapper around the existing apiClient for interview endpoints.
 */
import { api } from '../services/api'

const INTERVIEW_BASE = '/api/interviews'

export const interviewService = {
  create: (data) => api.post(`${INTERVIEW_BASE}/create`, data),

  list: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return api.get(`${INTERVIEW_BASE}${query ? '?' + query : ''}`)
  },

  get: (id) => api.get(`${INTERVIEW_BASE}/${id}`),

  update: (id, data) => api.put(`${INTERVIEW_BASE}/${id}`, data),

  updateStatus: (id, status) => api.patch(`${INTERVIEW_BASE}/${id}/status`, { status }),

  delete: (id) => api.delete(`${INTERVIEW_BASE}/${id}`),

  join: (id) => api.post(`${INTERVIEW_BASE}/${id}/join`),

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

  logAlert: (id, data) => api.post(`${INTERVIEW_BASE}/${id}/alerts`, data),

  getCandidates: () => api.get(`${INTERVIEW_BASE}/candidates`),

  getInterviewers: () => api.get(`${INTERVIEW_BASE}/interviewers`),

  getStats: () => api.get(`${INTERVIEW_BASE}/stats`),
}

export default interviewService
