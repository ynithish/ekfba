// Vehicles and vehicle-related spending (fuel, washes, service, insurance and so on).
// A purchase can name one vehicle through purchase.vehicleId. Pure functions only.

import { scanForSensitiveData } from './sensitive.js';
import { netSpend } from './purchases.js';

export const VEHICLE_TYPES = ['car', 'bike', 'scooter', 'other'];
export const VEHICLE_TYPE_LABEL = { car: 'Car', bike: 'Bike', scooter: 'Scooter', other: 'Other vehicle' };

/** Validates a vehicle draft. Returns { ok, vehicle } or { ok: false, errors }. */
export function validateVehicle(d, existing = null, now = Date.now()) {
  const errors = {};
  const v = {
    name: String(d.name || '').trim(),
    type: VEHICLE_TYPES.includes(d.type) ? d.type : 'car',
    notes: String(d.notes || '').trim(),
    status: d.status === 'archived' ? 'archived' : 'active',
  };
  if (!v.name) errors.name = 'Give the vehicle a name, for example "Swift" or "Activa".';
  if (v.name.length > 40) errors.name = 'Keep the name under 40 characters.';
  if (v.notes.length > 300) errors.notes = 'Notes are too long (300 characters).';
  const s = scanForSensitiveData({ name: v.name, notes: v.notes });
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
