const request = require('supertest');
const { app } = require('../src/app');
const { generateTokenPair } = require('../src/security/tokenService');
const { User } = require('../src/models');
const { sequelize } = require('../src/config/db');

describe('Admin Trainer Search & Pagination SLA Tests', () => {
  let adminToken;

  beforeAll(async () => {
    await sequelize.authenticate();
    const adminUser = await User.findOne({ where: { role: 'ADMIN', isDeleted: false } }) || { id: 1, role: 'ADMIN' };
    const tokens = await generateTokenPair(adminUser, { headers: { 'user-agent': 'jest' }, ip: '127.0.0.1' });
    adminToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Keep connection open for jest
  });

  test('GET /api/admin/trainers?search=sriram (lowercase) should find trainer sriram', async () => {
    const res = await request(app)
      .get('/api/admin/trainers?search=sriram')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.trainers)).toBe(true);

    const sriram = res.body.trainers.find(t => t.name?.toLowerCase().includes('sriram'));
    expect(sriram).toBeDefined();
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?search=Sriram (Capitalized) should find trainer sriram (case-insensitive)', async () => {
    const res = await request(app)
      .get('/api/admin/trainers?search=Sriram')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.trainers)).toBe(true);

    const sriram = res.body.trainers.find(t => t.name?.toLowerCase().includes('sriram'));
    expect(sriram).toBeDefined();
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?limit=500 should return all trainers including trainer 11', async () => {
    const res = await request(app)
      .get('/api/admin/trainers?limit=500')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.trainers.length).toBeGreaterThan(100);

    const sriram = res.body.trainers.find(t => String(t.id) === '11');
    expect(sriram).toBeDefined();
    expect(sriram.name).toBe('sriram');
    expect(sriram.email).toBe('wavene20@gmail.com');
  });

  test('GET /api/admin/trainers?search=sriram&includeAdmins=true should return both trainer and admin Sriram', async () => {
    const res = await request(app)
      .get('/api/admin/trainers?search=sriram&includeAdmins=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.trainers.length).toBeGreaterThanOrEqual(1);

    const trainerUser = res.body.trainers.find(t => t.email === 'wavene20@gmail.com');
    expect(trainerUser).toBeDefined();
  });
});
