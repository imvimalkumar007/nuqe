import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { encrypt, mask } from '../utils/crypto.js';
import { testSmtpConnection } from '../services/smtpService.js';
import { testImapConnection } from '../services/imapService.js';
import logger from '../logger.js';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const connectionSchema = z.object({
  imap_host:     z.string().optional().nullable(),
  imap_port:     z.number().int().optional().nullable(),
  imap_username: z.string().optional().nullable(),
  imap_password: z.string().optional().nullable(), // plaintext in; stored encrypted
  imap_tls:      z.boolean().optional(),
  smtp_host:     z.string().optional().nullable(),
  smtp_port:     z.number().int().optional().nullable(),
  smtp_username: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(), // plaintext in; stored encrypted
  smtp_from:     z.string().optional().nullable(),
  smtp_tls:      z.boolean().optional(),
}).optional();

const createChannelSchema = z.object({
  name:            z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Lowercase slug only'),
  display_name:    z.string().min(1).max(100),
  inbound_email:   z.string().email().optional().nullable(),
  case_categories: z.array(z.string()).optional().nullable(),
}).merge(connectionSchema.unwrap() ?? z.object({})).passthrough();

const updateChannelSchema = createChannelSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const assignMemberSchema = z.object({
  user_id:   z.string().uuid(),
  can_write: z.boolean().optional().default(true),
});

const testSchema = z.object({
  type:     z.enum(['imap', 'smtp']),
  host:     z.string().min(1),
  port:     z.number().int().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  tls:      z.boolean().optional(),
});

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskChannel(row) {
  if (!row) return row;
  return {
    ...row,
    imap_password: mask(row.imap_password),
    smtp_password: mask(row.smtp_password),
    oauth_token:   mask(row.oauth_token),
  };
}

function encryptCredentials(body) {
  const updates = {};
  if (body.imap_password != null) updates.imap_password = encrypt(body.imap_password);
  if (body.smtp_password != null) updates.smtp_password = encrypt(body.smtp_password);
  return updates;
}

// ─── GET /api/v1/channels ─────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         c.id, c.name, c.display_name, c.inbound_email,
         c.imap_host, c.imap_port, c.imap_username, c.imap_password, c.imap_tls,
         c.smtp_host, c.smtp_port, c.smtp_username, c.smtp_password, c.smtp_from, c.smtp_tls,
         c.connection_status, c.connection_error, c.last_synced_at,
         c.case_categories, c.is_active, c.created_at,
         COUNT(DISTINCT uca.user_id)::int AS member_count
       FROM channels c
       LEFT JOIN user_channel_assignments uca ON uca.channel_id = c.id
       WHERE c.organisation_id = $1
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [ORG_ID]
    );
    res.json({ channels: rows.map(maskChannel) });
  } catch (err) {
    logger.error({ err }, 'GET /channels failed');
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// ─── GET /api/v1/channels/:id ─────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         c.*,
         COALESCE(
           json_agg(
             json_build_object(
               'user_id',     uca.user_id,
               'can_write',   uca.can_write,
               'assigned_at', uca.assigned_at,
               'email',       u.email,
               'full_name',   u.full_name
             ) ORDER BY uca.assigned_at
           ) FILTER (WHERE uca.user_id IS NOT NULL),
           '[]'
         ) AS members
       FROM channels c
       LEFT JOIN user_channel_assignments uca ON uca.channel_id = c.id
       LEFT JOIN users u ON u.id = uca.user_id
       WHERE c.id = $1 AND c.organisation_id = $2
       GROUP BY c.id`,
      [req.params.id, ORG_ID]
    );
    if (!rows.length) return res.status(404).json({ error: 'Channel not found' });
    res.json(maskChannel(rows[0]));
  } catch (err) {
    logger.error({ err }, 'GET /channels/:id failed');
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// ─── POST /api/v1/channels ────────────────────────────────────────────────────

router.post('/', validate(createChannelSchema), async (req, res) => {
  const {
    name, display_name, inbound_email, case_categories,
    imap_host, imap_port, imap_username, imap_password, imap_tls,
    smtp_host, smtp_port, smtp_username, smtp_password, smtp_from, smtp_tls,
  } = req.body;

  const enc = encryptCredentials(req.body);

  try {
    const { rows } = await pool.query(
      `INSERT INTO channels
         (organisation_id, name, display_name, inbound_email, case_categories,
          imap_host, imap_port, imap_username, imap_password, imap_tls,
          smtp_host, smtp_port, smtp_username, smtp_password, smtp_from, smtp_tls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        ORG_ID, name, display_name, inbound_email ?? null, case_categories ?? null,
        imap_host ?? null, imap_port ?? null, imap_username ?? null,
        enc.imap_password ?? null, imap_tls ?? true,
        smtp_host ?? null, smtp_port ?? null, smtp_username ?? null,
        enc.smtp_password ?? null, smtp_from ?? null, smtp_tls ?? true,
      ]
    );
    res.status(201).json(maskChannel(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A channel with this name already exists' });
    }
    logger.error({ err }, 'POST /channels failed');
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// ─── PATCH /api/v1/channels/:id ───────────────────────────────────────────────

router.patch('/:id', validate(updateChannelSchema), async (req, res) => {
  const enc = encryptCredentials(req.body);
  const b = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE channels SET
         name             = COALESCE($1,  name),
         display_name     = COALESCE($2,  display_name),
         inbound_email    = COALESCE($3,  inbound_email),
         case_categories  = COALESCE($4,  case_categories),
         is_active        = COALESCE($5,  is_active),
         imap_host        = COALESCE($6,  imap_host),
         imap_port        = COALESCE($7,  imap_port),
         imap_username    = COALESCE($8,  imap_username),
         imap_password    = COALESCE($9,  imap_password),
         imap_tls         = COALESCE($10, imap_tls),
         smtp_host        = COALESCE($11, smtp_host),
         smtp_port        = COALESCE($12, smtp_port),
         smtp_username    = COALESCE($13, smtp_username),
         smtp_password    = COALESCE($14, smtp_password),
         smtp_from        = COALESCE($15, smtp_from),
         smtp_tls         = COALESCE($16, smtp_tls)
       WHERE id = $17 AND organisation_id = $18
       RETURNING *`,
      [
        b.name ?? null, b.display_name ?? null, b.inbound_email ?? null,
        b.case_categories ?? null, b.is_active ?? null,
        b.imap_host ?? null, b.imap_port ?? null, b.imap_username ?? null,
        enc.imap_password ?? null, b.imap_tls ?? null,
        b.smtp_host ?? null, b.smtp_port ?? null, b.smtp_username ?? null,
        enc.smtp_password ?? null, b.smtp_from ?? null, b.smtp_tls ?? null,
        req.params.id, ORG_ID,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Channel not found' });
    res.json(maskChannel(rows[0]));
  } catch (err) {
    logger.error({ err }, 'PATCH /channels/:id failed');
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// ─── POST /api/v1/channels/:id/test ──────────────────────────────────────────
// Tests IMAP or SMTP connectivity with provided (plain) credentials.

router.post('/:id/test', validate(testSchema), async (req, res) => {
  const { type, host, port, username, password, tls } = req.body;
  try {
    if (type === 'imap') {
      await testImapConnection({ host, port, username, password, tls });
    } else {
      await testSmtpConnection({ host, port, username, password, tls });
    }

    await pool.query(
      `UPDATE channels SET connection_status = 'connected', connection_error = NULL WHERE id = $1`,
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    await pool.query(
      `UPDATE channels SET connection_status = 'error', connection_error = $1 WHERE id = $2`,
      [err.message?.slice(0, 500), req.params.id]
    ).catch(() => {});
    res.status(422).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/v1/channels/:id/members ────────────────────────────────────────

router.get('/:id/members', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT uca.user_id, uca.can_write, uca.assigned_at,
              u.email, u.full_name, u.role
       FROM user_channel_assignments uca
       JOIN users u ON u.id = uca.user_id
       WHERE uca.channel_id = $1
       ORDER BY uca.assigned_at`,
      [req.params.id]
    );
    res.json({ members: rows });
  } catch (err) {
    logger.error({ err }, 'GET /channels/:id/members failed');
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ─── POST /api/v1/channels/:id/members ───────────────────────────────────────

router.post('/:id/members', validate(assignMemberSchema), async (req, res) => {
  const { user_id, can_write } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_channel_assignments (user_id, channel_id, can_write)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, channel_id) DO UPDATE SET can_write = $3`,
      [user_id, req.params.id, can_write]
    );
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'User or channel not found' });
    logger.error({ err }, 'POST /channels/:id/members failed');
    res.status(500).json({ error: 'Failed to assign member' });
  }
});

// ─── DELETE /api/v1/channels/:id/members/:userId ─────────────────────────────

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM user_channel_assignments WHERE channel_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, 'DELETE /channels/:id/members/:userId failed');
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
