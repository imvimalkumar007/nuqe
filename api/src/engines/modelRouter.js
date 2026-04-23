import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { decrypt } from '../lib/encryption.js';
import { tokenise, detokenise, auditTokenisation } from './piiTokeniser.js';

// ─── Fallback config when no organisation record exists ───────────────────────
// Uses the ambient ANTHROPIC_API_KEY. Tokenisation is disabled in fallback
// because no data-processing agreement has been confirmed for the org.
const FALLBACK = {
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  apiKey: () => process.env.ANTHROPIC_API_KEY,
  endpointUrl: null,
  tokenisationEnabled: false,
  isChallenger: false,
};

// ─── Step 1: Load org config (in-memory cache with 5-minute TTL) ─────────────
const _orgConfigCache = new Map(); // orgId → { config, expiresAt }
const ORG_CONFIG_TTL  = 5 * 60 * 1000;

export function clearOrgConfigCache(organisationId) {
  if (organisationId) _orgConfigCache.delete(organisationId);
  else _orgConfigCache.clear();
}

async function loadOrgConfig(organisationId) {
  if (!organisationId) return null;

  const cached = _orgConfigCache.get(organisationId);
  if (cached && Date.now() < cached.expiresAt) return cached.config;

  const { rows } = await pool.query(
    'SELECT * FROM organisation_ai_config WHERE organisation_id = $1 LIMIT 1',
    [organisationId]
  );
  const config = rows[0] ?? null;
  _orgConfigCache.set(organisationId, { config, expiresAt: Date.now() + ORG_CONFIG_TTL });
  return config;
}

// ─── Step 2: Select provider (primary vs challenger) ─────────────────────────
function selectProvider(config) {
  if (!config) {
    console.log('[modelRouter] no org config — using fallback (claude / claude-sonnet-4-6)');
    return FALLBACK;
  }

  const useChallenger =
    config.challenger_provider &&
    config.challenger_percentage > 0 &&
    Math.random() * 100 < config.challenger_percentage;

  const chosen = useChallenger
    ? {
        provider: config.challenger_provider,
        model: config.challenger_model,
        apiKey: () => decrypt(config.challenger_api_key_encrypted),
        endpointUrl: config.challenger_endpoint_url,
        tokenisationEnabled: config.tokenisation_enabled,
        isChallenger: true,
      }
    : {
        provider: config.primary_provider,
        model: config.primary_model,
        apiKey: () => decrypt(config.primary_api_key_encrypted),
        endpointUrl: config.primary_endpoint_url,
        tokenisationEnabled: config.tokenisation_enabled,
        isChallenger: false,
      };

  console.log(
    `[modelRouter] routing to ${chosen.isChallenger ? 'challenger' : 'primary'}: ` +
      `${chosen.provider} / ${chosen.model}`
  );
  return chosen;
}

// ─── Step 4: Provider dispatch ────────────────────────────────────────────────

async function callClaude({ model, apiKey, systemMessage, userMessage, maxTokens }) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: systemMessage,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });
  return {
    content: response.content[0]?.text ?? '',
    promptTokens: response.usage?.input_tokens ?? 0,
    completionTokens: response.usage?.output_tokens ?? 0,
  };
}

async function callOpenAI({ model, apiKey, endpointUrl, systemMessage, userMessage, maxTokens }) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey,
    ...(endpointUrl ? { baseURL: endpointUrl } : {}),
  });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
  });
  return {
    content: response.choices[0]?.message?.content ?? '',
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

async function callGemini({ model, apiKey, systemMessage, userMessage, maxTokens }) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemMessage,
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const result = await geminiModel.generateContent(userMessage);
  const meta = result.response.usageMetadata;
  return {
    content: result.response.text(),
    promptTokens: meta?.promptTokenCount ?? 0,
    completionTokens: meta?.candidatesTokenCount ?? 0,
  };
}

// custom: OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, etc.)
async function callCustom({ model, apiKey, endpointUrl, systemMessage, userMessage, maxTokens }) {
  if (!endpointUrl) throw new Error('custom provider requires primary_endpoint_url');
  // Re-use OpenAI SDK — it works against any OpenAI-compatible server
  return callOpenAI({ model, apiKey, endpointUrl, systemMessage, userMessage, maxTokens });
}

const DISPATCH = {
  claude:  callClaude,
  openai:  callOpenAI,
  gemini:  callGemini,
  custom:  callCustom,
};

// ─── Step 7: Persist provider metadata to ai_actions ─────────────────────────
async function updateAiAction(aiActionId, { provider, model, tokenisationApplied, lowConfidenceFlags }) {
  if (!aiActionId) return;
  try {
    await pool.query(
      `UPDATE ai_actions
       SET ai_provider               = $1,
           ai_model                  = $2,
           tokenisation_applied      = $3,
           tokenisation_low_confidence_flags = $4
       WHERE id = $5`,
      [provider, model, tokenisationApplied, lowConfidenceFlags, aiActionId]
    );
  } catch (err) {
    // Non-fatal: audit update failure should not surface as a user-facing error
    console.error(`[modelRouter] failed to update ai_action ${aiActionId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// complete(prompt, organisationId)
//
// prompt: {
//   systemMessage  : string           — instruction / system prompt
//   userMessage    : string           — user content (PII-tokenised if enabled)
//   maxTokens     ?: number           — default 1024
//   aiActionId    ?: string | null    — ai_actions row to backfill after response
// }
//
// Returns: {
//   content, provider, model,
//   tokenisationApplied, lowConfidenceFlags,
//   promptTokens, completionTokens
// }
// ─────────────────────────────────────────────────────────────────────────────
export async function complete(prompt, organisationId) {
  const { systemMessage, userMessage, maxTokens = 1024, aiActionId = null } = prompt;

  // Step 1 — load org config
  const config = await loadOrgConfig(organisationId);

  // Step 2 — select provider
  const selected = selectProvider(config);
  const { provider, model, endpointUrl, tokenisationEnabled, isChallenger } = selected;
  const apiKey = selected.apiKey(); // decrypt lazily

  // Step 3 — PII tokenisation
  let finalUserMessage = userMessage;
  let tokenMap = {};
  let lowConfidenceFlags = 0;
  let tokenisationApplied = false;

  if (tokenisationEnabled) {
    const result = tokenise(userMessage);
    finalUserMessage = result.tokenisedText;
    tokenMap = result.tokenMap;
    lowConfidenceFlags = result.lowConfidenceFlags;
    tokenisationApplied = true;
    console.log(
      `[modelRouter] tokenisation applied — ${Object.keys(tokenMap).length} tokens, ` +
        `${lowConfidenceFlags} low-confidence flags`
    );
    // Audit non-blocking — write token-type summary (not PII values) to audit_log
    if (aiActionId) {
      auditTokenisation(aiActionId, tokenMap, lowConfidenceFlags).catch((err) =>
        console.error('[modelRouter] auditTokenisation failed:', err.message)
      );
    }
  }

  // Step 4 — dispatch to provider
  const dispatch = DISPATCH[provider];
  if (!dispatch) throw new Error(`Unknown provider: ${provider}`);

  const raw = await dispatch({
    model,
    apiKey,
    endpointUrl,
    systemMessage,
    userMessage: finalUserMessage,
    maxTokens,
  });

  // Step 5 — detokenise response
  const content = tokenisationApplied
    ? detokenise(raw.content, tokenMap)
    : raw.content;

  // Step 6 — build standardised response
  const result = {
    content,
    provider,
    model,
    tokenisationApplied,
    lowConfidenceFlags,
    promptTokens: raw.promptTokens,
    completionTokens: raw.completionTokens,
  };

  // Step 7 — write provider metadata back to ai_actions (non-blocking)
  updateAiAction(aiActionId, result);

  return result;
}
