# Data schema (local IndexedDB `ekfba`, version 1)

Defined in `src/core/schema.js`. All records: `id` (UUID), `createdAt`, `updatedAt` (ISO), `version` (int, increments on edit).
Money fields end in `Paise` (integer). Dates are `YYYY-MM-DD`.

| Store | Purpose | Status |
|---|---|---|
| `cards` | Wallet cards (identity, fees, status) | ✅ Phase 1 |
| `settings` | key/value app settings (`lastBackupAt`, …) | ✅ Phase 1 |
| `outbox` | Local change log for future sync (never exported) | ✅ written, consumed in Phase 6 |
| `sources` | Official URL / document refs, fetched-at, content hash | Phase 2 |
| `ruleVersions` | Immutable versions of a card's rules | Phase 2 |
| `benefits` | Baseline earn rates, caps, exclusions, fees | Phase 2 |
| `offers` | Merchant/platform offers with validity and conditions | Phase 2 |
| `milestones` | Threshold rules: amount, period type, eligibility | Phase 5 |
| `transactionEvents` | Append-only purchase events (created/edited/cancelled/refunded) | Phase 4 |
| `assessments` | Per-transaction eligibility per milestone, with rule version | Phase 4–5 |
| `reminders` | Due reminders | Phase 5 |

## `cards` record
| Field | Type | Notes |
|---|---|---|
| bank, name | string | required |
| kind | `credit` \| `debit` | required |
| network | Visa, Mastercard, RuPay, American Express, Diners Club, Other | required |
| variant, tier | string | variant restrictions on offers match this |
| holder | `primary` \| `add-on` | |
| nickname, last4 | string | at least one required; last4 exactly 4 digits |
| joiningFeePaise, annualFeePaise | int \| null | |
| issueDate | date | drives membership-year / anniversary periods |
| statementDay | 1–31 \| null | drives statement-cycle periods |
| status | `active` \| `deactivated` \| `replaced` \| `archived` | never hard-deleted |
| replacedById | card id \| null | |
| sourceUrls | string[] | http(s) only |
| notes | string ≤ 2000 | scanned for sensitive data |
| lastVerifiedAt | ISO \| null | set when a rule pack is approved |

## Backup file
Plain: `{ format: "ekfba-backup", schemaVersion: 1, appVersion, exportedAt, stores: { <store>: [...] } }`
Encrypted: `{ format: "ekfba-encrypted", v: 1, kdf: {PBKDF2, SHA-256, iterations, salt}, cipher: {AES-GCM, iv}, data }`
