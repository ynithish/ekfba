# Progress checklist

Legend: ✅ built and tested · 🟡 partly built · ⬜ not started. "Tested" means an automated test exists and passes.

## Phase 1 — Architecture & foundation ✅ (9 Oct 2026)
- ✅ Architecture agreed (docs/ARCHITECTURE.md): GitHub Pages, Claude-chat extraction, Drive sync in Phase 6
- ✅ Data model + IndexedDB schema with migrations (docs/SCHEMA.md)
- ✅ Responsive app shell, bottom navigation, all 12 screens reachable (7 are honest "coming in Phase N" placeholders)
- ✅ Manual card onboarding: add, edit, deactivate/reactivate, mark replaced, archive (no hard delete)
- ✅ Sensitive-data guard: full card numbers (Luhn), CVV, PIN, OTP, passwords refused on save and on import
- ✅ Offline: service worker precaches the shell; app and wallet load with the network off
- ✅ Encrypted backup (AES-256-GCM, PBKDF2 310k) → wipe → restore; merge import is idempotent (Scenario 11)
- ✅ Plain JSON export (with warning); request persistent storage; wipe device
- Tests: 11 unit tests, 24 browser checks — all passing
- ⬜ Not yet: PDF / screenshot / URL onboarding (Phase 2), installed-on-phone check by you after deploy

## Delivery change (9 Oct 2026)
EKFBA now runs as a Claude page ("EKFBA Cards", https://claude.ai/artifact/UAatcuEdJpQ4YNJspyPUVH) beside NLNLALD Policies,
following the NLNLALD roadmap: online-only while testing, later merged into one Flutter app. The PWA code in this repo
(index.html, sw.js, src/data, src/ui) stays as reference; src/core is shared by both and bundled into the page.

## Phase 1 + 2 on the Claude page ✅ (9 Oct 2026)
- ✅ Wallet: add, edit, deactivate/reactivate, replaced by, archive; card holder name; refuses card numbers, expiry dates, CVV, PIN, OTP
- ✅ NLNLALD conventions: colours, fonts, statuses (On track / Renews soon / Urgent / Overdue), Google Calendar fee reminders 60/30/7/0 days
- ✅ Backup envelope `{app:"NLNLALD", module:"credit_cards", schemaVersion:1, exportedAt, records, collections}`; ms timestamps; restore merges by id
- ✅ Rule Pack v1: spec (spec/RULEPACK.md), validator, plain-language review diff, immutable versions (old ones superseded, kept)
- ✅ Card details show rewards, exclusions, offers, milestones, lounge, fees with source links, Unverified badges
- ✅ Offers explorer (search; Active / Upcoming / Expired); expired offers never shown as valid (Scenario 6); variant-only offers respected
- ✅ Freshness view: offers stale after 30 days, other rules after 180 days; unverified counts (Scenario 10)
- ✅ Privacy: page data readable and writable only by the owner (checked with a lower access level: nothing visible)
- Tests: 23 unit tests; 26 functional checks of the page with a stand-in runtime
- ✅ First real rule packs (spec/packs/): ICICI Emeralde (v2 active), ICICI Coral debit (on 2 cards), Axis Horizon — all approved in the page
- ⬜ JSON Schema files and engine test vectors in spec/ (vectors move to Phase 3, where the engine they test is built)
- ✅ ICICI point value ₹0.25 and no caps; Axis has no fee waiver (from the cardholder)
- ⬜ Still open: ICICI excluded categories; Axis forex mark-up and current lounge rules
- ⬜ Issue dates: owner will add later (fee dates and calendar reminders appear then)

## Phase 2 (original PWA plan) — superseded by the Claude page above
- ⬜ Card Rule Pack JSON schema + validator (sources, clause, fetched date, confidence, variant restrictions)
- ⬜ Import with human-readable diff and approve; immutable rule versions; change history
- ⬜ Card details: benefits, offers, milestones with source + verification badges
- ⬜ Offers & terms explorer; expired offers never shown as valid (Scenario 6); unverified flagged (Scenario 10)
- ⬜ First real cards extracted from your documents in this Project

## Phase 3 — Recommendation engine ✅ (9 Oct 2026, Claude page)
- ✅ "Ask" tab (opens first): shop / outlet / app / category, with or without an amount
- ✅ Parser: ₹ / Rs / k / lakh amounts; ~80 Indian merchants with aliases (src/core/merchants.js); category words; online/offline; international
- ✅ Unknown shop → one follow-up question (which kind of spend), then the result
- ✅ Engine (src/core/recommend.js, spec/RECOMMEND.md): exclusions, merchant vs category offers, min spend shortfall, no stacking,
  most-specific earn rule, point value, per-transaction caps, forex mark-up, milestones the spend counts toward
- ✅ Ranking with amount (net saving in ₹) and without (offer value, then reward rate); explanation per card; freshness/unverified labels
- ✅ 10 portable test vectors (spec/test-vectors/recommend) + parser tests; 31 page checks
- ✅ Axis Horizon v4 from current terms: 2 miles/₹100 other, 5 direct airline/Travel EDGE; telecom + gift cards excluded; lounge verified; 1 mile = ₹1 (owner)
- ✅ Unvalued points show the break-even value instead of counting as ₹0
- ⬜ Scenario 2 (offline) waits for the Flutter app, per ADR-008

## Phase 4 — Purchase tracking ✅ (9 Oct 2026, Claude page)
- ✅ "I paid with this card" after every recommendation (prefilled; records the card actually used)
- ✅ Manual "Add purchase"; edit; pending / refunded (partial) / cancelled; duplicate warning (Scenarios 7, 8)
- ✅ Storage: one document per month (purchaseMonths/YYYY-MM), per the NLNLALD roadmap
- ✅ Spends tab (opens first): month / quarter / year totals, by card, by category, purchase list filtered by card
- ✅ Card milestones with progress bars (fee waiver needs issue date; lounge unlock shows this and last quarter) (Scenarios 3, 5)
- Owner decisions: Backup and Offers tabs removed; no Apple Pay setting
- ✅ Shop names tidied (directory spelling or capitalised words); "rename everywhere" when correcting a typo
- ✅ Credit cards: bill generation day + payment due day; last/next bill with logged amounts; pay-by date and calendar reminders
- ✅ Purchases list shows 10 at a time with "Show more"; Spends total no longer shows a saved amount
- ⬜ Search purchases (owner: later phase)
- ⬜ Revisit purchase categories (rename, merge, add); dropdown stays alphabetical for now
- Tests: 41 unit tests; 32 page checks

## Phase 5 — Milestones & reminders ⬜
- ⬜ Period resolver; lounge and fee-reversal trackers; transaction eligibility statuses (Scenarios 3, 4, 5)
- ⬜ Dashboard widgets; in-app reminders; notifications where the device allows

## Phase 6 — Sync, security, release ⬜
- ⬜ Google Drive app-data encrypted event sync; conflict handling (Scenario 9)
- ⬜ App lock (encryption at rest), auto-lock
- ⬜ Full journey test; production release
