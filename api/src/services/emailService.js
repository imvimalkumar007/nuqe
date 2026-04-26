/**
 * Email sending via Resend (https://resend.com).
 * Falls back to a no-op log if RESEND_API_KEY is not configured,
 * so the API never crashes when email is unconfigured.
 */

import logger from '../logger.js';

let resendClient = null;

function getClient() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;
  // Lazy-import so the module loads even when resend is not installed
  return import('resend').then(({ Resend }) => {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
  });
}

/**
 * Send an email.
 * @param {object} opts
 * @param {string}   opts.to       — recipient address
 * @param {string}  [opts.from]    — sender (falls back to FROM_EMAIL env var)
 * @param {string}   opts.subject  — email subject line
 * @param {string}   opts.text     — plain-text body
 * @param {string}  [opts.html]    — HTML body (generated from text if omitted)
 * @returns {Promise<{id?: string, skipped?: true}>}
 */
export async function sendEmail({ to, from, subject, text, html }) {
  const client = await getClient();

  if (!client) {
    logger.warn({ to, subject }, 'Email not sent — RESEND_API_KEY not configured');
    return { skipped: true };
  }

  const fromAddress = from
    ?? process.env.FROM_EMAIL
    ?? 'Nuqe Complaints <noreply@nuqe.io>';

  const htmlBody = html ?? text.replace(/\n/g, '<br>');

  try {
    const result = await client.emails.send({
      from:    fromAddress,
      to:      [to],
      subject,
      text,
      html:    htmlBody,
    });
    logger.info({ to, subject, id: result.data?.id }, 'Email sent via Resend');
    return { id: result.data?.id };
  } catch (err) {
    logger.error({ err, to, subject }, 'Resend email failed');
    throw err;
  }
}
