import { API, API_BASE } from '../api/api';

const authHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return { Authorization: `Bearer ${user.token}` };
};

const parseError = async (res) => {
  try {
    const body = await res.json();
    throw new Error(body.message || `Request failed (${res.status})`);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`Request failed (${res.status})`);
    throw e;
  }
};

const profileService = {
  getMyProfile: async () => {
    const res = await fetch(API.USER_PROFILE.GET, { headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getProfileById: async (id) => {
    const res = await fetch(API.USER_PROFILE.GET_BY_ID(id), { headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateProfile: async (data) => {
    const res = await fetch(API.USER_PROFILE.UPDATE, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadBanner: async (file) => {
    const fd = new FormData();
    fd.append('banner', file);
    const res = await fetch(API.USER_PROFILE.BANNER, { method: 'POST', headers: authHeaders(), body: fd });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteBanner: async () => {
    const res = await fetch(API.USER_PROFILE.BANNER, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadAvatar: async (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await fetch(API.USER_PROFILE.AVATAR, { method: 'POST', headers: authHeaders(), body: fd });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteAvatar: async () => {
    const res = await fetch(API.USER_PROFILE.AVATAR, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  uploadResume: async (file) => {
    const fd = new FormData();
    fd.append('resume', file);
    const res = await fetch(API.USER_PROFILE.RESUME, { method: 'POST', headers: authHeaders(), body: fd });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteResume: async () => {
    const res = await fetch(API.USER_PROFILE.RESUME, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addSkill: async (skill) => {
    const res = await fetch(API.USER_PROFILE.SKILLS, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill }),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteSkill: async (id) => {
    const res = await fetch(API.USER_PROFILE.DELETE_SKILL(id), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addExperience: async (data) => {
    const res = await fetch(API.USER_PROFILE.EXPERIENCE, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateExperience: async (id, data) => {
    const res = await fetch(API.USER_PROFILE.UPDATE_EXP(id), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteExperience: async (id) => {
    const res = await fetch(API.USER_PROFILE.DELETE_EXP(id), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addEducation: async (data) => {
    const res = await fetch(API.USER_PROFILE.EDUCATION, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateEducation: async (id, data) => {
    const res = await fetch(API.USER_PROFILE.UPDATE_EDU(id), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteEducation: async (id) => {
    const res = await fetch(API.USER_PROFILE.DELETE_EDU(id), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addCertificate: async (formData) => {
    const res = await fetch(API.USER_PROFILE.CERTIFICATES, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateCertificate: async (id, formData) => {
    const res = await fetch(API.USER_PROFILE.UPDATE_CERT(id), {
      method: 'PUT',
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteCertificate: async (id) => {
    const res = await fetch(API.USER_PROFILE.DELETE_CERT(id), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  addProject: async (data) => {
    const res = await fetch(API.USER_PROFILE.PROJECTS, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateProject: async (id, data) => {
    const res = await fetch(API.USER_PROFILE.UPDATE_PROJECT(id), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteProject: async (id) => {
    const res = await fetch(API.USER_PROFILE.DELETE_PROJECT(id), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  updateContactLinks: async (data) => {
    const res = await fetch(API.USER_PROFILE.CONTACT_LINKS, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  deleteContactLinks: async () => {
    const res = await fetch(API.USER_PROFILE.CONTACT_LINKS, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getMyCourses: async () => {
    const res = await fetch(API.PARTICIPANT_COURSES.LIST, { headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getTrainerCourses: async () => {
    const res = await fetch(API.TRAINER_COURSES.LIST, { headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },

  getNotifications: async () => {
    const res = await fetch(`${API_BASE || ''}/notifications`, { headers: authHeaders() });
    if (!res.ok) await parseError(res);
    return res.json();
  },
};

export default profileService;
