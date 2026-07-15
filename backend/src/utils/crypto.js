/**
 * AES-256-GCM encryption helper for proctoring session payloads.
 *
 * Key derivation: PROCTOR_ENC_KEY env var (hex 64 chars) → 32-byte key.
 * If unset, falls back to JWT_SECRET-derived key with a warning. In
 * production the user MUST set PROCTOR_ENC_KEY to a strong 256-bit value.
 *
 *   Output format: base64(iv | tag | ciphertext)
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;     // GCM recommended
const TAG_LEN = 16;

let warned = false;
function getKey() {
  const hex = process.env.PROCTOR_ENC_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (!warned) {
    console.warn(
      '[proctoring] PROCTOR_ENC_KEY not set. Deriving from JWT_SECRET — DO NOT use in production.',
    );
    warned = true;
  }
  return crypto.createHash('sha256')
    .update(process.env.JWT_SECRET || 'fallback-key')
    .digest();
}

function encrypt(plain) {
  if (plain == null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(typeof plain === 'string' ? plain : JSON.stringify(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64) {
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    try { return JSON.parse(dec); } catch { return dec; }
  } catch (err) {
    return null;
  }
}

function newSessionToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

module.exports = { encrypt, decrypt, newSessionToken, sha256 };
