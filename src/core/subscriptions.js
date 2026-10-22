// Subscriptions: purchases that repeat (mobile recharges, OTT, broadband, AMC…). A purchase marks itself with
// purchase.subscription = { every } and the next due date follows from its date. Pure functions only.

import { formatShopName } from './merchants.js';

export const SUBSCRIPTION_PERIODS = [
  ['28d', 'Every 28 days'], ['monthly', 'Monthly'], ['56d', 'Every 56 days'], ['84d', 'Every 84 days'],
  ['quarterly', 'Every 3 months'], ['halfyearly', 'Every 6 months'], ['yearly', 'Yearly'],
];
export const PERIOD_LABEL = Object.fromEntries(SUBSCRIPTION_PERIODS);
const DAYS = { '28d': 28, '56d': 56, '84d': 84 };
const MONTHS = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The date one period after `date` (month periods keep the day, capped at the month's last day). */
export function nextDueDate(date, every) {
  if (DAYS[every]) return new Date(Date.parse(date + 'T00:00:00Z') + DAYS[every] * 86400000).toISOString().slice(0, 10);
  const add = MONTHS[every];
  if (!add) return null;
  let [y, m, d] = date.split('-').map(Number);
  m += add; while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;
}

/** Validates a purchase's subscription field: null, or { every } with a known period. */
export function normaliseSubscription(s) {
  if (!s || !s.every) return null;
  return PERIOD_LABEL[s.every] ? { every: s.every } : undefined; // undefined = invalid
}

/**
 * One entry per subscription (same shop name, linked item and period), from its latest purchase:
 * [{ key, merchant, every, last, nextDue, amountPaise, cardId, applianceId, vehicleId, count }], soonest due first.
 * Cancelled purchases are ignored.
 */
export function subscriptionsFrom(purchases) {
  const map = new Map();
  for (const p of purchases) {
    if (!p.subscription?.every || p.status === 'cancelled') continue;
    const merchant = formatShopName(p.merchant);
    const key = [merchant.toLowerCase(), p.subscription.every, p.applianceId || '', p.vehicleId || ''].join('|');
    const cur = map.get(key);
    if (!cur) map.set(key, { key, merchant, every: p.subscription.every, last: p, count: 1 });
    else { cur.count++; if (p.date > cur.last.date || (p.date === cur.last.date && (p.createdAt || 0) > (cur.last.createdAt || 0))) cur.last = p; }
  }
  return [...map.values()].map((s) => ({
    key: s.key, merchant: s.merchant, every: s.every, count: s.count,
    last: s.last.date, nextDue: nextDueDate(s.last.date, s.every), amountPaise: s.last.amountPaise,
    cardId: s.last.cardId, applianceId: s.last.applianceId || null, vehicleId: s.last.vehicleId || null,
  })).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.merchant.localeCompare(b.merchant));
}
