# EKFBA — Phase 2 plan: card intelligence, built to move into the native app

Date: 9 Oct 2026 · Status: **Proposed**

## Goal
Add real card knowledge (benefits, offers, fee-waiver and lounge rules) to EKFBA in a form that:
1. works offline **today** in the installed EKFBA website, and
2. moves unchanged into the future Flutter app (roadmap Stage 3), where it also works offline, and
3. can ship either as a **separate app** or as the **`credit_cards/` module of one NLNLALD app** — the choice can wait until Stage 3.

The rule: **data and rules are plain JSON with a written specification; code is replaceable.** Anything the Flutter app needs must be data or spec, never logic that only exists in JavaScript.

## Part A — Align with the NLNLALD roadmap conventions
| Item | Change |
|---|---|
| Backup envelope | `{ app: "NLNLALD", module: "credit_cards", schemaVersion, exportedAt, records[] }`. `records` = cards. Other collections (rule versions, offers, purchases) travel in an extra `collections` field; importers that only understand `records` still work. Encrypted backups wrap the same envelope. |
| `createdAt` / `updatedAt` | Millisecond numbers, same as NLNLALD Policies. Existing records converted by a database migration. |
| People | New "Card holder" field (name text, same spelling as insurance "Covered"), mainly for add-on cards. |
| Forbidden data | Also refuse card expiry dates (MM/YY patterns near "exp"/"valid thru"). |
| Look and feel | NLNLALD colour tokens (blue accent, light/dark), Bricolage Grotesque + Instrument Sans **stored inside the app** so they work offline. |
| Status vocabulary | Annual-fee dates use NLNLALD's statuses and thresholds: Overdue (past), Urgent (≤7 days), Renews soon (≤60 days), On track. |
| Reminders | Google Calendar links 60 / 30 / 7 / 0 days before each fee date, exactly like policy renewals. Works on every phone without push notifications. |
| Documents | Unchanged: official pages and PDFs are referenced by link (Drive or bank URL), never stored in the app. |

## Part B — Card intelligence
1. **Card Rule Pack v1** (JSON): per card variant — baseline earn rates, reward value per point, caps, excluded categories, fees and surcharges, offers (merchant/platform, min amount, % or fixed, max benefit, usage caps, validity dates, stacking group, variant restrictions), and milestone definitions (fee waiver, lounge access: threshold, period type, eligible/excluded spend).
   Every rule carries: source URL or document name, the clause it came from, date checked, and `verified` / `unverified`.
2. **Extraction workflow** (agreed ADR-003): you share the bank page or PDF in this Project's chat → I extract a Rule Pack → you import it into the app.
3. **Import with review**: validation against the schema, sanity limits (e.g. reward > 100% rejected, end date before start date rejected), sensitive-data scan, and a plain-language diff ("Croma offer: ₹1,500 off ≥ ₹15,000, valid till 31 Oct — new") before you approve.
4. **Rule versions**: approving creates a new immutable version; the previous one is kept for history and audit.
5. **Screens**: card details show benefits, offers and milestones with freshness badges; Offers & terms explorer with search; Data freshness screen lists stale (> 30 days) and unverified items.
6. **Expiry handling**: expired offers are shown as *Expired* and never as valid (Scenario 6); unverified values are flagged, never guessed (Scenario 10).

## Part C — Portability kit (what makes the Flutter move safe)
- `spec/` folder in the repo:
  - JSON Schemas: card, rule pack, backup envelope.
  - `RULES.md`: exact meaning of every rule field, rounding (paise, round down), date and period boundaries — written for a Dart developer, not just for this code.
  - `test-vectors/`: golden cases (input wallet + rules + purchase → expected result). The JavaScript engine must pass them now; the Dart engine must pass the same files later.
- No executable expressions inside rules (no formulas as text) — only declared fields, so any language can evaluate them.
- Module boundary: EKFBA code and data never reach into insurance data; people are joined by name text only. This keeps both delivery options open.

## Delivery options for the native app (decide at Stage 3)
| | Separate app | Feature in single NLNLALD app |
|---|---|---|
| Install | Two apps | One app, one sign-in |
| Shared pieces | Duplicated (backup, Drive, reminders) | Shared people list, reminders, Drive folder, design |
| Privacy | Family members never see cards | Needs per-module access: Family Members must not see your cards by default |
| Release | Independent | Card changes ship with insurance changes |
| Effort | Lower per app | Higher once, lower later |

**Recommendation:** single app with modules, built as Flutter "flavors" so `credit_cards/` can also be packaged alone if wanted. Phase 2's portability kit supports both.

## Acceptance criteria
- A backup from EKFBA imports into the NLNLALD envelope format; existing Phase 1 data migrates without loss.
- At least two of your real cards loaded from official sources, each rule showing its source and check date.
- A pack with an invalid, oversized or sensitive value is rejected with a clear reason.
- Expired offers never appear as valid; stale and unverified items are listed on the freshness screen.
- Every test vector passes; offline reload still shows all cards, rules and offers.

## Effort
Two working sessions: Part A + Rule Pack schema/spec first, then import/review screens and your first real cards.
