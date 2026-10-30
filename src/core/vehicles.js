// Vehicles and vehicle-related spending (fuel, washes, service, insurance and so on).
// A purchase can name one vehicle through purchase.vehicleId. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { netSpend } from './purchases.js';

export const VEHICLE_TYPES = ['car', 'bike', 'scooter', 'other'];
export const VEHICLE_TYPE_LABEL = { car: 'Car', bike: 'Bike', scooter: 'Scooter', other: 'Other vehicle' };

const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x + 'T00:00:00Z')) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const isHttps = (u) => /^https:\/\/\S+$/i.test(u || '');

/** Validates a vehicle draft (with optional RC and PUC details). Returns { ok, vehicle } or { ok: false, errors }. */
export function validateVehicle(d, existing = null, now = Date.now()) {
  const errors = {};
  const str = (x) => String(x || '').trim();
  const rcIn = d.rc || {}, pucIn = d.puc || {};
  const rc = { number: str(rcIn.number).toUpperCase().replace(/\s+/g, ' '), validUntil: str(rcIn.validUntil), url: str(rcIn.url) };
  const puc = { lastDate: str(pucIn.lastDate), expiryDate: str(pucIn.expiryDate), url: str(pucIn.url) };
  const v = {
    name: String(d.name || '').trim(),
    type: VEHICLE_TYPES.includes(d.type) ? d.type : 'car',
    notes: String(d.notes || '').trim(),
    status: d.status === 'archived' ? 'archived' : 'active',
    rc: rc.number || rc.validUntil || rc.url ? rc : null,
    puc: puc.lastDate || puc.expiryDate || puc.url ? puc : null,
  };
  if (!v.name) errors.name = 'Give the vehicle a name, for example "Swift" or "Activa".';
  if (v.name.length > 40) errors.name = 'Keep the name under 40 characters.';
  if (v.notes.length > 300) errors.notes = 'Notes are too long (300 characters).';
  if (v.rc) {
    if (v.rc.number.length > 15) errors['rc.number'] = 'Registration numbers are up to 15 characters, like TS 09 AB 1234.';
    if (v.rc.validUntil && !isDate(v.rc.validUntil)) errors['rc.validUntil'] = 'Use a valid date.';
    if (v.rc.url && !isHttps(v.rc.url)) errors['rc.url'] = 'Paste a link that starts with https://';
  }
  if (v.puc) {
    if (v.puc.lastDate && !isDate(v.puc.lastDate)) errors['puc.lastDate'] = 'Use a valid date.';
    if (!isDate(v.puc.expiryDate)) errors['puc.expiryDate'] = 'Add the PUC expiry date.';
    else if (v.puc.lastDate && isDate(v.puc.lastDate) && v.puc.expiryDate <= v.puc.lastDate) errors['puc.expiryDate'] = 'Expiry must be after the PUC date.';
    if (v.puc.url && !isHttps(v.puc.url)) errors['puc.url'] = 'Paste a link that starts with https://';
  }
  const s = scanForSensitiveData({ name: v.name, notes: v.notes, rc: v.rc && v.rc.number });
  if (s) errors[s.path] = `Not saved: ${s.reason}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, vehicle: { ...v, id: existing?.id || d.id, createdAt: existing?.createdAt || d.createdAt || now, updatedAt: now } };
}

// Words that suggest a purchase is about a vehicle. Matched as whole words in the shop name and notes.
export const VEHICLE_WORDS = [
  'fuel', 'petrol', 'diesel', 'cng', 'ev charging', 'charging station', 'petroleum', 'filling station', 'bunk',
  'car wash', 'bike wash', 'wash', 'washing', 'car care', 'bike care', 'detailing', 'car spa', 'coating', 'polish',
  'insurance', 'maintenance', 'service', 'servicing', 'service centre', 'service center', 'garage', 'mechanic', 'workshop',
  'tyre', 'tyres', 'tire', 'tires', 'puncture', 'wheel', 'alignment', 'balancing', 'battery', 'oil change', 'engine oil',
  'spare', 'spares', 'spare parts', 'accessories', 'parking', 'toll', 'fastag', 'puc', 'pollution check', 'emission',
  'rto', 'road tax', 'car', 'bike', 'scooter', 'scooty', 'two wheeler', 'vehicle', 'automobile', 'automobiles', 'motors',
];
const WORD_RE = new RegExp('\\b(' + VEHICLE_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|') + ')\\b', 'i');

/** True when a purchase looks vehicle-related: fuel category, or a vehicle word in the shop name or notes. */
export function looksVehicleRelated({ merchant = '', notes = '', category = '' } = {}) {
  if (category === 'fuel') return true;
  return WORD_RE.test(`${merchant} ${notes}`);
}

/** Spend per vehicle within [start, end]: { vehicleId: { paise, count, fuelPaise } }. */
export function vehicleTotals(purchases, start, end) {
  const out = {};
  for (const p of purchases) {
    if (!p.vehicleId || p.date < start || p.date > end) continue;
    const v = netSpend(p);
    if (!v) continue;
    const t = (out[p.vehicleId] ||= { paise: 0, count: 0, fuelPaise: 0 });
    t.paise += v; t.count++;
    if (p.category === 'fuel') t.fuelPaise += v;
  }
  return out;
}
