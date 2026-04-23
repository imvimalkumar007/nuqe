import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import logger from '../logger.js';

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const router = Router();

const ACCESS_TTL  = '1h';
const REFRESH_TTL = '7d';
const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function makeAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, organisationId: user.organisation_id },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function makeRefreshToken(userId) {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, full_name, role, organisation_id, is_active
       FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await pool.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    await pool.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id)
       VALUES ('user', $1, 'login', 'staff', $1)`,
      [user.id]
    );

    const accessToken  = makeAccessToken(user);
    const refreshToken = makeRefreshToken(user.id);

    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return res.json({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    logger.error({ err }, 'auth login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/v1/auth/refresh ────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const { rows } = await pool.query(
      `SELECT id, email, role, organisation_id, is_active FROM users WHERE id = $1`,
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const accessToken = makeAccessToken(user);
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      await pool.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id)
         VALUES ('user', $1, 'logout', 'staff', $1)`,
        [payload.id]
      );
    } catch {
      // token invalid or expired — still log out cleanly
    }
  }

  return res.json({ message: 'Logged out' });
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  return res.json({
    id:             u.id,
    email:          u.email,
    fullName:       u.fullName,
    role:           u.role,
    organisationId: u.organisationId,
  });
});

export default router;
