const API_BASE = import.meta.env.VITE_API_URL || '';

function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return { Authorization: `Bearer ${user.token}` };
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

const interviewApi = {
  // Interviews CRUD
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`${API_BASE}/api/interview?${query}`);
  },
  getOne: (id) => apiRequest(`${API_BASE}/api/interview/${id}`),
  create: (data) => apiRequest(`${API_BASE}/api/interview`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`${API_BASE}/api/interview/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancel: (id) => apiRequest(`${API_BASE}/api/interview/${id}/cancel`, { method: 'PUT' }),
  start: (id) => apiRequest(`${API_BASE}/api/interview/${id}/start`, { method: 'PUT' }),
  end: (id) => apiRequest(`${API_BASE}/api/interview/${id}/end`, { method: 'PUT' }),

  // Dashboard
  dashboardStats: () => apiRequest(`${API_BASE}/api/interview/dashboard`),

  // Participants & Trainers
  assignParticipants: (id, participantIds) => apiRequest(`${API_BASE}/api/interview/${id}/participants`, { method: 'POST', body: JSON.stringify({ participantIds }) }),
  assignTrainers: (id, trainerIds) => apiRequest(`${API_BASE}/api/interview/${id}/trainers`, { method: 'POST', body: JSON.stringify({ trainerIds }) }),
  listTrainers: () => apiRequest(`${API_BASE}/api/interview/users/trainers`),
  listParticipants: () => apiRequest(`${API_BASE}/api/interview/users/participants`),

  // Room
  join: (id, password) => apiRequest(`${API_BASE}/api/interview/${id}/join`, { method: 'POST', body: JSON.stringify({ password }) }),
  leave: (id) => apiRequest(`${API_BASE}/api/interview/${id}/leave`, { method: 'POST' }),

  // Participant & Trainer views
  myInterviews: () => apiRequest(`${API_BASE}/api/interview/participant/my`),
  trainerInterviews: () => apiRequest(`${API_BASE}/api/interview/trainer/my`),

  // QR
  generateQR: (id) => apiRequest(`${API_BASE}/api/interview/${id}/qr/generate`, { method: 'POST' }),
  verifyQR: (id, token) => apiRequest(`${API_BASE}/api/interview/${id}/qr/verify`, { method: 'POST', body: JSON.stringify({ token }) }),

  // Mobile
  connectMobile: (id, deviceInfo) => apiRequest(`${API_BASE}/api/interview/${id}/mobile/connect`, { method: 'POST', body: JSON.stringify(deviceInfo) }),

  // Evaluation
  submitEvaluation: (id, data) => apiRequest(`${API_BASE}/api/interview/${id}/evaluation`, { method: 'POST', body: JSON.stringify(data) }),
  getEvaluations: (id) => apiRequest(`${API_BASE}/api/interview/${id}/evaluations`),

  // Results & Reports
  publishResults: (id) => apiRequest(`${API_BASE}/api/interview/${id}/publish-results`, { method: 'POST' }),
  getReport: (id) => apiRequest(`${API_BASE}/api/interview/${id}/report`),

  // Activity & Notifications
  getActivityLog: (id) => apiRequest(`${API_BASE}/api/interview/${id}/activity`),
  getNotifications: (id) => apiRequest(`${API_BASE}/api/interview/${id}/notifications`),

  // Password
  verifyPassword: (id, password) => apiRequest(`${API_BASE}/api/interview/${id}/verify-password`, { method: 'POST', body: JSON.stringify({ password }) }),
};

export default interviewApi;
