// Money is always stored as an integer number of paise (₹1 = 100 paise).
// Never store or compute rupee amounts as floating-point numbers.

export const PAISE_PER_RUPEE = 100;

/** Parse user input like "15,000", "₹1,50,000.50", "65k", "1.2L" into paise. Returns null if invalid. */
export function parseRupeesToPaise(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * PAISE_PER_RUPEE);
  }
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase().replace(/₹|rs\.?|inr|,|\s/g, '');
  if (!s) return null;
  let multiplier = 1;
  const suffix = s.match(/(k|l|lakh|lakhs|lac|cr|crore)$/);
  if (suffix) {
    const u = suffix[1];
    multiplier = u === 'k' ? 1e3 : (u === 'cr' || u === 'crore') ? 1e7 : 1e5;
    s = s.slice(0, -u.length);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !(multiplier > 1 && /^\d+(\.\d+)?$/.test(s))) return null;
  const [whole, frac = ''] = s.split('.');
  // Exact integer arithmetic on the digit strings, avoiding float error.
  const fracPaiseDigits = (frac + '00').slice(0, 2);
  let paise = BigInt(whole) * 100n + BigInt(fracPaiseDigits);
  if (multiplier > 1) {
    // For suffixed values allow more decimals (e.g. 1.25L) and round to the paisa.
    const scale = 10n ** BigInt(frac.length);
    const units = BigInt(whole + frac);
    const num = units * BigInt(multiplier) * 100n;
    paise = (num + scale / 2n) / scale;
  }
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}

/** Format paise as Indian-grouped rupees: 23500000 -> "₹2,35,000". Shows paise only when non-zero. */
export function formatPaise(paise, { showSign = false } = {}) {
  if (!Number.isInteger(paise)) throw new TypeError('formatPaise expects integer paise');
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const digits = String(rupees);
  let grouped;
  if (digits.length <= 3) grouped = digits;
  else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  const frac = rem ? '.' + String(rem).padStart(2, '0') : '';
  const sign = neg ? '−' : (showSign && paise > 0 ? '+' : '');
  return `${sign}₹${grouped}${frac}`;
}

/** Percentage of a paise amount, given in basis points (1% = 100 bps), rounded down to the paisa. */
export function percentOf(paise, basisPoints) {
  return Math.floor((paise * basisPoints) / 10000);
}

/** Progress as a percentage with one decimal, capped to [0, 100]. */
export function progressPercent(achieved, required) {
  if (required <= 0) return 100;
  const p = Math.floor((achieved * 1000) / required) / 10;
  return Math.max(0, Math.min(100, p));
}
