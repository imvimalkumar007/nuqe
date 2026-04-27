import logger from '../logger.js';

let resendClient = null;

function getClient() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;
  return import('resend').then(({ Resend }) => {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
  });
}

/**
 * Send an email via Resend.
 * @param {object}   opts
 * @param {string}   opts.to          — recipient address
 * @param {string[]} [opts.cc]        — CC addresses
 * @param {string[]} [opts.bcc]       — BCC addresses
 * @param {string}   [opts.from]      — sender (falls back to FROM_EMAIL env var)
 * @param {string}   opts.subject
 * @param {string}   opts.text        — plain-text body
 * @param {string}   [opts.html]      — HTML body (auto-generated from text if omitted)
 * @param {string}   [opts.commId]    — Nuqe communication UUID (added as custom header
 *                                      so Resend delivery webhooks can match back)
 * @param {string}   [opts.messageId] — RFC Message-ID to set (enables reply threading)
 * @returns {Promise<{id?: string, skipped?: true}>}
 */
export async function sendEmail({ to, cc, bcc, from, subject, text, html, commId, messageId }) {
  const client = await getClient();

  if (!client) {
    logger.warn({ to, subject }, 'Email not sent — RESEND_API_KEY not configured');
    return { skipped: true };
  }

  const fromAddress = from ?? process.env.FROM_EMAIL ?? 'Nuqe Complaints <noreply@nuqe.io>';
  const htmlBody    = html ?? text.replace(/\n/g, '<br>');

  const headers = {};
  if (commId)    headers['X-Nuqe-Comm-Id'] = commId;
  if (messageId) headers['Message-ID']      = messageId;

  try {
    const payload = {
      from:    fromAddress,
      to:      [to],
      subject,
      text,
      html:    htmlBody,
      headers,
    };
    if (cc?.length)  payload.cc  = cc;
    if (bcc?.length) payload.bcc = bcc;

    const result = await client.emails.send(payload);
    logger.info({ to, subject, id: result.data?.id }, 'Email sent via Resend');
    return { id: result.data?.id };
  } catch (err) {
    logger.error({ err, to, subject }, 'Resend email failed');
    throw err;
  }
}
