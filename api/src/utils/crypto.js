/**
 * Shared AES-256-GCM encrypt/decrypt for channel credentials and API keys.
 * Uses the same key derivation as settings.js (ENCRYPTION_SECRET → scrypt).
 * A different salt ('channel-creds-salt') keeps this domain separate from
 * the settings.js AI key domain ('settings-salt').
 */

import crypto from 'crypto';

const ALG  = 'aes-256-gcm';
const SALT = 'channel-creds-salt';

function deriveKey() {
  const secret = process.env.ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret';
  return crypto.scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a plaintext string.
 * Returns a JSON string: { iv, tag, data } all hex-encoded.
 * Returns null if plaintext is null/empty.
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, deriveKey(), iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return JSON.stringify({
    iv:   iv.toString('hex'),
    tag:  tag.toString('hex'),
    data: enc.toString('hex'),
  });
}

/**
 * Decrypt a value produced by encrypt().
 * Returns null on failure (bad ciphertext, wrong key, tampered data).
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const { iv, tag, data } = JSON.parse(ciphertext);
    const decipher = crypto.createDecipheriv(ALG, deriveKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

/** Returns '••••' if ciphertext is set, null otherwise. */
export function mask(ciphertext) {
  return ciphertext ? '••••••••' : null;
}
