// Purchase tracking: validation, duplicate detection, refunds, totals and milestone progress.
// Storage follows the NLNLALD roadmap: one record per month ("purchaseMonths/2026-10") holding a list of
// purchases, so the page never approaches the 25,000-document limit. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { CATEGORIES } from './rulepack.js';

// Same rules as normaliseSubscription in subscriptions.js (kept here so purchases.js has no later-module import).
const SUB_PERIODS = ['28d', 'monthly', '56d', '84d', 'quarterly', 'halfyearly', 'yearly', 'custom'];
function normaliseSub(s) {
  if (!s || !s.every) return null;
  if (!SUB_PERIODS.includes(s.every)) return undefined;
  const out = { every: s.every };
  if (s.every === 'custom') {
    const n = Number(s.count), max = { days: 730, months: 60 }[s.unit];
    if (!max || !Number.isInteger(n) || n < 1 || n > max) return undefined;
    out.count = n; out.unit = s.unit;
  }
  if (s.variable) out.variable = true;
  return out;
}
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
    vehicleId: typeof d.vehicleId === 'string' && d.vehicleId ? d.vehicleId : null,
    applianceId: typeof d.applianceId === 'string' && d.applianceId ? d.applianceId : null,
    subscription: normaliseSub(d.subscription),
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
  if (p.subscription === undefined) { errors.subscription = 'Pick how often it repeats. For Other, enter a number of days (up to 730) or months (up to 60).'; }
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

/* ---------------- Credit card bills ---------------- */

function dayIn(y, m, day) { return ymd(y, m, Math.min(day, lastDay(y, m))); }

/** Payment due date for a bill generated on `billDate`, given the card's due day of month. */
export function dueDateFor(billDate, dueDay) {
  if (!(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31)) return null;
  const [y, m, d] = billDate.split('-').map(Number);
  if (dueDay > d) return dayIn(y, m, dueDay);
  const nm = m === 12 ? 1 : m + 1;
  return dayIn(m === 12 ? y + 1 : y, nm, dueDay);
}

/**
 * Bill dates and amounts for a credit card with a statement (bill generation) day. Returns null without one.
 * Amounts come from logged purchases; `payments` are bill payments ({ cardId, date, amountPaise }).
 * Payments made after the last bill date pay that bill first; anything extra counts against the next bill.
 * Returns {
 *   lastBill, lastDue, lastBilledPaise, lastPaidPaise, lastRemainingPaise, settledBill (last bill fully paid?),
 *   nextBill, nextDue, unbilledPaise, unbilledDuePaise (after any extra payment), payBy
 * } where payBy is the next payment still to make: the last bill if its due date is ahead and it is not fully
 * paid, else the next bill: { date, bill, amountPaise, paidPaise, remainingPaise, billed }.
 */
export function billingInfo(card, purchases, today, payments = []) {
  if (card.kind !== 'credit') return null;
  const cur = periodContaining('statement_cycle', today, card);
  if (!cur) return null;
  const prev = periodContaining('statement_cycle', addDays(cur.start, -1), card);
  const mine = purchases.filter((p) => p.cardId === card.id);
  const sum = (per) => mine.filter((p) => p.date >= per.start && p.date <= per.end).reduce((a, p) => a + netSpend(p), 0);
  const lastBill = prev.end;
  const lastDue = dueDateFor(lastBill, card.dueDay);
  const nextBill = cur.end;
  const nextDue = dueDateFor(nextBill, card.dueDay);
  const lastBilledPaise = sum(prev);
  const unbilledPaise = sum(cur);
  const paidSinceBill = payments.filter((x) => x.cardId === card.id && x.date > lastBill && x.date <= today)
    .reduce((a, x) => a + (x.amountPaise || 0), 0);
  const lastPaidPaise = Math.min(paidSinceBill, lastBilledPaise);
  const lastRemainingPaise = lastBilledPaise - lastPaidPaise;
  const extra = paidSinceBill - lastPaidPaise;
  const unbilledDuePaise = Math.max(0, unbilledPaise - extra);
  const settledBill = lastBilledPaise > 0 && lastRemainingPaise === 0;
  // Nothing left to pay on the last bill (paid, or nothing logged for it): point at the next bill instead.
  const lastOpen = lastDue && lastDue >= today && lastRemainingPaise > 0;
  return {
    lastBill, lastDue, lastBilledPaise, lastPaidPaise, lastRemainingPaise, settledBill, paidSinceBillPaise: paidSinceBill, lastCycle: prev,
    nextBill, nextDue, unbilledPaise, unbilledDuePaise, currentCycle: cur,
    payBy: lastOpen ? { date: lastDue, bill: lastBill, amountPaise: lastBilledPaise, paidPaise: lastPaidPaise, remainingPaise: lastRemainingPaise, billed: true }
      : nextDue ? { date: nextDue, bill: nextBill, amountPaise: unbilledPaise, paidPaise: Math.min(extra, unbilledPaise), remainingPaise: unbilledDuePaise, billed: false } : null,
  };
}

/** Validates a credit card bill payment: { cardId, date, amountPaise, fromCardId?, note? }. */
export function validateBillPayment(d, existing = null, now = Date.now()) {
  const errors = {};
  const x = {
    cardId: d.cardId || '',
    date: d.date,
    amountPaise: d.amountPaise,
    fromCardId: d.fromCardId || null,
    note: String(d.note || '').trim(),
  };
  if (!x.cardId) errors.cardId = 'Which credit card did you pay?';
  if (!isDate(x.date)) errors.date = 'Pick the payment date.';
  if (!(Number.isInteger(x.amountPaise) && x.amountPaise > 0 && x.amountPaise <= MAX_PAISE)) errors.amountPaise = 'Enter the amount paid.';
  if (x.note.length > 200) errors.note = 'Keep the note under 200 characters.';
  const s = scanForSensitiveData({ note: x.note });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, payment: { ...x, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/* ---------------- Per-day spending ---------------- */

/**
 * Spend per day within [start, end]. Uses the same counting as totals() (pending and cancelled count 0).
 * Returns { days: { 'YYYY-MM-DD': { paise, count } }, todayPaise, averagePaise, elapsedDays, highest: {date, paise}|null }.
 * The average (rounded to whole rupees) is over the days of the period that have started (up to `today`), including days with no spend.
 */
export function dailySpend(purchases, start, end, today) {
  const days = {};
  for (const p of purchases) {
    if (p.date < start || p.date > end) continue;
    const v = netSpend(p);
    if (!v) continue;
    const d = (days[p.date] ||= { paise: 0, count: 0 });
    d.paise += v; d.count++;
  }
  const last = today < end ? today : end;
  const elapsedDays = last < start ? 0 : Math.round((Date.parse(last + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
  let total = 0, highest = null;
  for (const [date, d] of Object.entries(days)) {
    if (date <= last) total += d.paise;
    if (!highest || d.paise > highest.paise) highest = { date, paise: d.paise };
  }
  return {
    days,
    todayPaise: days[today]?.paise || 0,
    averagePaise: elapsedDays ? Math.round(total / elapsedDays / 100) * 100 : 0, // whole rupees
    elapsedDays,
    highest,
  };
}
