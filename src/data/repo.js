// Repository layer: the only place UI code goes to read or change data.
// Every change also writes an outbox entry so Phase 6 sync can replay it.

import { tx, getAll, get, readAllStores, deleteDatabase } from './db.js';
import { validateCard } from '../core/card.js';
import { buildBackup, validateBackup, mergeRecords } from '../core/backup.js';
import { encryptJson, decryptJson, isEncryptedEnvelope } from '../core/crypto.js';
import { BACKUP_STORES } from '../core/schema.js';
import { uuid, nowIso } from '../core/ids.js';

export const APP_VERSION = '0.1.0';

const outboxEntry = (store, recordId, op) => ({ id: uuid(), store, recordId, op, createdAt: nowIso() });

/* ---------------- Cards ---------------- */

export async function listCards({ includeArchived = false } = {}) {
  const cards = await getAll('cards');
  return cards
    .filter((c) => includeArchived || c.status !== 'archived')
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.bank.localeCompare(b.bank) || a.name.localeCompare(b.name));
}

export const getCard = (id) => get('cards', id);

/** Creates or updates a card. Returns { ok, card } or { ok:false, errors }. */
export async function saveCard(draft) {
  const existing = draft.id ? await get('cards', draft.id) : null;
  if (existing && draft.version != null && draft.version !== existing.version) {
    return { ok: false, errors: { _form: 'This card was changed elsewhere. Reload it and try again.' } };
  }
  const result = validateCard(draft, existing);
  if (!result.ok) return result;
  await tx(['cards', 'outbox'], 'readwrite', (s) => {
    s.cards.put(result.card);
    s.outbox.put(outboxEntry('cards', result.card.id, existing ? 'update' : 'create'));
  });
  return result;
}

/** Status changes keep history: cards are never hard-deleted, only archived. */
export async function setCardStatus(id, status, { replacedById = null } = {}) {
  const card = await get('cards', id);
  if (!card) return { ok: false, errors: { _form: 'Card not found' } };
  return saveCard({ ...card, status, replacedById: status === 'replaced' ? replacedById : null });
}

/* ---------------- Settings ---------------- */

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await tx('settings', 'readwrite', (s) => { s.settings.put({ key, value, updatedAt: nowIso() }); });
}

/* ---------------- Backup / restore ---------------- */

export async function exportBackup({ passphrase = null } = {}) {
  const data = await readAllStores(BACKUP_STORES);
  const backup = buildBackup(data, APP_VERSION);
  const payload = passphrase ? await encryptJson(backup, passphrase) : backup;
  await setSetting('lastBackupAt', nowIso());
  return payload;
}

/** Parses + validates a backup without changing anything. Returns { ok, needsPassphrase, stores, summary, errors }. */
export async function previewBackup(text, passphrase = null) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, errors: ['The file is not valid JSON.'] }; }
  if (isEncryptedEnvelope(obj)) {
    if (!passphrase) return { ok: false, needsPassphrase: true, errors: [] };
    try { obj = await decryptJson(obj, passphrase); } catch (e) { return { ok: false, needsPassphrase: true, errors: [e.message] }; }
  }
  return validateBackup(obj);
}

/**
 * Applies a validated backup. mode "replace" makes this device an exact copy of the backup;
 * mode "merge" keeps newer records from either side. All-or-nothing: one transaction.
 */
export async function applyBackup(stores, mode = 'merge') {
  const names = BACKUP_STORES;
  const stats = {};
  await tx(names, 'readwrite', async (s, q) => {
    for (const n of names) {
      const incoming = stores[n] || [];
      const key = n === 'settings' ? 'key' : 'id';
      if (mode === 'replace') {
        await q(s[n].clear());
        for (const r of incoming) s[n].put(r);
        stats[n] = { added: incoming.length, updated: 0, unchanged: 0 };
      } else {
        const existing = await q(s[n].getAll());
        const m = mergeRecords(existing, incoming, key);
        for (const r of m.merged) s[n].put(r);
        stats[n] = { added: m.added, updated: m.updated, unchanged: m.unchanged };
      }
    }
  });
  return stats;
}

export async function wipeDevice() {
  await deleteDatabase();
}

export async function counts() {
  const all = await readAllStores(['cards', 'transactionEvents', 'offers', 'outbox']);
  const cards = all.cards.filter((c) => c.status === 'active');
  return {
    activeCredit: cards.filter((c) => c.kind === 'credit').length,
    activeDebit: cards.filter((c) => c.kind === 'debit').length,
    totalCards: all.cards.length,
    transactions: all.transactionEvents.length,
    offers: all.offers.length,
    pendingSync: all.outbox.length,
  };
}
