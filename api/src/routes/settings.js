import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

const DEFAULTS = {
  provider:             'claude',
  model:                'claude-sonnet-4-20250514',
  temperature:          0.3,
  max_tokens:           1000,
  system_prompt_prefix: null,
};

// Fixed org UUID for pre-auth single-tenant use
const ORG_ID = '00000000-0000-0000-0000-000000000001';

// ─── GET /api/v1/settings/ai-config ──────────────────────────────────────────
// organisation_ai_config has no temperature/max_tokens/system_prompt_prefix
// columns — those are returned as defaults and accepted but not persisted.
// provider → primary_provider, model → primary_model.

router.get('/ai-config', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT primary_provider AS provider, primary_model AS model
       FROM organisation_ai_config
       LIMIT 1`
    );

    if (!rows.length) {
      return res.json(DEFAULTS);
    }

    return res.json({
      provider:             rows[0].provider,
      model:                rows[0].model,
      temperature:          DEFAULTS.temperature,
      max_tokens:           DEFAULTS.max_tokens,
      system_prompt_prefix: DEFAULTS.system_prompt_prefix,
    });
  } catch (err) {
    console.error('[settings/ai-config GET]', err.message);
    res.status(500).json({ message: 'Failed to fetch AI config', error: err.message });
  }
});

// ─── PATCH /api/v1/settings/ai-config ────────────────────────────────────────

router.patch('/ai-config', async (req, res) => {
  const {
    provider,
    model,
    temperature          = DEFAULTS.temperature,
    max_tokens           = DEFAULTS.max_tokens,
    system_prompt_prefix = DEFAULTS.system_prompt_prefix,
  } = req.body ?? {};

  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM organisation_ai_config LIMIT 1'
    );

    let savedProvider, savedModel;

    if (existing.length) {
      const sets = [];
      const vals = [];

      if (provider != null) {
        vals.push(provider);
        sets.push(`primary_provider = $${vals.length}`);
      }
      if (model != null) {
        vals.push(model);
        sets.push(`primary_model = $${vals.length}`);
      }

      if (sets.length === 0) {
        // Nothing to persist — re-read current values
        const { rows } = await pool.query(
          `SELECT primary_provider AS provider, primary_model AS model
           FROM organisation_ai_config WHERE id = $1`,
          [existing[0].id]
        );
        savedProvider = rows[0].provider;
        savedModel    = rows[0].model;
      } else {
        vals.push(existing[0].id);
        const { rows } = await pool.query(
          `UPDATE organisation_ai_config
           SET ${sets.join(', ')}, updated_at = NOW()
           WHERE id = $${vals.length}
           RETURNING primary_provider AS provider, primary_model AS model`,
          vals
        );
        savedProvider = rows[0].provider;
        savedModel    = rows[0].model;
      }
    } else {
      const { rows } = await pool.query(
        `INSERT INTO organisation_ai_config
           (organisation_id, primary_provider, primary_model,
            primary_api_key_encrypted, data_agreement_tier)
         VALUES ($1, $2, $3, '', 'standard')
         RETURNING primary_provider AS provider, primary_model AS model`,
        [ORG_ID, provider ?? DEFAULTS.provider, model ?? DEFAULTS.model]
      );
      savedProvider = rows[0].provider;
      savedModel    = rows[0].model;
    }

    return res.json({
      provider:             savedProvider,
      model:                savedModel,
      temperature,
      max_tokens,
      system_prompt_prefix,
    });
  } catch (err) {
    console.error('[settings/ai-config PATCH]', err.message);
    res.status(500).json({ message: 'Failed to update AI config', error: err.message });
  }
});

// ─── GET /api/v1/settings/tokeniser ──────────────────────────────────────────

router.get('/tokeniser', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, pattern, label, added_by, created_at
       FROM tokeniser_additions
       ORDER BY created_at DESC`
    );
    res.json({ additions: rows });
  } catch (err) {
    console.error('[settings/tokeniser GET]', err.message);
    res.status(500).json({ message: 'Failed to fetch tokeniser additions', error: err.message });
  }
});

// ─── POST /api/v1/settings/tokeniser ─────────────────────────────────────────

router.post('/tokeniser', async (req, res) => {
  const { pattern, label } = req.body ?? {};

  try {
    const { rows } = await pool.query(
      `INSERT INTO tokeniser_additions (pattern, label, added_by)
       VALUES ($1, $2, 'human')
       RETURNING id, pattern, label, added_by, created_at`,
      [pattern ?? null, label ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[settings/tokeniser POST]', err.message);
    res.status(500).json({ message: 'Failed to add tokeniser entry', error: err.message });
  }
});

export default router;
