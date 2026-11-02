// Upcoming (planned) payments: school fees, municipal tax and anything else due on a date, with or without
// a known amount, once or repeating. Plus helpers to project any repeating payment into a given month.

import { scanForSensitiveData } from './sensitive.js';
import { nextDueDate, normaliseSubscription } from './subscriptions.js';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** First and last day of a "YYYY-MM" month. */
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
}
/** "YYYY-MM" `n` months after `ym`. */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Validates a planned payment: { name, dueDate, amountPaise|null, repeat: null|{every,count?,unit?}, notes }. */
export function validatePlanned(d, existing = null, now = Date.now()) {
  const errors = {};
  const p = {
    name: String(d.name || '').trim(),
    dueDate: String(d.dueDate || '').trim(),
    amountPaise: d.amountPaise ?? null,
    repeat: d.repeat && d.repeat.every ? normaliseSubscription(d.repeat) : null,
    notes: String(d.notes || '').trim(),
    status: d.status === 'done' ? 'done' : 'active',
    lastPaid: d.lastPaid || null,
  };
  if (!p.name) errors.name = 'What is the payment for? For example "School fees" or "Municipal tax".';
  if (p.name.length > 60) errors.name = 'Keep the name under 60 characters.';
  if (!isDate(p.dueDate)) errors.dueDate = 'Pick the date it is due.';
  if (p.amountPaise !== null && !(Number.isInteger(p.amountPaise) && p.amountPaise > 0 && p.amountPaise <= 1_00_00_000_00_00)) errors.amountPaise = 'Enter the amount, or leave it blank if not known yet.';
  if (p.repeat === undefined) errors.repeat = 'Pick how often it repeats. For Other, enter days (up to 730) or months (up to 60).';
  if (p.notes.length > 300) errors.notes = 'Notes are too long (300 characters).';
  const s = scanForSensitiveData({ name: p.name, notes: p.notes });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, planned: { ...p, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

/** After paying: a repeating payment moves to its next due date; a one-off is marked done. */
export function markPlannedPaid(p, paidDate) {
  if (p.repeat) {
    let next = nextDueDate(p.dueDate, p.repeat), guard = 0;
    while (next && next <= paidDate && guard++ < 400) next = nextDueDate(next, p.repeat); // paid late: skip to the next one ahead
    return { ...p, dueDate: next, lastPaid: paidDate };
  }
  return { ...p, status: 'done', lastPaid: paidDate };
}

/**
 * Dates within month `ym` for something first due on `firstDue` that repeats by `spec` ({every,…} or null).
 * Dates before `from` are skipped (so an overdue one counts once, on its own date, only if inside the month).
 */
export function datesInMonth(firstDue, spec, ym) {
  if (!isDate(firstDue)) return [];
  const { start, end } = monthBounds(ym);
  const out = [];
  let d = firstDue, guard = 0;
  while (d && d <= end && guard++ < 800) {
    if (d >= start) out.push(d);
    if (!spec) break;
    d = nextDueDate(d, spec);
  }
  return out;
}

/** Adds up a month's expected payments: { knownPaise, unknownCount, count }. */
export function forecastTotals(items) {
  let knownPaise = 0, unknownCount = 0;
  for (const x of items) { if (x.amountPaise) knownPaise += x.amountPaise; else unknownCount++; }
  return { knownPaise, unknownCount, count: items.length };
}
