// Backup file format (pure logic, no storage access): build, validate and merge snapshots.

import { BACKUP_STORES, SCHEMA_VERSION } from './schema.js';
import { validateCard } from './card.js';
import { scanForSensitiveData } from './sensitive.js';
import { nowIso } from './ids.js';

export const BACKUP_FORMAT = 'ekfba-backup';

/** data: { storeName: record[] } */
export function buildBackup(data, appVersion) {
  const stores = {};
  for (const s of BACKUP_STORES) stores[s] = Array.isArray(data[s]) ? data[s] : [];
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion, exportedAt: nowIso(), stores };
}

/**
 * Validates a parsed backup object. Returns { ok, stores, summary, errors }.
 * Every card is re-validated; the whole file is scanned for sensitive data.
 */
export function validateBackup(obj) {
  const errors = [];
  if (!obj || obj.format !== BACKUP_FORMAT) return { ok: false, errors: ['This is not an EKFBA backup file.'] };
  if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [`Backup was made by a newer version of the app (format ${obj.schemaVersion}). Update the app first.`] };
  }
  const sensitive = scanForSensitiveData(obj.stores || {});
  if (sensitive) return { ok: false, errors: [`Refused: ${sensitive.path} ${sensitive.reason}.`] };

  const stores = {};
  for (const s of BACKUP_STORES) {
    const rows = obj.stores?.[s] ?? [];
    if (!Array.isArray(rows)) { errors.push(`"${s}" is not a list`); continue; }
    stores[s] = [];
    const seen = new Set();
    rows.forEach((row, i) => {
      const key = s === 'settings' ? row?.key : row?.id;
      if (!key || typeof key !== 'string') { errors.push(`${s}[${i}] has no id`); return; }
      if (seen.has(key)) { errors.push(`${s}[${i}] duplicate id ${key}`); return; }
      seen.add(key);
      if (s === 'cards') {
        const r = validateCard(row);
        if (!r.ok) { errors.push(`Card "${row.nickname || row.name || key}": ${Object.values(r.errors).join('; ')}`); return; }
        stores[s].push({ ...r.card, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version });
      } else {
        stores[s].push(row);
      }
    });
  }
  const summary = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, v.length]));
  return { ok: errors.length === 0, stores, summary, errors };
}

/**
 * Merges incoming records into existing ones by id. The record with the later updatedAt wins;
 * ties keep the existing record. Returns { merged, added, updated, unchanged }.
 */
export function mergeRecords(existing, incoming, key = 'id') {
  const map = new Map(existing.map((r) => [r[key], r]));
  let added = 0, updated = 0, unchanged = 0;
  for (const r of incoming) {
    const cur = map.get(r[key]);
    if (!cur) { map.set(r[key], r); added++; }
    else if ((r.updatedAt || '') > (cur.updatedAt || '')) { map.set(r[key], r); updated++; }
    else unchanged++;
  }
  return { merged: [...map.values()], added, updated, unchanged };
}
