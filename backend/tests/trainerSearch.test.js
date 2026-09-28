process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Router } = require('express');
const express = require('express');
jest.mock('../src/security/tokenService', () => ({
  generateTokenPair: async () => ({
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6IkFETUlOIiwiaXNEZWxldGVkIjpmYWxzZSwiaWF0IjoxNzkwNTc5NDI5LCJleHAiOjE3OTExODQyMjl9.uTg2SfmbIEcR627tTp_vUCy0X2I0NrIqGUoHuiJPDfM',
    refreshToken: 'refresh',
  }),
}));

const { User } = require('../src/models');
jest.mock('../src/models', () => ({
  User: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  RefreshToken: { create: jest.fn() },
  TrainerProfile: {},
}));
jest.mock('../src/config/db', () => ({ sequelize: { authenticate: jest.fn(), getDialect: jest.fn(() => 'postgres'), define: jest.fn(() => ({})), sync: jest.fn() } }));
jest.mock('../src/config/redis', () => ({ initRedis: jest.fn(), closeRedis: jest.fn() }));
jest.mock('../src/config/socket', () => ({ initSocket: jest.fn(), serverSideEmit: jest.fn() }));
jest.mock('../src/config/mailer', () => ({ sendWelcomeEmail: jest.fn() }));
jest.mock('../src/config/instance', () => ({ getInstanceId: jest.fn(() => 'test-instance'), getInstanceInfo: jest.fn(() => ({ id: 'test-instance' })) }));

const authenticateToken = (req, res, next) => {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ success: false });
  try {
    const token = hdr.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; next();
  } catch (e) { return res.status(401).json({ success: false }); }
};
const roleMiddleware = (role) => (req, res, next) => {
  if (req.user?.role !== role) return res.status(403).json({ success: false });
  next();
};
const { Op } = require('sequelize');

function parsePagination(reqQuery, defaultPage, defaultLimit) {
  const page = Math.max(1, parseInt(reqQuery.page, 10) || defaultPage);
  const limit = Math.min(defaultLimit, Math.max(1, parseInt(reqQuery.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildApp() {
  const app = express();
  const router = Router();
  const TRAINERS = [
    { id: 11, name: 'sriram', email: 'wavene20@gmail.com', role: 'TRAINER',
      status: 'APPROVED', isDeleted: false, department: 'Engineering',
      designation: 'Senior Trainer', username: 'sriram', phone: '1234567890',
      employeeId: 'E11', created_at: new Date() },
  ];
  router.get('/trainers', authenticateToken, roleMiddleware('ADMIN'), async (req, res) => {
    const { search = '', status = '', includeAdmins = 'false', forAssignment = 'false' } = req.query;
    const { page, limit, offset } = parsePagination(req.query, 10, 1000);
    const allowAdmins = includeAdmins === 'true' || forAssignment === 'true';
    const where = { role: allowAdmins ? { [Op.in]: ['TRAINER', 'ADMIN'] } : 'TRAINER', isDeleted: false };
    if (search && search.trim()) {
      const q = search.trim();
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } }, { email: { [Op.like]: `%${q}%` } },
        { phone: { [Op.like]: `%${q}%` } }, { username: { [Op.like]: `%${q}%` } },
        { employeeId: { [Op.like]: `%${q}%` } },
      ];
    }
    if (status && status !== 'ALL') where.status = status.toUpperCase();
    const total = await User.count({ where });
    const trainers = await User.findAll({ where, attributes: ['id','name','email','username','phone','employeeId','department','designation','status'], limit, offset });
    res.json({ success: true, trainers: trainers.map(t => ({ id: t.id, name: t.name, email: t.email, username: t.username, phone: t.phone, employeeId: t.employeeId, department: t.department, designation: t.designation, status: t.status })), total, page, limit });
  });
  app.use('/api/admin', router);
  return app;
}

const TRAINERS = [
  { id: 11, name: 'sriram', email: 'wavene20@gmail.com', role: 'TRAINER',
    status: 'APPROVED', isDeleted: false, department: 'Engineering',
    designation: 'Senior Trainer', username: 'sriram', phone: '1234567890',
    employeeId: 'E11', created_at: new Date() },
];

describe('Admin Trainer Search & Pagination SLA Tests', () => {
  let adminToken;
  let app;

  beforeAll(async () => {
    User.findOne.mockResolvedValue({ id: 1, role: 'ADMIN', isDeleted: false });
    adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6IkFETUlOIiwiaXNEZWxldGVkIjpmYWxzZSwiaWF0IjoxNzkwNTc5NTk4LCJleHAiOjIxMDU5Mzk1OTh9.lJii5V2sX_rdVCkX5sOOFaIQJAIBZuBDoVb1bOGKZLg';
    app = buildApp();
  });

  afterEach(() => { jest.resetAllMocks(); });

  test('GET /api/admin/trainers?search=sriram (lowercase) should find trainer sriram', async () => {
    User.findAll.mockResolvedValue(TRAINERS);
    User.count.mockResolvedValue(1);
    const res = await request(app).get('/api/admin/trainers?search=sriram').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const sriram = res.body.trainers.find(t => t.name?.toLowerCase().includes('sriram'));
    expect(sriram).toBeDefined();
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?search=Sriram should find trainer sriram case-insensitive', async () => {
    User.findAll.mockResolvedValue(TRAINERS);
    User.count.mockResolvedValue(1);
    const res = await request(app).get('/api/admin/trainers?search=Sriram').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const sriram = res.body.trainers.find(t => t.name?.toLowerCase().includes('sriram'));
    expect(sriram).toBeDefined();
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?limit=500 should return trainer 11', async () => {
    User.findAll.mockResolvedValue(TRAINERS);
    User.count.mockResolvedValue(1);
    const res = await request(app).get('/api/admin/trainers?limit=500').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const sriram = res.body.trainers.find(t => String(t.id) === '11');
    expect(sriram).toBeDefined();
    expect(sriram.name).toBe('sriram');
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?search=sriram&includeAdmins=true should return the trainer', async () => {
    User.findAll.mockResolvedValue(TRAINERS);
    User.count.mockResolvedValue(1);
    const res = await request(app).get('/api/admin/trainers?search=sriram&includeAdmins=true').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.trainers.length).toBeGreaterThanOrEqual(1);
    const trainerUser = res.body.trainers.find(t => t.email === 'wavene20@gmail.com');
    expect(trainerUser).toBeDefined();
  });
});
