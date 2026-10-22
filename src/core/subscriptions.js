// Subscriptions: purchases that repeat (mobile recharges, OTT, broadband, AMC…). A purchase marks itself with
// purchase.subscription = { every } and the next due date follows from its date. Pure functions only.

import { formatShopName } from './merchants.js';

export const SUBSCRIPTION_PERIODS = [
  ['28d', 'Every 28 days'], ['monthly', 'Monthly'], ['56d', 'Every 56 days'], ['84d', 'Every 84 days'],
  ['quarterly', 'Every 3 months'], ['halfyearly', 'Every 6 months'], ['yearly', 'Yearly'], ['custom', 'Other…'],
];
export const CUSTOM_UNITS = ['days', 'months'];
const CUSTOM_MAX = { days: 730, months: 60 };
export const PERIOD_LABEL = Object.fromEntries(SUBSCRIPTION_PERIODS);
const DAYS = { '28d': 28, '56d': 56, '84d': 84 };
const MONTHS = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "Every 7 months", "Every 45 days", "Monthly"… for a subscription object (or a period key). */
export function subscriptionLabel(sub) {
  const s = typeof sub === 'string' ? { every: sub } : (sub || {});
  if (s.every === 'custom') return `Every ${s.count} ${s.count === 1 ? s.unit.replace(/s$/, '') : s.unit}`;
  return PERIOD_LABEL[s.every] || '';
}

/** The date one period after `date` (month periods keep the day, capped at the month's last day).
 *  `every` is a period key or a subscription object (custom periods use { every: 'custom', count, unit }). */
export function nextDueDate(date, every) {
  const s = typeof every === 'string' ? { every } : (every || {});
  const days = s.every === 'custom' ? (s.unit === 'days' ? s.count : 0) : DAYS[s.every];
  if (days) return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const add = s.every === 'custom' ? (s.unit === 'months' ? s.count : 0) : MONTHS[s.every];
  if (!add) return null;
  let [y, m, d] = date.split('-').map(Number);
  m += add; while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;
}

/** Validates a purchase's subscription field: null, or { every[, count, unit][, variable] }; undefined = invalid. */
export function normaliseSubscription(s) {
  if (!s || !s.every) return null;
  if (!PERIOD_LABEL[s.every]) return undefined;
  const out = { every: s.every };
  if (s.every === 'custom') {
    const count = Number(s.count);
    if (!CUSTOM_UNITS.includes(s.unit) || !Number.isInteger(count) || count < 1 || count > CUSTOM_MAX[s.unit]) return undefined;
    out.count = count; out.unit = s.unit;
  }
  if (s.variable) out.variable = true;
  return out;
}
const specKey = (s) => (s.every === 'custom' ? `custom:${s.count}${s.unit}` : s.every);

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
    const key = [merchant.toLowerCase(), specKey(p.subscription), p.applianceId || '', p.vehicleId || ''].join('|');
    const cur = map.get(key);
    if (!cur) map.set(key, { key, merchant, all: [p] });
    else cur.all.push(p);
  }
  return [...map.values()].map((s) => {
    const sorted = s.all.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const last = sorted[0];
    const recent = sorted.slice(0, 3);
    return { key: s.key, merchant: s.merchant, sub: last.subscription, every: last.subscription.every, label: subscriptionLabel(last.subscription),
      variable: !!last.subscription.variable, count: sorted.length,
      averagePaise: Math.round(recent.reduce((a, p) => a + p.amountPaise, 0) / recent.length / 100) * 100,
      last: last.date, nextDue: nextDueDate(last.date, last.subscription), amountPaise: last.amountPaise,
      cardId: last.cardId, applianceId: last.applianceId || null, vehicleId: last.vehicleId || null };
  }).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.merchant.localeCompare(b.merchant));
}

/**
 * This calendar month at a glance, for the Subscriptions header:
 * { paidPaise, paidCount, duePaise, dueCount, includesNonMonthly, monthStart, monthEnd }.
 * paid = subscription purchases dated this month (cancelled/pending excluded, refunds netted).
 * due  = every payment still expected up to the month end, from each subscription's next due date
 *        (overdue ones included; a 28-day plan can fall twice). Varying bills use the average of the last 3.
 * includesNonMonthly = a payment in `due` repeats on another cycle (quarterly, yearly, custom…), so the
 * total is only for this month and will not repeat every month.
 */
export function subscriptionMonthSummary(purchases, today) {
  const [y, m] = today.split('-').map(Number);
  const monthStart = `${y}-${pad(m)}-01`;
  const monthEnd = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
  let paidPaise = 0, paidCount = 0;
  for (const p of purchases) {
    if (!p.subscription?.every || p.date < monthStart || p.date > monthEnd) continue;
    const v = p.status === 'completed' ? p.amountPaise : p.status === 'refunded' ? Math.max(0, p.amountPaise - (p.refundPaise || 0)) : 0;
    if (v) { paidPaise += v; paidCount++; }
  }
  let duePaise = 0, dueCount = 0, includesNonMonthly = false;
  for (const s of subscriptionsFrom(purchases)) {
    const each = s.variable ? s.averagePaise : s.amountPaise;
    let d = s.nextDue, guard = 0;
    while (d && d <= monthEnd && guard++ < 40) {
      duePaise += each; dueCount++;
      if (!['28d', 'monthly'].includes(s.every)) includesNonMonthly = true;
      d = nextDueDate(d, s.sub);
    }
  }
  return { paidPaise, paidCount, duePaise, dueCount, includesNonMonthly, monthStart, monthEnd };
}
