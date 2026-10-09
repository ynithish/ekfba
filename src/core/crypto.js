// Passphrase-based encryption for backups (and, later, cloud sync and app lock).
// AES-256-GCM with a key derived by PBKDF2-SHA-256. Uses only the browser's built-in WebCrypto.

const ITERATIONS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function checkPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 10) {
    return 'Use at least 10 characters. A short sentence you can remember works well.';
  }
  return null;
}

/** Encrypts any JSON-serialisable value. Returns a JSON-serialisable envelope. */
export async function encryptJson(value, passphrase) {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return {
    format: 'ekfba-encrypted',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(ct),
  };
}

export function isEncryptedEnvelope(obj) {
  return !!obj && obj.format === 'ekfba-encrypted' && obj.v === 1 && typeof obj.data === 'string';
}

/** Decrypts an envelope produced by encryptJson. Throws a friendly error on a wrong passphrase or tampering. */
export async function decryptJson(envelope, passphrase) {
  if (!isEncryptedEnvelope(envelope)) throw new Error('This is not an EKFBA encrypted backup file.');
  const key = await deriveKey(passphrase, fromB64(envelope.kdf.salt), envelope.kdf.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.cipher.iv) }, key, fromB64(envelope.data));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged.');
  }
}
