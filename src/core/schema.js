// Single source of truth for local database layout. Bump DB_VERSION and add a migration step
// whenever a store or index changes; never edit an existing migration.

export const DB_NAME = 'ekfba';
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 1; // schemaVersion of the credit_cards module backup envelope

/** store name -> { keyPath, indexes: [[name, keyPath, options]] } */
export const STORES = {
  cards: { keyPath: 'id', indexes: [['status', 'status'], ['bank', 'bank']] },
  sources: { keyPath: 'id', indexes: [['cardId', 'cardId']] },
  ruleVersions: { keyPath: 'id', indexes: [['cardId', 'cardId']] },
  benefits: { keyPath: 'id', indexes: [['cardId', 'cardId'], ['ruleVersionId', 'ruleVersionId']] },
  offers: { keyPath: 'id', indexes: [['cardId', 'cardId'], ['validTo', 'validTo']] },
  milestones: { keyPath: 'id', indexes: [['cardId', 'cardId']] },
  transactionEvents: { keyPath: 'id', indexes: [['transactionId', 'transactionId'], ['cardId', 'cardId'], ['dedupeKey', 'dedupeKey']] },
  assessments: { keyPath: 'id', indexes: [['transactionId', 'transactionId'], ['milestoneId', 'milestoneId']] },
  reminders: { keyPath: 'id', indexes: [['dueDate', 'dueDate']] },
  outbox: { keyPath: 'id', indexes: [['createdAt', 'createdAt']] },
  settings: { keyPath: 'key', indexes: [] },
  rulePacks: { keyPath: 'id', indexes: [['cardId', 'cardId']] }, // added in DB v2
};

/** Ordered migrations: index i upgrades from version i to i+1. */
export const MIGRATIONS = [
  // v0 -> v1: create every store above
  (db) => {
    for (const [name, def] of Object.entries(STORES)) {
      if (db.objectStoreNames.contains(name)) continue;
      const store = db.createObjectStore(name, { keyPath: def.keyPath });
      for (const [idx, path, opts] of def.indexes) store.createIndex(idx, path, opts || {});
    }
  },
  // v1 -> v2: approved rule-pack versions (Phase 2)
  (db) => {
    if (!db.objectStoreNames.contains('rulePacks')) db.createObjectStore('rulePacks', { keyPath: 'id' }).createIndex('cardId', 'cardId');
  },
];

/** Stores included in a backup. The outbox is device-local and is never exported. */
export const BACKUP_STORES = Object.keys(STORES).filter((s) => s !== 'outbox');
