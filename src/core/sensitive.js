// Guards that stop sensitive card data from ever being stored.
// The app must never hold full card numbers, CVVs, PINs, OTPs or banking passwords.

function luhnValid(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Returns a reason string if the text appears to contain sensitive card data, otherwise null. */
export function findSensitiveData(text) {
  if (typeof text !== 'string' || !text) return null;
  // Runs of 12–19 digits, allowing spaces or dashes between groups (how card numbers are written).
  const runs = text.match(/\d(?:[ -]?\d){11,18}/g) || [];
  for (const run of runs) {
    const digits = run.replace(/[ -]/g, '');
    if (digits.length >= 13 && luhnValid(digits)) return 'looks like a full card number';
  }
  if (/\b(cvv|cvc|cvv2|card\s*verification)\b(?:\s*(?:is|no\.?|number))?\W{0,5}\d{3,4}\b/i.test(text)) return 'looks like a CVV';
  if (/\b(atm\s*pin|card\s*pin|pin)\b(?:\s*(?:is|no\.?|number))?\W{0,5}\d{4,6}\b/i.test(text)) return 'looks like a PIN';
  if (/\botp\b(?:\s*(?:is|code))?\W{0,5}\d{4,8}\b/i.test(text)) return 'looks like an OTP';
  if (/\b(net\s*banking|internet\s*banking|login)?\s*password\b\W{0,5}\S{4,}/i.test(text)) return 'looks like a password';
  return null;
}

/**
 * Walks any object/array and returns the first sensitive finding as {path, reason}, or null.
 * `exemptKeys` lists fields whose free text may legitimately hold long numbers (e.g. order references);
 * the forbidden-field-name check still applies to them.
 */
export function scanForSensitiveData(value, path = '', exemptKeys = ['orderRef', 'transactionRef', 'contentHash', 'id']) {
  const leaf = path.split('.').pop()?.replace(/\[\d+\]$/, '');
  if (typeof value === 'string' && exemptKeys.includes(leaf)) return null;
  if (typeof value === 'string') {
    const reason = findSensitiveData(value);
    return reason ? { path: path || '(value)', reason } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = scanForSensitiveData(value[i], `${path}[${i}]`, exemptKeys);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/^(cvv|cvc|pin|otp|password|cardNumber|pan)$/i.test(k) && v != null && v !== '') {
        return { path: path ? `${path}.${k}` : k, reason: `field "${k}" is not allowed` };
      }
      const hit = scanForSensitiveData(v, path ? `${path}.${k}` : k, exemptKeys);
      if (hit) return hit;
    }
  }
  return null;
}
