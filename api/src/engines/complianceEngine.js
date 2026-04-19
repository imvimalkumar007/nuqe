import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { retrieveContext } from './knowledgeLayer.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const IMPACT_SYSTEM = `\
You are a compliance analyst for a regulated digital lender operating across UK, India, and EU.
You will be given a JSON object containing:
  - case:       the open case record (ref, status, category, opened_at, channel)
  - customer:   the customer record (jurisdiction, vulnerable_flag)
  - deadlines:  the case's current unmet deadlines with their due dates
  - changes:    the rule_type-level differences between the current and proposed ruleset version

Produce a plain-English impact assessment for a compliance reviewer. Be specific about dates and days.

Return a JSON object only — no markdown fences:
{
  "summary": "<2–4 sentences describing the concrete impact on this case>",
  "affected_deadline_types": ["<rule_type>", ...],
  "risk_level": "low" | "medium" | "high",
  "recommended_action": "<one sentence — e.g. 'No action required', 'Re-calculate deadlines before activating', etc.>"
}

Risk guidance:
  high   – a threshold shortens and the case is already within or past the new threshold
  medium – a threshold changes and the existing deadline has not been met but is still ahead
  low    – only new rule types added, or changes do not affect this case's open deadlines`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAudit(client, { entityType, entityId, action, previousValue, newValue }) {
  await client.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_type, previous_value, new_value)
     VALUES ($1, $2, $3, 'system', $4, $5)`,
    [
      entityType,
      entityId,
      action,
      previousValue != null ? JSON.stringify(previousValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
    ]
  );
}

// Compares two arrays of ruleset rows keyed by rule_type.
// Returns an array of change objects describing what shifted.
function diffRulesets(currentRules, newRules) {
  const currentMap = new Map(currentRules.map((r) => [r.rule_type, r]));
  const newMap = new Map(newRules.map((r) => [r.rule_type, r]));
  const changes = [];

  for (const [ruleType, newRule] of newMap) {
    const cur = currentMap.get(ruleType);
    if (!cur) {
      changes.push({ change: 'added', rule_type: ruleType, old: null, new: newRule });
      continue;
    }
    const thresholdChanged =
      cur.threshold_days !== newRule.threshold_days ||
      cur.threshold_business_days !== newRule.threshold_business_days;
    const escalationChanged = cur.escalation_path !== newRule.escalation_path;
    const refChanged = cur.regulatory_ref !== newRule.regulatory_ref;

    if (thresholdChanged || escalationChanged || refChanged) {
      changes.push({
        change: 'modified',
        rule_type: ruleType,
        old: {
          threshold_days: cur.threshold_days,
          threshold_business_days: cur.threshold_business_days,
          escalation_path: cur.escalation_path,
          regulatory_ref: cur.regulatory_ref,
        },
        new: {
          threshold_days: newRule.threshold_days,
          threshold_business_days: newRule.threshold_business_days,
          escalation_path: newRule.escalation_path,
          regulatory_ref: newRule.regulatory_ref,
        },
      });
    }
  }

  for (const [ruleType, cur] of currentMap) {
    if (!newMap.has(ruleType)) {
      changes.push({ change: 'removed', rule_type: ruleType, old: cur, new: null });
    }
  }

  return changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveRuleset(jurisdiction)
// Returns all active ruleset rows for a jurisdiction, ordered by rule_type.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveRuleset(jurisdiction) {
  const { rows } = await pool.query(
    `SELECT * FROM ruleset
     WHERE jurisdiction = $1 AND is_active = TRUE
     ORDER BY rule_type`,
    [jurisdiction]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// assessRulesetImpact(newRulesetVersion, jurisdiction)
//
// Compares `newRulesetVersion` against the currently active version for the
// jurisdiction. For every open case whose unmet deadlines intersect the changed
// rule types, calls Claude to produce a plain-English impact summary and writes
// the result to ai_actions (status 'pending'). Returns a summary report.
//
// Assumes the new version rows already exist in the ruleset table (staged but
// not yet activated). A human compliance reviewer approves before activation.
// ─────────────────────────────────────────────────────────────────────────────
export async function assessRulesetImpact(newRulesetVersion, jurisdiction) {
  // ── 1. Load current active version ──────────────────────────────────────
  let currentVersion;
  let currentRules;
  let newRules;

  {
    const client = await pool.connect();
    try {
      // Most recently effective active version (effective_to IS NULL = still live)
      const { rows: versionRows } = await client.query(
        `SELECT DISTINCT version
         FROM ruleset
         WHERE jurisdiction = $1
           AND is_active = TRUE
           AND effective_to IS NULL
         ORDER BY version DESC
         LIMIT 1`,
        [jurisdiction]
      );
      if (!versionRows.length) {
        throw new Error(`No active ruleset found for jurisdiction: ${jurisdiction}`);
      }
      currentVersion = versionRows[0].version;

      if (currentVersion === newRulesetVersion) {
        throw new Error(
          `newRulesetVersion '${newRulesetVersion}' is already the active version`
        );
      }

      const { rows: cur } = await client.query(
        `SELECT * FROM ruleset WHERE jurisdiction = $1 AND version = $2 ORDER BY rule_type`,
        [jurisdiction, currentVersion]
      );
      currentRules = cur;

      const { rows: next } = await client.query(
        `SELECT * FROM ruleset WHERE jurisdiction = $1 AND version = $2 ORDER BY rule_type`,
        [jurisdiction, newRulesetVersion]
      );
      if (!next.length) {
        throw new Error(
          `No ruleset rows found for version '${newRulesetVersion}' in jurisdiction '${jurisdiction}'`
        );
      }
      newRules = next;
    } finally {
      client.release();
    }
  }

  // ── 2. Diff the two versions ─────────────────────────────────────────────
  const changes = diffRulesets(currentRules, newRules);
  if (!changes.length) {
    return {
      currentVersion,
      newRulesetVersion,
      jurisdiction,
      changes: [],
      affectedCases: 0,
      assessments: [],
      message: 'No rule differences detected — no impact assessments generated.',
    };
  }

  const changedRuleTypes = [
    ...new Set(changes.filter((c) => c.change !== 'added').map((c) => c.rule_type)),
  ];

  // ── 3. Find open cases whose unmet deadlines touch the changed rule types ─
  let affectedCases;
  {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT DISTINCT
           c.id, c.case_ref, c.status, c.category, c.opened_at, c.channel_received,
           c.is_implicit, cu.jurisdiction, cu.vulnerable_flag,
           json_agg(
             json_build_object(
               'deadline_type', d.deadline_type,
               'due_at',        d.due_at,
               'breached',      d.breached,
               'met_at',        d.met_at
             ) ORDER BY d.due_at
           ) FILTER (WHERE d.id IS NOT NULL) AS deadlines
         FROM cases c
         JOIN ruleset r      ON r.id = c.ruleset_id
         JOIN customers cu   ON cu.id = c.customer_id
         LEFT JOIN deadlines d
           ON d.case_id = c.id
          AND d.met_at IS NULL
          AND d.deadline_type = ANY($3)
         WHERE r.jurisdiction = $1
           AND r.version      = $2
           AND c.status NOT IN (
             'closed_upheld','closed_not_upheld','closed_withdrawn'
           )
         GROUP BY c.id, c.case_ref, c.status, c.category, c.opened_at,
                  c.channel_received, c.is_implicit, cu.jurisdiction, cu.vulnerable_flag
         HAVING bool_or(d.id IS NOT NULL)`,
        [jurisdiction, currentVersion, changedRuleTypes]
      );
      affectedCases = rows;
    } finally {
      client.release();
    }
  }

  if (!affectedCases.length) {
    return {
      currentVersion,
      newRulesetVersion,
      jurisdiction,
      changes,
      affectedCases: 0,
      assessments: [],
      message: `${changes.length} rule change(s) detected but no open cases are affected.`,
    };
  }

  // ── 4. Call Claude once per affected case, write ai_actions ──────────────
  const assessments = [];

  for (const kase of affectedCases) {
    // Narrow changes to the rule_types this case actually has open deadlines for
    const casesDeadlineTypes = new Set(
      (kase.deadlines ?? []).map((d) => d.deadline_type)
    );
    const relevantChanges = changes.filter(
      (c) => casesDeadlineTypes.has(c.rule_type) || c.change === 'added'
    );

    // Fetch time-anchored knowledge context for this case
    let knowledgeContext = [];
    try {
      knowledgeContext = await retrieveContext(
        relevantChanges.map((c) => c.rule_type).join(' '),
        {
          jurisdiction: kase.jurisdiction,
          asAtDate:     kase.opened_at,
          limit:        4,
        }
      );
    } catch {
      // best-effort — never fail an assessment over it
    }

    const contextPayload = {
      case: {
        case_ref: kase.case_ref,
        status: kase.status,
        category: kase.category,
        opened_at: kase.opened_at,
        channel_received: kase.channel_received,
        is_implicit: kase.is_implicit,
      },
      customer: {
        jurisdiction: kase.jurisdiction,
        vulnerable_flag: kase.vulnerable_flag,
      },
      deadlines: kase.deadlines ?? [],
      changes: relevantChanges,
      current_version: currentVersion,
      new_version: newRulesetVersion,
      knowledge_context: knowledgeContext,
    };

    const inputText = JSON.stringify(contextPayload, null, 2);

    let rawOutput;
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: IMPACT_SYSTEM,
            cache_control: { type: 'ephemeral' }, // shared across all cases in this run
          },
        ],
        messages: [{ role: 'user', content: inputText }],
      });
      rawOutput = response.content[0]?.text ?? '';
    } catch (err) {
      console.error(
        `[complianceEngine] Claude call failed for case ${kase.case_ref}:`,
        err.message
      );
      assessments.push({ case_ref: kase.case_ref, error: err.message });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      console.error(
        `[complianceEngine] Non-JSON output for case ${kase.case_ref}:`,
        rawOutput
      );
      assessments.push({ case_ref: kase.case_ref, error: 'non-JSON Claude output' });
      continue;
    }

    const client = await pool.connect();
    try {
      const { rows: actionRows } = await client.query(
        `INSERT INTO ai_actions
           (case_id, action_type, ai_input, ai_output, ai_model, status)
         VALUES ($1, 'ruleset_impact_assessment', $2, $3, $4, 'pending')
         RETURNING id`,
        [kase.id, inputText, rawOutput, MODEL]
      );
      const aiActionId = actionRows[0].id;

      await writeAudit(client, {
        entityType: 'ai_action',
        entityId: aiActionId,
        action: 'created',
        newValue: {
          action_type: 'ruleset_impact_assessment',
          case_ref: kase.case_ref,
          new_version: newRulesetVersion,
          risk_level: parsed.risk_level,
        },
      });

      assessments.push({
        case_ref: kase.case_ref,
        case_id: kase.id,
        ai_action_id: aiActionId,
        risk_level: parsed.risk_level,
        summary: parsed.summary,
        affected_deadline_types: parsed.affected_deadline_types,
        recommended_action: parsed.recommended_action,
      });
    } finally {
      client.release();
    }
  }

  const riskCounts = assessments.reduce(
    (acc, a) => {
      if (a.risk_level) acc[a.risk_level] = (acc[a.risk_level] ?? 0) + 1;
      return acc;
    },
    {}
  );

  console.log(
    `[complianceEngine] assessRulesetImpact: ${assessments.length} assessments written`,
    riskCounts
  );

  return {
    currentVersion,
    newRulesetVersion,
    jurisdiction,
    changes,
    affectedCases: affectedCases.length,
    riskCounts,
    assessments,
  };
}
