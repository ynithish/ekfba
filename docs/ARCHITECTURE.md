# EKFBA Card Manager — Architecture (v1.0)

Date: 9 Oct 2026 · Status: **Accepted** (9 Oct 2026) — GitHub Pages hosting, Claude-chat rule extraction, Drive sync in Phase 6.

## 0. What the build environment actually allows (checked, not assumed)

| Capability | Status | Consequence |
|---|---|---|
| Claude's cloud workspace: Node 22, Python 3.13, git | ✅ Available | I can write code and run automated tests here. |
| GitHub (clone/push via a repo you attach) | ✅ Reachable | GitHub is the source of truth for code; you never need a laptop. |
| npm registry from the workspace | ❌ Blocked | No `npm install`, no Vite/React build step. Design must work **without a build pipeline**. |
| Bank websites from the workspace shell | ❌ Blocked | Bank pages are read via Claude's web-fetch tool in chat, or by your upload. Never silently assumed. |
| Your device | Phone browser only | Everything you do is in a browser: GitHub web UI, the app itself, Claude chat. |

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| UI | **Plain modern JavaScript (ES modules) + Web Components**, hand-written CSS | No build step needed (npm is blocked), nothing to compile, editable in GitHub's web editor, fast on phones, zero framework lock-in. |
| Local database | **IndexedDB** via a small in-repo wrapper (~150 lines) | Native to every browser, works offline, structured, large capacity. |
| Offline | **Service worker** (cache-first for app shell, versioned) + Web App Manifest | Installable PWA on Android (Chrome) and iPhone (Safari → Add to Home Screen). |
| Rule + recommendation engine | **Pure JS modules, no DOM, no network** | Same code runs in the browser and in Node tests here. Deterministic, auditable. |
| Money | Integer **paise** everywhere | No floating-point rounding errors in ₹ calculations. |
| Hosting | **GitHub Pages** (free HTTPS) | Service workers require HTTPS; push-to-deploy; no server to manage. Code is public-safe because **no personal data ever lives in the repo**. (Cloudflare Pages is the alternative if you want a private repo.) |
| Cloud backup / multi-device | **Your Google Drive, hidden app-data folder**, client-side encrypted (Phase 6) | Uses the Google One storage you already pay for; no server; least-privilege scope (`drive.appdata` only — the app cannot see your other Drive files). |
| AI extraction | **Claude in this Project** (default) → produces a validated "Card Rule Pack" JSON you import | Uses your Claude Pro plan; no API keys in the app; your documents never go to any extra provider. Optional later: an API-backed extractor. |
| Tests | Node's built-in test runner here + an in-app self-test page | Every engine rule and acceptance scenario gets an automated test before I call it done. |

**Considered and rejected for now:** React/Vite (needs a build pipeline we can't run), Flutter (needs a laptop toolchain; the PWA covers Android + iOS today), Supabase/Firebase (adds a server, accounts and keys before they're needed — can be added later behind the same sync interface).

## 2. High-level architecture

```
 ┌──────────────────────── Your phone / browser (works fully offline) ───────────────────────┐
 │  UI screens (12)  ──►  App services  ──►  Engine (pure, deterministic)                    │
 │                         │                 • rule evaluator   • recommender                │
 │                         │                 • period resolver  • milestone calculator       │
 │                         ▼                                                                 │
 │                    IndexedDB  (cards, rules, offers, transactions, milestones, outbox)    │
 │                         ▲                                                                 │
 │  Service worker: caches app shell → app opens with no network                             │
 └─────────┬───────────────────────────────────────────────────────────────┬─────────────────┘
           │ import/export (encrypted JSON)                                 │ optional sync (Phase 6)
           ▼                                                               ▼
 Claude chat in this Project                                  Google Drive app-data folder
 (reads bank PDFs / URLs / screenshots,                       (encrypted event log + snapshots;
  outputs a validated Card Rule Pack)                          only you hold the passphrase)
```

**Source of truth:** the transaction and rule data on your device is the working copy; the encrypted event log in Drive is the durable replica once sync is on. Until then, encrypted export files are the backup.

## 3. Local database and offline cache

IndexedDB object stores (each record has a UUID, `createdAt`, `updatedAt`, `version`):

- `cards` — bank, product, variant, credit/debit, network, nickname, last4 (only), status (active/deactivated/replaced/archived), anniversary date.
- `sources` — URL / document ref, fetched-at, content hash, verification status.
- `ruleVersions` — immutable versions of each card's rules; never edited, only superseded.
- `benefits` (baseline earn rates, caps, exclusions, fees, surcharge waivers) and `offers` (merchant/platform offers with validity, min amount, caps, stacking group, variant restrictions) — each points to a `ruleVersion` and `source`.
- `milestones` — rule definition (threshold, period type, eligible/excluded categories, reset behaviour, auto vs on-request reversal).
- `transactions` — append-only **events** (`created`, `edited`, `cancelled`, `refunded`, `partial_refund`) folded into current state; each stores the rule-version ids used to assess it.
- `assessments` — per-transaction eligibility per milestone: eligible / ineligible / pending verification / partial, with reason.
- `reminders`, `settings`, `outbox` (changes waiting to sync), `syncState`.

Cache layers kept separate, as you asked:
1. **App shell cache** (service worker) — code, icons, fonts.
2. **Local data** (IndexedDB) — everything you need to get a recommendation offline.
3. **Cloud replica** (Drive, optional) — backup and cross-device.

## 4. Cloud persistence and backup

- **Phase 1–5:** encrypted export/import file (AES-GCM, key derived from your passphrase with PBKDF2 via the browser's WebCrypto). Save it to Drive/WhatsApp-to-self/anywhere; it's unreadable without the passphrase. Plain CSV/JSON export also available for spreadsheets.
- **Phase 6:** Google Sign-In in the browser (no server, no client secret) → app writes encrypted event batches to Drive's hidden app-data folder. Because every change is an event with a UUID, merging two devices is a **union of events** — duplicates are naturally ignored, nothing is overwritten. Genuine conflicts (same transaction edited on two devices) keep both and ask you.
- One-time setup you'll need then: create an OAuth client in Google Cloud Console (I'll give click-by-click steps for the phone).

## 5. Processing bank pages and uploaded documents

```
PDF / screenshot / URL ──► Claude chat in this Project ──► Card Rule Pack (JSON) ──► app import
                           • reads official sources only      • schema-validated in the app
                           • cites URL + quote per rule       • diff shown vs previous version
                           • marks anything unclear as        • you approve before it goes live
                             "unverified" (no invented values)
```

- Each rule in a pack carries: source URL/document, the clause it came from, fetched date, confidence, and variant restrictions.
- The app **never** trusts a pack blindly: JSON-schema validation, sanity checks (e.g. cashback > 100% rejected), and a human-readable diff before activation.
- If a bank site blocks fetching, I say so and ask for a PDF or screenshot — no guessed content.
- Refresh: you ask "refresh my cards" in this Project (or a weekly scheduled task does it) → new pack → import → change history kept.
- Card details stay minimal: no full number, CVV, PIN, OTP or passwords — the import validator rejects anything that looks like a full card number.

## 6. Recommendations without internet

All inputs are local, so the recommender is the same online or offline:

1. **Parse** the query locally ("₹65,000 TV at Croma") with a merchant/category dictionary + amount parser; ask one follow-up only if merchant or amount is missing.
2. **Filter** active cards; for each, collect baseline benefits + offers matching merchant/category/channel/variant/min-amount/date.
3. **Compute** in paise: instant discount, cashback (after caps already used this period), reward points × stated redemption value, minus fees/surcharges. Offers in the same stacking group never double-count — the best one wins.
4. **Milestone effect:** how much this purchase moves each fee-waiver/lounge threshold. Shown as progress, and valued only as a tie-breaker / explicit trade-off — never by suggesting you spend more.
5. **Rank and explain:** best card first, alternatives with "why lower".
6. **Freshness labels on every number:** `Baseline (verified dd-mm-yyyy)`, `Offer — verified, valid till …`, `Offer — may be outdated (last checked …)`, `Expired — not counted`. Offline, promotional offers are shown separately from confirmed baseline value.

## 7. Milestones and annual-fee reversal calculations

- **Period resolver** turns each milestone's rule into concrete date windows: calendar month/quarter/year, membership year from anniversary date, statement cycle, or custom.
- **Eligible spend** = Σ eligible portions of completed transactions in the window − refunds/reversals against those transactions (dated per issuer rule). Cancelled/failed = 0. Pending-verification is shown separately, not counted as confirmed.
- **Output:** required, confirmed eligible, pending, remaining, % progress, days left, auto vs request-based reversal.
- **Deadline warning:** compares remaining requirement against your own recent average eligible spend on that card; if it's unlikely to be met, it warns early and states the fee at stake — it does not tell you to spend.
- Rule changes create a new rule version; current milestone status is recalculated, past transaction assessments are preserved for audit.

## 8. Recurring costs and dependencies

| Item | Cost |
|---|---|
| GitHub + GitHub Pages | ₹0 |
| Google Drive app-data (within your Google One quota; data is a few MB) | ₹0 extra |
| Claude Pro (already have) for extraction/refresh | ₹0 extra |
| Optional later: Claude API-backed in-app extraction | Pay-per-use, roughly a few rupees per card document |
| Third-party APIs, servers, databases | None |

## 9. Security and privacy

- No full card numbers, CVV, PIN, OTP or banking passwords — ever; validated on input and import.
- No secret keys in browser code (there are none in this design).
- Purchase history never leaves your device except as your encrypted backup.
- Optional **app lock**: data encrypted at rest in IndexedDB with your passphrase; auto-lock after inactivity.
- **Shared/compromised device risk:** anyone who can unlock your phone and open the browser can see unlocked data; a malicious browser extension or a compromised phone can read it. Mitigations: app lock, "wipe this device" button, short auto-lock, and no data that could move money.
- Strict Content-Security-Policy, no third-party scripts, no analytics.
- The app never connects to a bank account or makes payments.

## 10. Phased plan and acceptance criteria

| Phase | Delivers | Done when (tested) |
|---|---|---|
| **1 Foundation** | Repo, PWA shell, 12-screen navigation, IndexedDB layer, manual card add/edit/archive, service worker, encrypted export/import | Installs on your phone; works in airplane mode; card survives restart; export→wipe→import restores everything (Scn 11) |
| **2 Card intelligence** | Rule-pack schema + validator, import with diff/approve, versioning, card details & offers explorer, first real cards extracted from your documents | Invalid/oversized/fake-number packs rejected; unverified items flagged (Scn 10); expired offers shown as expired (Scn 6) |
| **3 Recommender** | NL query parser, eligibility engine, net-benefit ranking, explanations, freshness labels | Golden test cases per card pass; same answer offline (Scn 1, 2) |
| **4 Purchases** | Post-recommendation confirm/log, manual entry, edit/cancel/refund, duplicate detection, history + CSV/JSON export | Duplicate not double-counted (Scn 8); refund reduces eligible spend (Scn 7) |
| **5 Milestones & reminders** | Period resolver, lounge + fee-reversal trackers, dashboard, in-app reminders, PWA notifications where supported | Progress maths correct across period boundaries (Scn 3, 4, 5) |
| **6 Sync & hardening** | Google Drive encrypted sync, conflict handling, app lock, full journey test, production release | Offline-recorded purchases sync once, no loss or duplicates (Scn 9) |

**Notification honesty:** reliable alerts when the app is closed need a push server; without one, reminders fire when you open the app (and as local notifications where the browser allows). On iPhone, notifications only work for the installed home-screen app.

## 11. How we'll build and deploy from a browser

1. You create one empty GitHub repo (≈2 minutes in the GitHub app/website — I'll give exact taps).
2. I attach it to this workspace, write code + tests here, run the tests, and push.
3. You switch on GitHub Pages once (Settings → Pages). From then on every push I make is live at `https://<you>.github.io/ekfba/` within a minute.
4. You open that link on your phone → "Install app" / "Add to Home Screen".
5. Each phase ends with a short checklist for you to try on the phone; I fix anything you report.
