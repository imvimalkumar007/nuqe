/**
 * IMAP polling service.
 *
 * Polls every 60 seconds across all active channels that have IMAP credentials.
 * For each channel mailbox: fetches UNSEEN messages, parses them, matches to
 * existing cases via In-Reply-To / subject case ref, creates communications,
 * and runs complaint classification on genuinely new emails.
 *
 * Design choice: polling over IMAP IDLE because Render free dynos spin down
 * after 15 min inactivity — persistent IMAP IDLE connections would be dropped.
 * Polling is robust across any infrastructure tier.
 */

import { ImapFlow }      from 'imapflow';
import { simpleParser } from 'mailparser';
import { pool }          from '../db/pool.js';
import { decrypt }       from '../utils/crypto.js';
import { classifyCommunication } from '../engines/communicationEngine.js';
import logger from '../logger.js';

const POLL_INTERVAL_MS = 60_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export function startImapPolling() {
  logger.info('IMAP polling service started (60s interval)');
  pollAllChannels();
  setInterval(pollAllChannels, POLL_INTERVAL_MS);
}

// ─── Poll all channels ────────────────────────────────────────────────────────

async function pollAllChannels() {
  let channels;
  try {
    const { rows } = await pool.query(
      `SELECT id, inbound_email, imap_host, imap_port, imap_username,
              imap_password, imap_tls, last_synced_at
       FROM channels
       WHERE is_active = TRUE
         AND imap_host IS NOT NULL
         AND imap_username IS NOT NULL
         AND imap_password IS NOT NULL`
    );
    channels = rows;
  } catch (err) {
    logger.error({ err }, 'IMAP: failed to load channels');
    return;
  }

  for (const channel of channels) {
    try {
      await pollChannel(channel);
    } catch (err) {
      logger.error({ err, channelId: channel.id }, 'IMAP: channel poll failed');
    }
  }
}

// ─── Poll one channel mailbox ─────────────────────────────────────────────────

async function pollChannel(channel) {
  const password = decrypt(channel.imap_password);
  if (!password) {
    logger.error({ channelId: channel.id }, 'IMAP: password decrypt failed');
    return;
  }

  const client = new ImapFlow({
    host:   channel.imap_host,
    port:   channel.imap_port ?? 993,
    secure: channel.imap_tls ?? true,
    auth: {
      user: channel.imap_username,
      pass: password,
    },
    logger: false,
    emitLogs: false,
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch unseen messages; on first poll look back 24 hours
      const since = channel.last_synced_at
        ? new Date(channel.last_synced_at)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const uids = await client.search({ seen: false, since }, { uid: true });

      if (uids.length > 0) {
        logger.info({ channelId: channel.id, count: uids.length }, 'IMAP: new messages');

        for await (const msg of client.fetch(uids, { source: true, flags: true }, { uid: true })) {
          try {
            await processMessage(msg, channel);
            // Mark as seen so we don't reprocess
            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          } catch (err) {
            logger.error({ err, uid: msg.uid, channelId: channel.id }, 'IMAP: message processing failed');
          }
        }
      }

      await pool.query(
        `UPDATE channels
         SET last_synced_at = NOW(), connection_status = 'connected', connection_error = NULL
         WHERE id = $1`,
        [channel.id]
      );
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error({ err, channelId: channel.id }, 'IMAP: connection failed');
    await pool.query(
      `UPDATE channels SET connection_status = 'error', connection_error = $1 WHERE id = $2`,
      [err.message?.slice(0, 500), channel.id]
    ).catch(() => {});
  } finally {
    try { await client.logout(); } catch { /* already disconnected */ }
  }
}

// ─── Process one IMAP message ─────────────────────────────────────────────────

async function processMessage(msg, channel) {
  // Parse raw RFC 2822 message
  const parsed = await simpleParser(msg.source);

  const senderAddress = parsed.from?.value?.[0]?.address?.toLowerCase()?.trim() ?? '';
  const subject       = parsed.subject ?? '(no subject)';
  const bodyPlain     = parsed.text    ?? '';
  const bodyHtml      = parsed.html    ?? '';
  const body          = bodyHtml || bodyPlain;

  // Strip angle brackets from headers
  const clean = (v) => (v ?? '').replace(/[<>]/g, '').trim() || null;
  const msgId    = clean(parsed.messageId);
  const replyTo  = clean(parsed.inReplyTo);

  if (!senderAddress) return; // skip undeliverable/bounce messages

  // ── 1. Thread match ─────────────────────────────────────────────────────────

  let caseId = null;

  if (replyTo) {
    const { rows } = await pool.query(
      `SELECT case_id FROM communications
       WHERE message_id = $1 AND case_id IS NOT NULL LIMIT 1`,
      [replyTo]
    );
    caseId = rows[0]?.case_id ?? null;
  }

  if (!caseId) {
    const refMatch = subject.match(/\bNQ-\d{4}-\d{4,}\b/i);
    if (refMatch) {
      const { rows } = await pool.query(
        `SELECT id FROM cases WHERE case_ref ILIKE $1 LIMIT 1`,
        [refMatch[0]]
      );
      caseId = rows[0]?.id ?? null;
    }
  }

  const dbClient = await pool.connect();
  let commId = null;

  try {
    await dbClient.query('BEGIN');

    // ── 2. Lookup or create customer ──────────────────────────────────────────

    let customer;
    {
      const { rows } = await dbClient.query(
        `SELECT * FROM customers WHERE email = $1 LIMIT 1`,
        [senderAddress]
      );
      customer = rows[0] ?? null;
    }

    if (!customer) {
      const displayName = parsed.from?.value?.[0]?.name?.trim() || senderAddress;
      const { rows } = await dbClient.query(
        `INSERT INTO customers (full_name, email, jurisdiction)
         VALUES ($1, $2, 'UK') RETURNING *`,
        [displayName, senderAddress]
      );
      customer = rows[0];
    }

    // ── 3. Create new case if no thread match ─────────────────────────────────

    if (!caseId) {
      const { rows: rsRows } = await dbClient.query(
        `SELECT id FROM ruleset WHERE jurisdiction = 'UK' AND is_active = TRUE LIMIT 1`
      );
      const rulesetId = rsRows[0]?.id;
      if (rulesetId) {
        const { rows: caseRows } = await dbClient.query(
          `INSERT INTO cases (customer_id, ruleset_id, channel_received, channel_id)
           VALUES ($1, $2, 'email', $3) RETURNING id`,
          [customer.id, rulesetId, channel.id]
        );
        caseId = caseRows[0].id;
      }
    } else {
      // Stamp channel on existing case if not set
      await dbClient.query(
        `UPDATE cases SET channel_id = $1 WHERE id = $2 AND channel_id IS NULL`,
        [channel.id, caseId]
      );
    }

    // ── 4. Check for duplicate (same Message-ID already stored) ───────────────

    if (msgId) {
      const { rows: dupRows } = await dbClient.query(
        `SELECT id FROM communications WHERE message_id = $1 LIMIT 1`,
        [msgId]
      );
      if (dupRows.length) {
        await dbClient.query('ROLLBACK');
        return; // already processed
      }
    }

    // ── 5. Store the communication ────────────────────────────────────────────

    const { rows: commRows } = await dbClient.query(
      `INSERT INTO communications
         (case_id, customer_id, channel, direction, subject, body, body_plain,
          author_type, message_id, in_reply_to)
       VALUES ($1, $2, 'email', 'inbound', $3, $4, $5, 'customer', $6, $7)
       RETURNING id`,
      [caseId, customer.id, subject, body, bodyPlain, msgId, replyTo]
    );
    commId = commRows[0].id;

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // ── 6. Classify new (non-reply) emails ────────────────────────────────────

  if (commId && !replyTo) {
    try {
      await classifyCommunication(commId);
    } catch (err) {
      logger.error({ err, commId }, 'IMAP: classification failed');
    }
  }
}

// ─── IMAP connection test ─────────────────────────────────────────────────────

/**
 * Test IMAP credentials without polling.
 * Throws on failure with a descriptive message.
 */
export async function testImapConnection({ host, port, username, password, tls }) {
  const client = new ImapFlow({
    host,
    port:   port ?? 993,
    secure: tls ?? true,
    auth: { user: username, pass: password },
    logger: false,
    emitLogs: false,
  });
  await client.connect();
  await client.logout();
}
