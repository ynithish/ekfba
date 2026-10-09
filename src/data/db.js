// Minimal promise-based IndexedDB wrapper. All local persistence goes through here.

import { DB_NAME, DB_VERSION, MIGRATIONS, STORES } from '../core/schema.js';

let dbPromise = null;

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export function openDb(name = DB_NAME) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(name, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result;
      for (let v = e.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](db, r.transaction);
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; }; // another tab upgraded
      resolve(db);
    };
    r.onerror = () => { dbPromise = null; reject(r.error); };
    r.onblocked = () => reject(new Error('Close other EKFBA tabs and try again.'));
  });
  return dbPromise;
}

/** Runs fn(storesByName) inside one transaction; resolves after the transaction commits. */
export async function tx(storeNames, mode, fn) {
  const db = await openDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    Promise.resolve()
      .then(() => fn(stores, req))
      .then((r) => { result = r; })
      .catch((err) => { try { t.abort(); } catch { /* already finished */ } reject(err); });
  });
}

export const getAll = (store) => tx(store, 'readonly', (s, q) => q(s[store].getAll()));
export const get = (store, key) => tx(store, 'readonly', (s, q) => q(s[store].get(key)));
export const getAllByIndex = (store, index, value) =>
  tx(store, 'readonly', (s, q) => q(s[store].index(index).getAll(value)));

/** Reads every store at once (used for backups and the dashboard). */
export async function readAllStores(names = Object.keys(STORES)) {
  return tx(names, 'readonly', async (s, q) => {
    const out = {};
    for (const n of names) out[n] = await q(s[n].getAll());
    return out;
  });
}

/** Deletes the whole local database (used by "wipe this device"). */
export async function deleteDatabase(name = DB_NAME) {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
  await req(indexedDB.deleteDatabase(name));
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  const already = await navigator.storage.persisted();
  const persisted = already || (await navigator.storage.persist());
  return { supported: true, persisted };
}
