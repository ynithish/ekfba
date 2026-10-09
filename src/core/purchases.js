// Purchase tracking: validation, duplicate detection, refunds, totals and milestone progress.
// Storage follows the NLNLALD roadmap: one record per month ("purchaseMonths/2026-10") holding a list of
// purchases, so the page never approaches the 25,000-document limit. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { CATEGORIES } from './rulepack.js';

export const PURCHASE_STATUSES = ['completed', 'pending', 'cancelled', 'refunded'];
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const MAX_PAISE = 1_00_00_000_00;

export const monthKey = (date) => date.slice(0, 7); // "2026-10"

/**
 * Validates a purchase draft. Returns { ok, purchase } or { ok: false, errors }.
 * `existing` keeps id and createdAt on edit.
 */
export function validatePurchase(d, existing = null, now = Date.now()) {
  const errors = {};
  const p = {
    date: d.date,
    merchant: String(d.merchant || '').trim(),
    category: d.category || 'other',
    channel: ['online', 'offline'].includes(d.channel) ? d.channel : null,
    amountPaise: d.amountPaise,
    cardId: d.cardId || '',
    status: d.status || 'completed',
    refundPaise: d.status === 'refunded' ? (d.refundPaise ?? d.amountPaise) : 0,
    offerUsed: !!d.offerUsed,
    discountPaise: d.discountPaise ?? null,
    estimatedSavingPaise: d.estimatedSavingPaise ?? null,
    recommendedCardId: d.recommendedCardId || null,
    source: d.source === 'ask' ? 'ask' : 'manual',
    orderRef: String(d.orderRef || '').trim(),
    notes: String(d.notes || '').trim(),
  };
  if (!isDate(p.date)) errors.date = 'Pick the purchase date.';
  if (!p.merchant) errors.merchant = 'Where did you spend?';
  if (p.merchant.length > 80) errors.merchant = 'Keep the name under 80 characters.';
  if (!CATEGORIES.includes(p.category)) errors.category = 'Pick a category.';
  if (!(Number.isInteger(p.amountPaise) && p.amountPaise > 0 && p.amountPaise <= MAX_PAISE)) errors.amountPaise = 'Enter the amount paid.';
  if (!p.cardId) errors.cardId = 'Which card did you use?';
  if (!PURCHASE_STATUSES.includes(p.status)) errors.status = 'Invalid status.';
  if (p.status === 'refunded' && !(Number.isInteger(p.refundPaise) && p.refundPaise > 0 && p.refundPaise <= (p.amountPaise || 0))) {
    errors.refundPaise = 'Refund must be more than ₹0 and not more than the amount paid.';
  }
  if (p.discountPaise !== null && !(Number.isInteger(p.discountPaise) && p.discountPaise >= 0)) errors.discountPaise = 'Invalid discount.';
  if (p.notes.length > 500) errors.notes = 'Notes are too long (500 characters).';
  const s = scanForSensitiveData({ merchant: p.merchant, notes: p.notes, orderRef: p.orderRef });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, purchase: { ...p, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/** Purchases that look like the same one entered twice: same date, card, amount and merchant, not cancelled. */
export function findDuplicates(p, all) {
  const key = (x) => `${x.date}|${x.cardId}|${x.amountPaise}|${x.merchant.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  return all.filter((x) => x.id !== p.id && x.status !== 'cancelled' && key(x) === key(p));
}

/** Amount that actually counts as spent: completed or refunded purchases minus refunds. Pending and cancelled count 0. */
export function netSpend(p) {
  if (p.status === 'completed') return p.amountPaise;
  if (p.status === 'refunded') return Math.max(0, p.amountPaise - (p.refundPaise || 0));
  return 0;
}

/** Flattens month records into one list, newest first. */
export function flattenMonths(months) {
  return months.flatMap((m) => m.purchases || []).sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
}

/* ---------------- Periods ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }

/**
 * The period of `type` containing `date`. Returns { start, end } (inclusive) or null when the card lacks
 * the date it needs (card_year needs issueDate; statement_cycle needs statementDay).
 */
export function periodContaining(type, date, card = {}) {
  const [y, m, d] = date.split('-').map(Number);
  switch (type) {
    case 'calendar_month': return { start: ymd(y, m, 1), end: ymd(y, m, lastDay(y, m)) };
    case 'calendar_quarter': { const q = Math.floor((m - 1) / 3); const sm = q * 3 + 1; return { start: ymd(y, sm, 1), end: ymd(y, sm + 2, lastDay(y, sm + 2)) }; }
    case 'calendar_year': return { start: ymd(y, 1, 1), end: ymd(y, 12, 31) };
    case 'card_year': {
      if (!isDate(card.issueDate)) return null;
      const [, im, id] = card.issueDate.split('-').map(Number);
      const anniv = (yy) => ymd(yy, im, Math.min(id, lastDay(yy, im)));
      const start = anniv(y) <= date ? anniv(y) : anniv(y - 1);
      const sy = Number(start.slice(0, 4));
      return { start, end: addDays(anniv(sy + 1), -1) };
    }
    case 'statement_cycle': {
      const sd = card.statementDay;
      if (!(Number.isInteger(sd) && sd >= 1 && sd <= 31)) return null;
      const dayIn = (yy, mm) => ymd(yy, mm, Math.min(sd, lastDay(yy, mm)));
      // Cycle runs from the day after one statement date to the next statement date.
      let endY = y, endM = m;
      if (date > dayIn(y, m)) { endM = m + 1; if (endM > 12) { endM = 1; endY++; } }
      const end = dayIn(endY, endM);
      let pm = endM - 1, py = endY; if (pm < 1) { pm = 12; py--; }
      return { start: addDays(dayIn(py, pm), 1), end };
    }
    default: return null;
  }
}

/** The period just before the one containing `date`. */
export function previousPeriod(type, date, card = {}) {
  const cur = periodContaining(type, date, card);
  return cur ? periodContaining(type, addDays(cur.start, -1), card) : null;
}

/* ---------------- Totals ---------------- */

/** Totals for purchases within [start, end]: { totalPaise, count, byCard: {id: paise}, byCategory: {cat: paise}, pendingPaise }. */
export function totals(purchases, start, end) {
  const out = { totalPaise: 0, count: 0, byCard: {}, byCategory: {}, pendingPaise: 0, savedPaise: 0 };
  for (const p of purchases) {
    if (p.date < start || p.date > end) continue;
    if (p.status === 'pending') { out.pendingPaise += p.amountPaise; continue; }
    const v = netSpend(p);
    if (!v) continue;
    out.totalPaise += v;
    out.count++;
    out.byCard[p.cardId] = (out.byCard[p.cardId] || 0) + v;
    out.byCategory[p.category] = (out.byCategory[p.category] || 0) + v;
    if (p.status === 'completed') out.savedPaise += p.discountPaise ?? p.estimatedSavingPaise ?? 0;
  }
  return out;
}

/* ---------------- Milestone progress ---------------- */

/** Whether a purchase counts toward a milestone under a card's rule pack. */
export function countsToward(p, milestone, pack) {
  for (const x of pack.exclusions || []) {
    if (!x.excludedFrom.includes('milestones')) continue;
    if (x.appliesTo?.categories?.includes(p.category)) return false;
  }
  const c = milestone.counts;
  if (c?.categories?.length && !c.categories.includes(p.category)) return false;
  if (c?.channel && c.channel !== 'any' && p.channel && c.channel !== p.channel) return false;
  return true;
}

/**
 * Progress of every milestone in a card's pack on `today`.
 * Returns [{ milestone, period, eligiblePaise, remainingPaise, percent, met, previous: {period, eligiblePaise, met}|null, missing }].
 */
export function milestoneProgress(card, pack, purchases, today) {
  const mine = purchases.filter((p) => p.cardId === card.id);
  return (pack.milestones || []).map((m) => {
    const period = periodContaining(m.period, today, card);
    if (!period) return { milestone: m, period: null, missing: m.period === 'card_year' ? 'issueDate' : 'statementDay' };
    const sum = (per) => mine.filter((p) => p.date >= per.start && p.date <= per.end && countsToward(p, m, pack)).reduce((a, p) => a + netSpend(p), 0);
    const eligiblePaise = sum(period);
    const prevPer = previousPeriod(m.period, today, card);
    const prevSum = prevPer ? sum(prevPer) : 0;
    return {
      milestone: m, period, eligiblePaise,
      remainingPaise: Math.max(0, m.thresholdPaise - eligiblePaise),
      percent: Math.min(100, Math.floor((eligiblePaise * 1000) / m.thresholdPaise) / 10),
      met: eligiblePaise >= m.thresholdPaise,
      previous: prevPer ? { period: prevPer, eligiblePaise: prevSum, met: prevSum >= m.thresholdPaise } : null,
      missing: null,
    };
  });
}
