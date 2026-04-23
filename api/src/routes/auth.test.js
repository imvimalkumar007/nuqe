import request from 'supertest';
import app from '../app.js';

const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

// ─── AUTH-001 ─────────────────────────────────────────────────────────────────

test('AUTH-001: POST /auth/login with valid credentials returns 200 and access token', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

  expect(res.status).toBe(200);
  expect(typeof res.body.accessToken).toBe('string');
  expect(res.body.accessToken.length).toBeGreaterThan(10);
  expect(res.body.user.email).toBe(VALID_EMAIL);
  expect(res.body.user.role).toBe('admin');
  // refresh_token cookie must be set httpOnly
  const setCookie = res.headers['set-cookie'] ?? [];
  expect(setCookie.some(c => c.startsWith('refresh_token='))).toBe(true);
  expect(setCookie.some(c => c.includes('HttpOnly'))).toBe(true);
});

// ─── AUTH-002 ─────────────────────────────────────────────────────────────────

test('AUTH-002: POST /auth/login with wrong password returns 401', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: 'wrongpassword' });

  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Invalid credentials');
});

// ─── AUTH-003 ─────────────────────────────────────────────────────────────────

test('AUTH-003: POST /auth/login with unknown email returns 401', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nobody@example.com', password: VALID_PASSWORD });

  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Invalid credentials');
});

// ─── AUTH-004 ─────────────────────────────────────────────────────────────────

test('AUTH-004: POST /auth/login with missing fields returns 400', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL });

  expect(res.status).toBe(400);
});

// ─── AUTH-005 ─────────────────────────────────────────────────────────────────

test('AUTH-005: POST /auth/refresh with valid cookie returns new access token', async () => {
  // First log in to get a refresh_token cookie
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

  const cookies = loginRes.headers['set-cookie'];
  expect(cookies).toBeDefined();

  const refreshRes = await request(app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', cookies);

  expect(refreshRes.status).toBe(200);
  expect(typeof refreshRes.body.accessToken).toBe('string');
  expect(refreshRes.body.accessToken.length).toBeGreaterThan(10);
});

// ─── AUTH-006 ─────────────────────────────────────────────────────────────────

test('AUTH-006: POST /auth/refresh with no cookie returns 401', async () => {
  const res = await request(app).post('/api/v1/auth/refresh');
  expect(res.status).toBe(401);
  expect(res.body.error).toMatch(/refresh token/i);
});

// ─── AUTH-007 ─────────────────────────────────────────────────────────────────

test('AUTH-007: POST /auth/logout clears the refresh_token cookie', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

  const cookies = loginRes.headers['set-cookie'];
  const token   = loginRes.body.accessToken;

  const logoutRes = await request(app)
    .post('/api/v1/auth/logout')
    .set('Cookie', cookies)
    .set('Authorization', `Bearer ${token}`);

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('Logged out');

  // Cookie should be cleared (Max-Age=0 or Expires in the past)
  const setCookie = logoutRes.headers['set-cookie'] ?? [];
  const refreshCookieHeader = setCookie.find(c => c.startsWith('refresh_token='));
  expect(refreshCookieHeader).toBeDefined();
  expect(refreshCookieHeader).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
});

// ─── AUTH-008 ─────────────────────────────────────────────────────────────────

test('AUTH-008: GET /auth/me with valid token returns user object', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

  const token = loginRes.body.accessToken;

  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`);

  expect(meRes.status).toBe(200);
  expect(meRes.body.email).toBe(VALID_EMAIL);
  expect(meRes.body.role).toBe('admin');
  expect(meRes.body.id).toBeDefined();
});

// ─── AUTH-009 ─────────────────────────────────────────────────────────────────

test('AUTH-009: GET /auth/me with no token returns 401', async () => {
  const res = await request(app).get('/api/v1/auth/me');
  expect(res.status).toBe(401);
});

// ─── AUTH-010 ─────────────────────────────────────────────────────────────────

test('AUTH-010: protected route returns 401 when called without token', async () => {
  const res = await request(app).get('/api/v1/cases');
  expect(res.status).toBe(401);
});
