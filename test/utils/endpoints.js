// Central localhost endpoints for the whole Playwright suite.
// Override with FRONTEND_URL / BACKEND_URL / AI_SERVICE_URL in test/.env.
function stripSlash(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

// Frontend vite dev serves HTTPS when frontend/.cert exists. Override with
// FRONTEND_URL=http://localhost:5174 in test/.env when running plain HTTP.
const FRONTEND_URL = stripSlash(process.env.FRONTEND_URL || 'https://localhost:5174');
const BACKEND_URL = stripSlash(process.env.BACKEND_URL || 'http://localhost:3001');
const AI_SERVICE_URL = stripSlash(process.env.AI_SERVICE_URL || 'http://localhost:8000');

const API = {
  health: `${BACKEND_URL}/api/health`,
  authLogin: `${BACKEND_URL}/api/auth/login`,
  authRegister: `${BACKEND_URL}/api/auth/register`,
  aiHealth: `${BACKEND_URL}/api/ai/health`,
};

const AI = {
  health: `${AI_SERVICE_URL}/health`,
  apiHealth: `${AI_SERVICE_URL}/api/health`,
  ready: `${AI_SERVICE_URL}/ready`,
};

const UI = {
  root: `${FRONTEND_URL}/`,
  login: `${FRONTEND_URL}/login`,
  register: `${FRONTEND_URL}/register`,
  admin: `${FRONTEND_URL}/admin`,
  trainer: `${FRONTEND_URL}/trainer`,
  participant: `${FRONTEND_URL}/participant`,
  verifyCertificate: `${FRONTEND_URL}/verify-certificate`,
  privacy: `${FRONTEND_URL}/privacy`,
  forgotPassword: `${FRONTEND_URL}/forgot-password`,
};

module.exports = { FRONTEND_URL, BACKEND_URL, AI_SERVICE_URL, API, AI, UI };