/**
 * Outbound email via per-channel SMTP (nodemailer).
 * Falls back to Resend when no channel SMTP is configured.
 *
 * The client's own SMTP credentials (e.g. Gmail App Password, M365 SMTP auth)
 * are stored encrypted in the channels table. This means every outbound email
 * appears to come FROM the client's own address — their domain, their branding.
 */

import nodemailer from 'nodemailer';
import { decrypt } from '../utils/crypto.js';
import { sendEmail as sendViaResend } from './emailService.js';
import logger from '../logger.js';

/**
 * Send an email using the channel's own SMTP credentials if configured,
 * otherwise fall back to Resend.
 *
 * @param {object} channel   — row from channels table (with encrypted passwords)
 * @param {object} opts
 * @param {string}   opts.to
 * @param {string[]} [opts.cc]
 * @param {string[]} [opts.bcc]
 * @param {string}   opts.subject
 * @param {string}   opts.text
 * @param {string}   [opts.html]
 * @param {string}   [opts.commId]      — stored as X-Nuqe-Comm-Id header
 * @param {string}   [opts.messageId]   — RFC Message-ID (for threading)
 * @returns {Promise<{ id?: string, skipped?: true }>}
 */
export async function sendViaChannel(channel, opts) {
  if (channel?.smtp_host && channel?.smtp_username && channel?.smtp_password) {
    return sendViaSmtp(channel, opts);
  }
  // No channel SMTP — fall back to Resend (org-level from_email)
  return sendViaResend({
    to:        opts.to,
    cc:        opts.cc,
    bcc:       opts.bcc,
    subject:   opts.subject,
    text:      opts.text,
    html:      opts.html,
    commId:    opts.commId,
    messageId: opts.messageId,
  });
}

async function sendViaSmtp(channel, opts) {
  const password = decrypt(channel.smtp_password);
  if (!password) {
    logger.error({ channelId: channel.id }, 'SMTP password decrypt failed');
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host:   channel.smtp_host,
    port:   channel.smtp_port ?? 587,
    secure: channel.smtp_tls ?? true,
    auth: {
      user: channel.smtp_username,
      pass: password,
    },
  });

  const from = channel.smtp_from ?? channel.inbound_email ?? channel.smtp_username;

  const headers = {};
  if (opts.commId)    headers['X-Nuqe-Comm-Id'] = opts.commId;
  if (opts.messageId) headers['Message-ID']      = opts.messageId;

  try {
    const info = await transporter.sendMail({
      from,
      to:      opts.to,
      cc:      opts.cc,
      bcc:     opts.bcc,
      subject: opts.subject,
      text:    opts.text,
      html:    opts.html ?? opts.text?.replace(/\n/g, '<br>'),
      headers,
    });
    logger.info({ to: opts.to, subject: opts.subject, messageId: info.messageId }, 'Email sent via channel SMTP');
    return { id: info.messageId };
  } catch (err) {
    logger.error({ err, channelId: channel.id, to: opts.to }, 'Channel SMTP send failed');
    throw err;
  }
}

/**
 * Test an SMTP connection with the provided (un-encrypted) credentials.
 * Used by the channel test endpoint to verify before saving.
 */
export async function testSmtpConnection({ host, port, username, password, tls }) {
  const transporter = nodemailer.createTransport({
    host,
    port:   port ?? 587,
    secure: tls ?? true,
    auth: { user: username, pass: password },
  });
  await transporter.verify();
}
