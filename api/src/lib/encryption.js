import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'crypto';

// PRODUCTION NOTE: The encryption key is derived from JWT_SECRET for development
// convenience. In production this must move to a dedicated secrets manager
// (AWS KMS, GCP Cloud KMS, Azure Key Vault, or HashiCorp Vault) so that the
// key material never lives alongside the encrypted data.

const SALT = 'nuqe-ai-config-v1';
let _cachedKey = null;

function getKey() {
  if (_cachedKey) return _cachedKey;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set — cannot derive encryption key');
  // scrypt with N=16384, r=8, p=1 → 32-byte key suitable for AES-256
  _cachedKey = scryptSync(secret, SALT, 32, { N: 16384, r: 8, p: 1 });
  return _cachedKey;
}

// Returns "ivHex:authTagHex:ciphertextHex"
export function encrypt(plaintext) {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

export function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Malformed ciphertext — expected iv:authTag:data');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
