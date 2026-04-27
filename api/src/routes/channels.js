import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import logger from '../logger.js';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

const createChannelSchema = z.object({
  name:            z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Lowercase slug only'),
  display_name:    z.string().min(1).max(100),
  inbound_email:   z.string().email().optional().nullable(),
  case_categories: z.array(z.string()).optional().nullable(),
});

const updateChannelSchema = createChannelSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const assignMemberSchema = z.object({
  user_id:   z.string().uuid(),
  can_write: z.boolean().optional().default(true),
});

const router = Router();

// ─── GET /api/v1/channels ─────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         c.id, c.name, c.display_name, c.inbound_email, c.nuqe_inbound,
         c.case_categories, c.is_active, c.created_at,
         COUNT(DISTINCT uca.user_id)::int AS member_count
       FROM channels c
       LEFT JOIN user_channel_assignments uca ON uca.channel_id = c.id
       WHERE c.organisation_id = $1
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [ORG_ID]
    );
    res.json({ channels: rows });
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
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'GET /channels/:id failed');
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// ─── POST /api/v1/channels ────────────────────────────────────────────────────

router.post('/', validate(createChannelSchema), async (req, res) => {
  const { name, display_name, inbound_email, case_categories } = req.body;

  // Derive Nuqe routing address from org id prefix + channel name
  const orgPrefix = ORG_ID.replace(/-/g, '').slice(0, 8);
  const nuqe_inbound = `${name}-${orgPrefix}@inbound.nuqe.io`;

  try {
    const { rows } = await pool.query(
      `INSERT INTO channels (organisation_id, name, display_name, inbound_email, nuqe_inbound, case_categories)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ORG_ID, name, display_name, inbound_email ?? null, nuqe_inbound, case_categories ?? null]
    );
    res.status(201).json(rows[0]);
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
  const { name, display_name, inbound_email, case_categories, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE channels SET
         name             = COALESCE($1, name),
         display_name     = COALESCE($2, display_name),
         inbound_email    = COALESCE($3, inbound_email),
         case_categories  = COALESCE($4, case_categories),
         is_active        = COALESCE($5, is_active)
       WHERE id = $6 AND organisation_id = $7
       RETURNING *`,
      [name ?? null, display_name ?? null, inbound_email ?? null,
       case_categories ?? null, is_active ?? null,
       req.params.id, ORG_ID]
    );
    if (!rows.length) return res.status(404).json({ error: 'Channel not found' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'PATCH /channels/:id failed');
    res.status(500).json({ error: 'Failed to update channel' });
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
    if (err.code === '23503') {
      return res.status(404).json({ error: 'User or channel not found' });
    }
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
