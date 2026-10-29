// Debts: home loan, personal loan, hand loan (flexible), other. Repayments are purchases with purchase.loanId.
// Outstanding for interest-bearing loans uses a reducing balance with interest accrued daily between payments
// (annual rate × days / 365), the way banks work out home and personal loans. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { netSpend } from './purchases.js';

export const LOAN_TYPES = ['home', 'personal', 'hand', 'other'];
export const LOAN_TYPE_LABEL = { home: 'Home loan', personal: 'Personal loan', hand: 'Hand loan', other: 'Other loan' };

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isPaise = (v) => Number.isInteger(v) && v > 0 && v <= 1_00_00_000_00_00;
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Standard EMI for a reducing-balance loan: P·r·(1+r)^n / ((1+r)^n − 1), r = monthly rate. Whole paise. */
export function emiFor(principalPaise, annualRateBps, months) {
  if (!(principalPaise > 0 && months > 0)) return null;
  const r = annualRateBps / 10000 / 12;
  if (!r) return Math.ceil(principalPaise / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principalPaise * r * f) / (f - 1));
}

/** Validates a loan draft. Hand loans only need a name and amount; others need rate, term and EMI (EMI can be worked out). */
export function validateLoan(d, existing = null, now = Date.now()) {
  const errors = {};
  const type = LOAN_TYPES.includes(d.type) ? d.type : 'other';
  const flexible = type === 'hand';
  const L = {
    name: String(d.name || '').trim(),
    type,
    lender: String(d.lender || '').trim(),
    principalPaise: d.principalPaise ?? null,
    startDate: String(d.startDate || '').trim(),
    annualRateBps: d.annualRateBps ?? null,
    termMonths: d.termMonths ?? null,
    emiPaise: d.emiPaise ?? null,
    openingPaise: d.openingPaise ?? null,   // outstanding when you started tracking (for a loan already running)
    openingDate: String(d.openingDate || '').trim(),
    notes: String(d.notes || '').trim(),
    status: d.status === 'closed' ? 'closed' : 'active',
  };
  if (!L.name) errors.name = 'Give the loan a name, for example "SBI home loan" or "From Ravi".';
  if (L.name.length > 60) errors.name = 'Keep the name under 60 characters.';
  if (L.lender.length > 60) errors.lender = 'Keep the lender under 60 characters.';
  if (!isPaise(L.principalPaise)) errors.principalPaise = 'Enter the amount borrowed.';
  if (!isDate(L.startDate)) errors.startDate = 'Pick the date the loan started.';
  if (L.annualRateBps !== null && !(Number.isInteger(L.annualRateBps) && L.annualRateBps >= 0 && L.annualRateBps <= 6000)) errors.annualRateBps = 'Interest rate must be between 0% and 60% a year.';
  if (L.termMonths !== null && !(Number.isInteger(L.termMonths) && L.termMonths >= 1 && L.termMonths <= 480)) errors.termMonths = 'Term must be 1 to 480 months.';
  if (L.emiPaise !== null && !isPaise(L.emiPaise)) errors.emiPaise = 'Enter the EMI amount.';
  if (!flexible) {
    if (L.annualRateBps === null && !errors.annualRateBps) errors.annualRateBps = 'Enter the interest rate (% a year).';
    if (L.termMonths === null && !errors.termMonths) errors.termMonths = 'Enter the term in months.';
    if (L.emiPaise === null && !errors.emiPaise && !errors.annualRateBps && !errors.termMonths && isPaise(L.principalPaise)) L.emiPaise = emiFor(L.principalPaise, L.annualRateBps, L.termMonths);
    if (L.emiPaise === null && !errors.emiPaise) errors.emiPaise = 'Enter the EMI amount.';
  }
  if (L.openingPaise !== null) {
    if (!(Number.isInteger(L.openingPaise) && L.openingPaise >= 0)) errors.openingPaise = 'Enter the outstanding amount.';
    if (!isDate(L.openingDate)) errors.openingDate = 'Pick the date of that outstanding amount.';
    else if (isDate(L.startDate) && L.openingDate < L.startDate) errors.openingDate = 'This date is before the loan started.';
  } else L.openingDate = '';
  if (L.notes.length > 500) errors.notes = 'Notes are too long (500 characters).';
  const s = scanForSensitiveData({ name: L.name, lender: L.lender, notes: L.notes });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, loan: { ...L, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/**
 * Where a loan stands after the repayments logged so far (purchases with loanId = loan.id, up to `today`).
 * Interest-bearing loans: balance starts at the opening outstanding (or the amount borrowed on the start date);
 * at each repayment, interest for the days since the last one is added, then the payment is taken off.
 * Hand loans: amount borrowed (or opening outstanding) minus repayments; any rate is shown but not charged.
 * Returns { outstandingPaise, paidPaise, interestPaise, principalPaidPaise, payments, lastPaid, emisLeft, endsAround, paidPercent, missingEarlier }.
 */
export function loanStatus(loan, purchases, today) {
  const from = loan.openingPaise != null && loan.openingDate ? loan.openingDate : loan.startDate;
  let balance = loan.openingPaise != null && loan.openingDate ? loan.openingPaise : loan.principalPaise;
  const start = balance;
  const pays = purchases.filter((p) => p.loanId === loan.id && p.date >= from && p.date <= today && netSpend(p) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const rate = loan.type === 'hand' ? 0 : (loan.annualRateBps || 0) / 10000;
  let last = from, paid = 0, interest = 0;
  for (const p of pays) {
    const add = Math.round(balance * rate * days(last, p.date) / 365);
    interest += add;
    const amt = netSpend(p);
    paid += amt;
    balance = Math.max(0, balance + add - amt);
    last = p.date;
  }
  let emisLeft = null, endsAround = null;
  if (balance > 0 && loan.emiPaise) {
    const r = rate / 12, E = loan.emiPaise;
    if (!r) emisLeft = Math.ceil(balance / E - 0.001);
    // A few rupees over from day-count differences should not add a whole extra EMI.
    else if (E > balance * r) emisLeft = Math.ceil(-Math.log(1 - (balance * r) / E) / Math.log(1 + r) - 0.05);
    if (emisLeft !== null) {
      const [y, m] = (pays.length ? last : today).split('-').map(Number);
      const t = (y * 12 + (m - 1)) + emisLeft;
      endsAround = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    }
  } else if (balance === 0) emisLeft = 0;
  return {
    outstandingPaise: balance, paidPaise: paid, interestPaise: interest, principalPaidPaise: Math.max(0, start - balance),
    payments: pays.length, lastPaid: pays.length ? last : null, emisLeft, endsAround,
    paidPercent: start ? Math.max(0, Math.min(100, Math.round(((start - balance) * 1000) / start) / 10)) : 0,
    // EMIs seem to be missing: more than ~45 days from the start (or opening date) to the first logged repayment.
    // The outstanding then includes interest for that whole time, so it will look too high.
    missingEarlier: loan.type !== 'hand' && days(from, pays.length ? pays[0].date : today) > 45,
  };
}

// Words that suggest a purchase is a loan repayment. Whole words, in the shop name and notes.
export const LOAN_WORDS = ['emi', 'loan', 'repayment', 'repay', 'installment', 'instalment', 'home loan', 'personal loan', 'hand loan', 'borrowed', 'lender', 'prepayment', 'part payment'];
const WORD_RE = new RegExp('(?:^|[^a-z0-9])(' + LOAN_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|') + ')(?![a-z0-9])', 'i');
export function looksLoanRelated({ merchant = '', notes = '', category = '' } = {}) {
  return category === 'emi' || WORD_RE.test(`${merchant} ${notes}`);
}
