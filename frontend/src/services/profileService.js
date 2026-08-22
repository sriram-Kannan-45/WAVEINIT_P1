import { API, API_BASE } from '../api/api';
import { fetchWithTimeout, getAuthHeaders } from '../api/request';

const parseError = async (res) => {
  try {
    const body = await res.json();
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`Request failed (${res.status})`);
    throw e;
  }
};

const profileService = {
  getMyProfile: async (signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.GET, {
      headers: getAuthHeaders(),
      signal,
    }, 12000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getProfileById: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.GET_BY_ID(id), {
      headers: getAuthHeaders(),
      signal,
    }, 12000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateProfile: async (data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.UPDATE, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 15000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadBanner: async (file, signal) => {
    const fd = new FormData();
    fd.append('banner', file);
    const res = await fetchWithTimeout(API.USER_PROFILE.BANNER, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: fd,
      signal,
    }, 30000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteBanner: async (signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.BANNER, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadAvatar: async (file, signal) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await fetchWithTimeout(API.USER_PROFILE.AVATAR, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: fd,
      signal,
    }, 30000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteAvatar: async (signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.AVATAR, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadResume: async (file, signal) => {
    const fd = new FormData();
    fd.append('resume', file);
    const res = await fetchWithTimeout(API.USER_PROFILE.RESUME, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: fd,
      signal,
    }, 30000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteResume: async (signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.RESUME, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addSkill: async (skill, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.SKILLS, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill }),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteSkill: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.DELETE_SKILL(id), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addExperience: async (data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.EXPERIENCE, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateExperience: async (id, data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.UPDATE_EXP(id), {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteExperience: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.DELETE_EXP(id), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addEducation: async (data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.EDUCATION, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateEducation: async (id, data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.UPDATE_EDU(id), {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteEducation: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.DELETE_EDU(id), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addCertificate: async (formData, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.CERTIFICATES, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
      signal,
    }, 30000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateCertificate: async (id, formData, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.UPDATE_CERT(id), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: formData,
      signal,
    }, 30000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteCertificate: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.DELETE_CERT(id), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addProject: async (data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.PROJECTS, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateProject: async (id, data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.UPDATE_PROJECT(id), {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteProject: async (id, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.DELETE_PROJECT(id), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateContactLinks: async (data, signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.CONTACT_LINKS, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteContactLinks: async (signal) => {
    const res = await fetchWithTimeout(API.USER_PROFILE.CONTACT_LINKS, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getMyCourses: async (signal) => {
    const res = await fetchWithTimeout(API.PARTICIPANT_COURSES.LIST, {
      headers: getAuthHeaders(),
      signal,
    }, 12000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getTrainerCourses: async (signal) => {
    const res = await fetchWithTimeout(API.TRAINER_COURSES.LIST, {
      headers: getAuthHeaders(),
      signal,
    }, 12000);
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getNotifications: async (signal) => {
    const res = await fetchWithTimeout(`${API_BASE || ''}/notifications`, {
      headers: getAuthHeaders(),
      signal,
    }, 10000);
    if (!res.ok) await parseError(res);
    return res.json();
  },
};

export default profileService;
