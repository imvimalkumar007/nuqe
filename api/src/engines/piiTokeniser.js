import nlp from 'compromise';
import { pool } from '../db/pool.js';
import logger from '../logger.js';

// ─── Layer 1: Regex-based PII detection ──────────────────────────────────────
// Ordered most-specific-first so that precise patterns consume character ranges
// before broader ones run. The title-case name fallback is intentionally last
// and assigned layer 4 so it yields to vocab (L2) and NLP (L3) on overlap.

const L1_PATTERNS = [
  {
    type: 'LOANREF',
    // Nuqe internal loan ref: NQ-YYYY-NNNN
    regex: /\bNQ-\d{4}-\d{4}\b/g,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'NI',
    // Two letters, six digits, one letter — standard UK NI format
    regex: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/gi,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'EMAIL',
    regex: /[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/g,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'ACCOUNT',
    // 16-digit card: groups of 4 separated by space or dash
    regex: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
    confidence: 0.95,
    layer: 1,
  },
  {
    type: 'SORTCODE',
    // Exactly NN-NN-NN
    regex: /\b\d{2}-\d{2}-\d{2}\b/g,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'PHONE',
    // UK mobile: 07 prefix, 11 digits total (07XXX XXXXXX, with optional space)
    regex: /\b07\d{3}[\s\-]?\d{6}\b/g,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'PHONE',
    // UK landline: 01xxx, 02x, 03xx, 08xx — 11 digits including leading 0
    regex: /\b0(?:1\d{3}[\s\-]?\d{6}|2\d[\s\-]?\d{4}[\s\-]?\d{4}|3\d{2}[\s\-]?\d{3}[\s\-]?\d{4}|8\d{2}[\s\-]?\d{3}[\s\-]?\d{4})\b/g,
    confidence: 0.9,
    layer: 1,
  },
  {
    type: 'POSTCODE',
    // Standard UK postcode (SW1A 2AA, M1 1AE, EC1A 1BB, etc.)
    regex: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'AMOUNT',
    // £ followed by digits, optional thousands separator and decimal, optional scale
    regex: /£\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s?(?:k|K|thousand|million|bn|billion))?\b/g,
    confidence: 1.0,
    layer: 1,
  },
  {
    type: 'NAME',
    // Titled name: Mr/Mrs/Ms/Miss/Dr/Prof/Rev followed by one or two name words
    regex: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Rev)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    confidence: 0.92,
    layer: 1,
  },
  {
    type: 'ACCOUNT',
    // 8-digit standalone bank account — common but ambiguous (low confidence)
    regex: /\b\d{8}\b/g,
    confidence: 0.65,
    layer: 1,
  },
  {
    type: 'NAME',
    // Two-word title-case pattern without a title prefix.
    // Layer 4 = lower priority than vocab (L2) and NLP (L3); only fires when
    // neither of those has already claimed the span. Confidence < 0.8 so every
    // match is counted as a low-confidence flag.
    regex: /\b[A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}\b/g,
    confidence: 0.72,
    layer: 4,
  },
];

// ─── Layer 2: Vocabulary / domain-dictionary detection ────────────────────────
// Longest phrases first so that "Individual Voluntary Arrangement" is matched
// before "Arrangement" could theoretically be caught by something shorter.

const VOCAB = [
  // ── Debt charities → DEBTORG ─────────────────────────────────────────────
  { phrase: 'Christians Against Poverty', type: 'DEBTORG' },
  { phrase: 'Debt Advice Foundation',      type: 'DEBTORG' },
  { phrase: 'National Debtline',           type: 'DEBTORG' },
  { phrase: 'StepChange',                  type: 'DEBTORG' },
  { phrase: 'PayPlan',                     type: 'DEBTORG' },
  { phrase: 'CAP UK',                      type: 'DEBTORG' },

  // ── Benefit types → BENEFIT ──────────────────────────────────────────────
  { phrase: 'Personal Independence Payment', type: 'BENEFIT' },
  { phrase: 'Employment Support Allowance',  type: 'BENEFIT' },
  { phrase: "Jobseeker's Allowance",         type: 'BENEFIT' },
  { phrase: 'Jobseeker Allowance',           type: 'BENEFIT' },
  { phrase: 'Disability Living Allowance',   type: 'BENEFIT' },
  { phrase: 'Council Tax Reduction',         type: 'BENEFIT' },
  { phrase: 'Attendance Allowance',          type: 'BENEFIT' },
  { phrase: 'Housing Benefit',               type: 'BENEFIT' },
  { phrase: 'Universal Credit',              type: 'BENEFIT' },
  { phrase: 'PIP',                           type: 'BENEFIT' },
  { phrase: 'ESA',                           type: 'BENEFIT' },
  { phrase: 'JSA',                           type: 'BENEFIT' },
  { phrase: 'DLA',                           type: 'BENEFIT' },

  // ── Financial difficulty → VULNERABILITY ─────────────────────────────────
  { phrase: 'Individual Voluntary Arrangement', type: 'VULNERABILITY' },
  { phrase: 'County Court Judgment',            type: 'VULNERABILITY' },
  { phrase: 'administration order',             type: 'VULNERABILITY' },
  { phrase: 'debt management plan',             type: 'VULNERABILITY' },
  { phrase: 'debt relief order',                type: 'VULNERABILITY' },
  { phrase: 'sequestration',                    type: 'VULNERABILITY' },
  { phrase: 'bankruptcy',                       type: 'VULNERABILITY' },
  { phrase: 'IVA',                              type: 'VULNERABILITY' },
  { phrase: 'DMP',                              type: 'VULNERABILITY' },
  { phrase: 'CCJ',                              type: 'VULNERABILITY' },
  { phrase: 'DRO',                              type: 'VULNERABILITY' },

  // ── Vulnerability signals → VULNERABILITY ────────────────────────────────
  { phrase: 'recently bereaved',    type: 'VULNERABILITY' },
  { phrase: 'cognitive impairment', type: 'VULNERABILITY' },
  { phrase: 'learning disability',  type: 'VULNERABILITY' },
  { phrase: 'domestic violence',    type: 'VULNERABILITY' },
  { phrase: 'domestic abuse',       type: 'VULNERABILITY' },
  { phrase: 'serious illness',      type: 'VULNERABILITY' },
  { phrase: 'mental health',        type: 'VULNERABILITY' },
  { phrase: 'bereavement',          type: 'VULNERABILITY' },
  { phrase: 'depression',           type: 'VULNERABILITY' },
  { phrase: 'dementia',             type: 'VULNERABILITY' },
  { phrase: 'terminal',             type: 'VULNERABILITY' },
  { phrase: 'anxiety',              type: 'VULNERABILITY' },
  { phrase: 'PTSD',                 type: 'VULNERABILITY' },

  // ── External organisations → THIRDPARTY ──────────────────────────────────
  { phrase: 'Financial Ombudsman',  type: 'THIRDPARTY' },
  { phrase: 'Money Advice Service', type: 'THIRDPARTY' },
  { phrase: 'Citizens Advice',      type: 'THIRDPARTY' },
  { phrase: 'MoneyHelper',          type: 'THIRDPARTY' },
  { phrase: 'Samaritans',           type: 'THIRDPARTY' },
  { phrase: 'Shelter',              type: 'THIRDPARTY' },
  { phrase: 'FOS',                  type: 'THIRDPARTY' },
  { phrase: 'ICO',                  type: 'THIRDPARTY' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Detection collectors ─────────────────────────────────────────────────────

function collectL1Detections(text) {
  const detections = [];
  for (const { type, regex, confidence, layer } of L1_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      detections.push({ start: m.index, end: m.index + m[0].length, originalText: m[0], type, confidence, layer });
    }
  }
  return detections;
}

function collectL2Detections(text) {
  const detections = [];
  for (const { phrase, type } of VOCAB) {
    // Replace literal spaces with \s+ so phrases that span a line break are matched
    const escapedPhrase = escapeRegex(phrase).replace(/ /g, '\\s+');
    const regex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
    let m;
    while ((m = regex.exec(text)) !== null) {
      detections.push({ start: m.index, end: m.index + m[0].length, originalText: m[0], type, confidence: 1.0, layer: 2 });
    }
  }
  return detections;
}

function collectL3Detections(text) {
  const detections = [];
  const doc = nlp(text);

  const groups = [
    { entities: doc.people().json({ offset: true }),        type: 'NAME',         baseConf: { multi: 0.85, single: 0.60 } },
    { entities: doc.organizations().json({ offset: true }), type: 'ORGANISATION', baseConf: { multi: 0.82, single: 0.65 } },
    { entities: doc.places().json({ offset: true }),        type: 'LOCATION',     baseConf: { multi: 0.85, single: 0.70 } },
  ];

  for (const { entities, type, baseConf } of groups) {
    for (const e of entities) {
      if (!e.offset || !e.text) continue;
      const wordCount = e.text.trim().split(/\s+/).length;
      const confidence = wordCount >= 2 ? baseConf.multi : baseConf.single;
      detections.push({
        start: e.offset.start,
        end: e.offset.start + e.offset.length,
        originalText: e.text,
        type,
        confidence,
        layer: 3,
      });
    }
  }
  return detections;
}

// ─── Overlap resolution ───────────────────────────────────────────────────────
// Priority rule: lower layer number wins. Within the same layer, longer match wins.
// Processes higher-priority detections first, marks their spans as occupied,
// then skips any later detection whose span intersects an occupied range.

function resolveOverlaps(detections) {
  const sorted = [...detections].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;             // lower layer first
    return (b.end - b.start) - (a.end - a.start);                  // longer match first
  });

  const occupied = []; // accepted [start, end] ranges
  const accepted = [];

  for (const det of sorted) {
    const overlaps = occupied.some(([s, e]) => det.start < e && det.end > s);
    if (!overlaps) {
      accepted.push(det);
      occupied.push([det.start, det.end]);
    }
  }

  // Return in reading order for sequential index assignment
  return accepted.sort((a, b) => a.start - b.start);
}

// ─────────────────────────────────────────────────────────────────────────────
// tokenise(text)
// Runs all three layers, resolves overlaps, and applies replacements in one
// right-to-left pass to preserve character positions.
// ─────────────────────────────────────────────────────────────────────────────
export function tokenise(text) {
  if (!text) return { tokenisedText: text ?? '', tokenMap: {}, lowConfidenceFlags: 0 };

  const all = [
    ...collectL1Detections(text),
    ...collectL2Detections(text),
    ...collectL3Detections(text),
  ];

  const resolved = resolveOverlaps(all); // sorted by start position

  const tokenMap = {};
  let lowConfidenceFlags = 0;

  // Assign token IDs in reading order so [NAME-0] precedes [EMAIL-1] in text
  const tagged = resolved.map((det, i) => {
    const token = `[${det.type}-${i}]`;
    tokenMap[token] = det.originalText;
    if (det.confidence < 0.8) lowConfidenceFlags++;
    return { ...det, token };
  });

  // Apply right-to-left to keep earlier positions valid during replacement
  let result = text;
  for (const { start, end, token } of [...tagged].reverse()) {
    result = result.slice(0, start) + token + result.slice(end);
  }

  return { tokenisedText: result, tokenMap, lowConfidenceFlags };
}

// ─────────────────────────────────────────────────────────────────────────────
// detokenise(text, tokenMap)
// Restores original values from a tokenMap produced by tokenise().
// Uses split/join to avoid regex interpretation of token bracket characters.
// ─────────────────────────────────────────────────────────────────────────────
export function detokenise(text, tokenMap) {
  if (!text || !tokenMap || Object.keys(tokenMap).length === 0) return text;
  let result = text;
  for (const [token, original] of Object.entries(tokenMap)) {
    result = result.split(token).join(original);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// auditTokenisation(actionId, tokenMap, lowConfidenceFlags)
// Writes a token-type summary to audit_log. The original PII values are never
// written — only counts and derived flags that help compliance reviewers
// understand what categories of sensitive data were present.
// ─────────────────────────────────────────────────────────────────────────────
export async function auditTokenisation(actionId, tokenMap, lowConfidenceFlags) {
  const typeCounts = {};
  for (const token of Object.keys(tokenMap)) {
    const m = token.match(/^\[([A-Z]+)-\d+\]$/);
    if (m) typeCounts[m[1]] = (typeCounts[m[1]] ?? 0) + 1;
  }

  const summary = {
    totalTokens:              Object.keys(tokenMap).length,
    lowConfidenceFlags,
    typeCounts,
    hasVulnerabilityIndicators: Boolean(typeCounts.VULNERABILITY),
    hasBenefitIndicators:       Boolean(typeCounts.BENEFIT),
    hasDebtOrgReferences:       Boolean(typeCounts.DEBTORG),
    hasThirdPartyReferences:    Boolean(typeCounts.THIRDPARTY),
  };

  try {
    await pool.query(
      `INSERT INTO audit_log
         (entity_type, entity_id, action, actor_type, new_value)
       VALUES ('ai_action', $1, 'tokenisation_applied', 'system', $2)`,
      [actionId, JSON.stringify(summary)]
    );
  } catch (err) {
    logger.error({ err }, 'piiTokeniser auditTokenisation failed');
  }
}
