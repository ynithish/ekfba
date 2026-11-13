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
- ✅ Issue dates added by owner for Emerald and Axis Horizon (fee dates, reminders and card-year fee-waiver progress now work)
- Owner decision: no backup in the Claude page; data stays in the page until the mobile app, which will use Google storage

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
- ✅ Payment Date shows the amount due* from purchases logged up to that bill date (14 Oct 2026)
- ✅ Purchases list shows 10 at a time with "Show more"; Spends total no longer shows a saved amount
- ✅ Per-day spending (12 Oct 2026): today, daily average, highest day; a bar per day for the month (tap to see that day); purchases grouped by day with day totals
- ✅ Search purchases by shop or outlet (13 Oct 2026), combined with card, category and day filters
- ✅ Vehicles (18 Oct 2026): vehicles list after Purchases (spend per vehicle, fuel vs other, tap to filter, add/edit/archive); purchase form asks "Is this vehicle related?" for fuel and vehicle words (wash, car care, service, maintenance, insurance, tyres, parking, toll, FASTag…), remembers the vehicle per shop
- ✅ Layout (19 Oct 2026): tabs Spends · Ask · Cards · Others. Freshness is now a tile on Cards (tap for the freshness list). Others holds Vehicles (tap a vehicle → Spends filtered to it) and Insurances
- ✅ Insurances moved in from NLNLALD Policies (3 policies copied with their ids; NLNLALD page left untouched): renewal status, person filter, documents, calendar reminders, add/edit/delete; Motor policies can name a vehicle
- ✅ Appliances & devices (22 Oct 2026): devices (mobile, laptop, tablet…) and appliances (AC, fridge, RO…) in Others, with brand, bought date, warranty and AMC (provider, start, end/renewal, amount) shown with renewal status; purchases can be linked (recharges, AMC, repairs, service), tap an item → its purchases
- ✅ Subscriptions: purchase form "This repeats" with every 28/56/84 days, monthly, 3/6 months, yearly; remembered per shop; Others lists each subscription with its next due date (reminders later)
- ✅ Subscriptions: "Other…" period (any number of days up to 730 or months up to 60, e.g. 7 or 13 months); "Amount changes each time" for bills like electricity and MyGate, listed as ~average of the last 3 with the last amount (22 Oct 2026)
- ✅ Others layout (22 Oct 2026): Subscriptions on top with "Paid in <month>" and "Due by <month end>" (~, orange when it includes a non-monthly payment); Vehicles, Appliances & devices and Insurances are collapsible sections with a one-line summary
- ✅ Credit card bill payments (29 Oct 2026): record a payment (card, amount prefilled with what's due, date, paid from, note) from Spends or the card's Bills; payments after a bill date pay that bill first, extra goes to the next bill; Payment Date shows what's left with "(₹X paid)", a paid bill shows ✓; payments are not counted as spend; list and delete on the card
- ✅ Debts (29 Oct 2026): home, personal, hand and other loans in Others (after Subscriptions) with amount, start date, interest %, term, EMI (worked out if blank), optional "already paying" outstanding as on a date. Purchase form asks "Is this a loan repayment?" (EMI category or words like EMI, loan, repayment). Outstanding: reducing balance, interest accrued daily between logged repayments; hand loans = amount minus repayments. Shows % repaid, interest so far, EMIs left and end month; warns when earlier EMIs are missing
- ✅ Family members (30 Oct 2026): Others → Family members (name, optional relation; add, edit, remove; rename updates policies). Insurance "Who is covered" is now tick boxes of family members with an inline "Add a family member"; card holder suggestions include family. Seeded with the 4 names from the policies
- ✅ Others: "Reorder sections" mode with up/down arrows; order saved in `settings/others` (30 Oct 2026)
- ✅ Vehicles: RC (registration number, valid till, Drive link) and PUC (last date, expiry, certificate link) with PUC status; vehicle shows insurance renewal from its Motor policy (30 Oct 2026)
- ✅ Family members: documents per person (type: Aadhaar/PAN/Driving Licence/Passport/Voter ID/Other, number, Drive link); Aadhaar 12 digits and PAN format checked; numbers masked to last 4 in the list (30 Oct 2026)
- ✅ EMI payments (EMI category or linked to a loan) kept out of Spends total, by card, by category, daily graph and day totals; "Excluding EMI payments: ₹X" under the total (hidden at ₹0), tap to list them (31 Oct 2026)
- ✅ Upcoming payments (2 Nov 2026): Others section (after Subscriptions) to add one-off or repeating payments with optional amount (school fees, municipal tax…); month view (this + next 3 months, plus Later for anything after) combining them with subscriptions, loan EMIs, insurance renewals (new optional premium on policies), AMC and PUC renewals and credit card bills; total of known amounts, count of unknown; Paid (moves repeating ones on, closes one-offs) with optional log-as-purchase
- ✅ Upcoming payments: Paid on every current-month item (and planned ones in Later) opens Add purchase filled in from the last payment of that kind (card bills open the bill-payment form); saved only on Save, then planned moves on/closes and insurance/AMC renewal dates move a year. Later view has no total box (2 Nov 2026)
- ✅ Spends: ‹ › arrows on the month chip to view earlier months (back to the first logged month); compact labels Month · Quarter · Year while in month view (13 Nov 2026)
- ✅ Bug fix (11 Nov 2026): credit card bills are now the statement balance (running logged purchases − recorded payments, never below ₹0). A payment made during the cycle, before the bill date, lowers that bill (was wrongly applied to the previous bill). Checked on real data: Axis 10 Nov bill ₹5,173 (matches statement), Emerald 28 Oct bill ₹37,694 = amount paid
- ✅ Android fix (11 Nov 2026): shop, purchase search, bank and card-holder suggestions are drawn by the page below the box (no browser datalist popup over the keyboard); the box scrolls up so suggestions stay visible
- ✅ Vaccinations per family member (vaccine, dose, given on, next due, certificate link); next due shown in the family list and in Upcoming payments, Paid logs a Healthcare purchase and marks it given. Upcoming payments gain a Type (School fees, Tax, Medical, Vaccination, Rent / maintenance, Other) and an optional family member, e.g. "Term 2 fees · Adhyasree" (6 Nov 2026)
- ✅ Subscriptions can be cancelled (with confirm) and restored; cancelled ones leave the list, the month due total and Upcoming payments, aren't suggested on new purchases, and come back automatically if a new payment is logged. Stored in `settings/subscriptions` (4 Nov 2026)
- ✅ Dining and Food delivery merged into one category shown as "Food" (stored as 'dining'); the 8 existing Food delivery purchases moved to Food (2 Nov 2026)
- ✅ Purchase categories trimmed (2 Nov 2026, owner): Rent, Flights, Hotels, International, Department store, Wallet load, Jewellery, Government and Cash withdrawal hidden from Add purchase and Ask's follow-up (kept in the rule vocabulary; airline/hotel shops log as Travel, others as Other); list alphabetical with Other last
- Tests: 74 unit tests; 212 page checks

## Phase 5 — Milestones & reminders ⬜
- ⬜ Period resolver; lounge and fee-reversal trackers; transaction eligibility statuses (Scenarios 3, 4, 5)
- ⬜ Dashboard widgets; in-app reminders; notifications where the device allows

## Phase 6 — Sync, security, release ⬜
- ⬜ Google Drive app-data encrypted event sync; conflict handling (Scenario 9)
- ⬜ App lock (encryption at rest), auto-lock
- ⬜ Full journey test; production release
