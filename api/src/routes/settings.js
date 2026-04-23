import { Router } from 'express';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { clearOrgConfigCache } from '../engines/modelRouter.js';

const router = Router();

// Single-tenant fixed org; extend with req.user.organisation_id when multi-org is added
const ORG_ID = '10000000-0000-0000-0000-000000000001';

const DEFAULT_CONFIG = {
  primary_provider: null,
  primary_model: null,
  primary_api_key_encrypted: null,
  primary_endpoint_url: null,
  challenger_provider: null,
  challenger_model: null,
  challenger_api_key_encrypted: null,
  challenger_endpoint_url: null,
  challenger_percentage: 0,
  tokenisation_enabled: true,
  data_agreement_tier: 'standard',
};

// ─── Encryption helpers ───────────────────────────────────────────────────────

function deriveKey() {
  return crypto.scryptSync(process.env.JWT_SECRET ?? 'dev-secret', 'settings-salt', 32);
}

function encryptApiKey(plaintext) {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv:   iv.toString('hex'),
    tag:  tag.toString('hex'),
    data: enc.toString('hex'),
    hint: plaintext.slice(-4), // last 4 chars for masked display
  });
}

function maskApiKey(encrypted) {
  if (!encrypted) return null;
  try {
    const parsed = JSON.parse(encrypted);
    return `****${parsed.hint}`;
  } catch {
    return '****';
  }
}

function applyMasks(row) {
  return {
    ...row,
    primary_api_key_encrypted:    maskApiKey(row.primary_api_key_encrypted),
    challenger_api_key_encrypted: maskApiKey(row.challenger_api_key_encrypted),
  };
}

// ─── GET /api/v1/settings/ai-config ──────────────────────────────────────────

router.get('/ai-config', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM organisation_ai_config WHERE organisation_id = $1 LIMIT 1`,
      [ORG_ID]
    );
    if (!rows.length) return res.json(DEFAULT_CONFIG);
    res.json(applyMasks(rows[0]));
  } catch (err) {
    console.error('[settings/ai-config GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v1/settings/ai-config ─────────────────────────────────────────

router.post('/ai-config', async (req, res) => {
  const {
    primary_provider    = null,
    primary_model       = null,
    primary_api_key     = null,  // plaintext; never stored as-is
    primary_endpoint_url = null,
    challenger_provider    = null,
    challenger_model       = null,
    challenger_api_key     = null,
    challenger_endpoint_url = null,
    challenger_percentage  = 0,
    tokenisation_enabled   = true,
    data_agreement_tier    = 'standard',
  } = req.body ?? {};

  const encPrimary     = primary_api_key    != null ? encryptApiKey(primary_api_key)    : undefined;
  const encChallenger  = challenger_api_key != null ? encryptApiKey(challenger_api_key) : undefined;

  try {
    const { rows: existing } = await pool.query(
      `SELECT id, primary_api_key_encrypted, challenger_api_key_encrypted
       FROM organisation_ai_config WHERE organisation_id = $1`,
      [ORG_ID]
    );

    let saved;

    if (existing.length) {
      const { rows } = await pool.query(
        `UPDATE organisation_ai_config SET
           primary_provider            = COALESCE($2, primary_provider),
           primary_model               = COALESCE($3, primary_model),
           primary_api_key_encrypted   = COALESCE($4, primary_api_key_encrypted),
           primary_endpoint_url        = COALESCE($5, primary_endpoint_url),
           challenger_provider         = COALESCE($6, challenger_provider),
           challenger_model            = COALESCE($7, challenger_model),
           challenger_api_key_encrypted = COALESCE($8, challenger_api_key_encrypted),
           challenger_endpoint_url     = COALESCE($9, challenger_endpoint_url),
           challenger_percentage       = $10,
           tokenisation_enabled        = $11,
           data_agreement_tier         = $12,
           updated_at                  = NOW()
         WHERE organisation_id = $1
         RETURNING *`,
        [
          ORG_ID,
          primary_provider,
          primary_model,
          encPrimary     ?? null,
          primary_endpoint_url,
          challenger_provider,
          challenger_model,
          encChallenger  ?? null,
          challenger_endpoint_url,
          challenger_percentage,
          tokenisation_enabled,
          data_agreement_tier,
        ]
      );
      saved = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO organisation_ai_config
           (organisation_id, primary_provider, primary_model, primary_api_key_encrypted,
            primary_endpoint_url, challenger_provider, challenger_model,
            challenger_api_key_encrypted, challenger_endpoint_url,
            challenger_percentage, tokenisation_enabled, data_agreement_tier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          ORG_ID,
          primary_provider    ?? 'claude',
          primary_model       ?? 'claude-sonnet-4-6',
          encPrimary          ?? '',
          primary_endpoint_url,
          challenger_provider,
          challenger_model,
          encChallenger       ?? null,
          challenger_endpoint_url,
          challenger_percentage,
          tokenisation_enabled,
          data_agreement_tier,
        ]
      );
      saved = rows[0];
    }

    clearOrgConfigCache(ORG_ID);

    await pool.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, new_value)
       VALUES ('organisation_ai_config', $1, 'settings_updated', 'staff', $2)`,
      [
        saved.id,
        JSON.stringify({
          primary_provider:   saved.primary_provider,
          primary_model:      saved.primary_model,
          challenger_provider: saved.challenger_provider,
          challenger_model:   saved.challenger_model,
        }),
      ]
    );

    res.json(applyMasks(saved));
  } catch (err) {
    console.error('[settings/ai-config POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v1/settings/ai-config/test ────────────────────────────────────

router.post('/ai-config/test', async (req, res) => {
  const { provider, model, api_key } = req.body ?? {};
  const start = Date.now();
  try {
    const client = new Anthropic({ apiKey: api_key });
    await client.messages.create({
      model:      model ?? 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages:   [{ role: 'user', content: 'Respond with the single word OK' }],
    });
    res.json({
      success:          true,
      provider:         provider ?? 'anthropic',
      model:            model,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    res.json({
      success:          false,
      provider:         provider ?? 'anthropic',
      model:            model,
      response_time_ms: Date.now() - start,
      error:            err.message,
    });
  }
});

// ─── GET /api/v1/settings/tokeniser-additions ────────────────────────────────

router.get('/tokeniser-additions', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, pattern, label, added_by, created_at
       FROM tokeniser_additions ORDER BY created_at DESC`
    );
    res.json({ additions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v1/settings/tokeniser-additions ───────────────────────────────

router.post('/tokeniser-additions', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Keep legacy aliases
router.get('/tokeniser',  (req, res) => res.redirect(307, '/api/v1/settings/tokeniser-additions'));
router.post('/tokeniser', (req, res) => res.redirect(307, '/api/v1/settings/tokeniser-additions'));

export default router;
