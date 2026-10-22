// Appliances and devices (fridge, AC, mobile, laptop…), with optional AMC (annual maintenance contract) details.
// A purchase can name one item through purchase.applianceId. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { netSpend } from './purchases.js';

// Two groups: home appliances, and personal devices (mobile, laptop…) that also carry recharges and plans.
export const APPLIANCE_TYPES = {
  appliance: ['AC', 'Refrigerator', 'Washing machine', 'TV', 'Water purifier', 'Microwave', 'Geyser', 'Inverter', 'Chimney', 'Dishwasher', 'Other appliance'],
  device: ['Mobile', 'Laptop', 'Tablet', 'Smartwatch', 'Router / Wi-Fi', 'Other device'],
};
export const APPLIANCE_GROUP_LABEL = { appliance: 'Appliance', device: 'Device' };
export const groupOfType = (t) => (APPLIANCE_TYPES.device.includes(t) ? 'device' : 'appliance');

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isPaise = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1_00_00_000_00);

/** Validates an appliance/device draft. Returns { ok, item } or { ok: false, errors }. */
export function validateAppliance(d, existing = null, now = Date.now()) {
  const errors = {};
  const allTypes = [...APPLIANCE_TYPES.appliance, ...APPLIANCE_TYPES.device];
  const type = allTypes.includes(d.type) ? d.type : 'Other appliance';
  const a = d.amc || {};
  const amcOn = !!(d.amc && (a.provider || a.endDate || a.startDate || a.amountPaise));
  const item = {
    name: String(d.name || '').trim(),
    type,
    group: groupOfType(type),
    brand: String(d.brand || '').trim(),
    purchaseDate: String(d.purchaseDate || '').trim(),
    warrantyUntil: String(d.warrantyUntil || '').trim(),
    amc: amcOn ? {
      provider: String(a.provider || '').trim(),
      startDate: String(a.startDate || '').trim(),
      endDate: String(a.endDate || '').trim(),
      amountPaise: a.amountPaise ?? null,
      notes: String(a.notes || '').trim(),
    } : null,
    notes: String(d.notes || '').trim(),
    status: d.status === 'archived' ? 'archived' : 'active',
  };
  if (!item.name) errors.name = 'Give it a name, for example "Bedroom AC" or "iPhone 15".';
  if (item.name.length > 50) errors.name = 'Keep the name under 50 characters.';
  if (item.brand.length > 40) errors.brand = 'Keep the brand under 40 characters.';
  if (item.purchaseDate && !isDate(item.purchaseDate)) errors.purchaseDate = 'Use a valid date.';
  if (item.warrantyUntil && !isDate(item.warrantyUntil)) errors.warrantyUntil = 'Use a valid date.';
  if (item.amc) {
    if (!isDate(item.amc.endDate)) errors['amc.endDate'] = 'Add the date the AMC ends (its renewal date).';
    if (item.amc.startDate && !isDate(item.amc.startDate)) errors['amc.startDate'] = 'Use a valid date.';
    if (item.amc.startDate && isDate(item.amc.endDate) && item.amc.startDate > item.amc.endDate) errors['amc.endDate'] = 'The end date is before the start date.';
    if (!isPaise(item.amc.amountPaise)) errors['amc.amountPaise'] = 'Enter the AMC amount in rupees.';
    if (item.amc.provider.length > 60) errors['amc.provider'] = 'Keep the provider under 60 characters.';
  }
  if (item.notes.length > 500) errors.notes = 'Notes are too long (500 characters).';
  const s = scanForSensitiveData({ name: item.name, brand: item.brand, notes: item.notes, amc: item.amc });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, item: { ...item, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

// Words that suggest a purchase is for an appliance or device. Whole words, in the shop name and notes.
export const APPLIANCE_WORDS = [
  'recharge', 'prepaid', 'postpaid', 'mobile', 'phone', 'sim', 'data pack', 'airtel', 'jio', 'vodafone', 'vi', 'bsnl',
  'broadband', 'wifi', 'wi-fi', 'fiber', 'fibre', 'dth', 'tata play', 'laptop', 'tablet', 'ipad', 'iphone', 'charger', 'screen guard',
  'amc', 'warranty', 'extended warranty', 'repair', 'installation', 'ac', 'a/c', 'air conditioner', 'fridge', 'refrigerator',
  'washing machine', 'tv', 'television', 'purifier', 'ro', 'microwave', 'oven', 'geyser', 'inverter', 'chimney', 'dishwasher', 'vacuum',
];
const WORD_RE = new RegExp('(?:^|[^a-z0-9])(' + APPLIANCE_WORDS.map((w) => w.replace(/[/-]/g, '\\$&').replace(/ /g, '\\s+')).join('|') + ')(?![a-z0-9])', 'i');

/** True when a purchase looks like it is for an appliance or device. */
export function looksApplianceRelated({ merchant = '', notes = '', category = '' } = {}) {
  if (category === 'telecom') return true;
  return WORD_RE.test(`${merchant} ${notes}`);
}

/** Spend per item within [start, end]: { itemId: { paise, count } }, using purchase[key] (e.g. 'applianceId'). */
export function itemTotals(purchases, start, end, key = 'applianceId') {
  const out = {};
  for (const p of purchases) {
    if (!p[key] || p.date < start || p.date > end) continue;
    const v = netSpend(p);
    if (!v) continue;
    const t = (out[p[key]] ||= { paise: 0, count: 0 });
    t.paise += v; t.count++;
  }
  return out;
}
