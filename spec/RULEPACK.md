# Card Rule Pack — format v1

A Rule Pack describes one card product (bank + card name, optionally specific variants) as plain JSON.
It is produced from official sources in the Card Manager Claude Project, reviewed by the owner, and imported
into EKFBA. The same file must work unchanged in the future Flutter app, so **every rule is declared data —
never a formula or code**. Example: `spec/examples/example-pack.json` (fictional).

Reference implementation: `src/core/rulepack.js` (`validateRulePack`, `diffRulePacks`, `offerStatus`,
`packFreshness`, `packMatchesCard`, `offersForCard`). Tests: `tests/rulepack.test.mjs`. A Dart port must give
the same results for the same inputs.

## Conventions
| Thing | Rule |
|---|---|
| Money | Integer **paise** (`…Paise`). ₹1,500 = `150000`. |
| Percentages | Integer **basis points** (`…Bps`). 1% = `100`, 10% = `1000`. |
| Dates | `YYYY-MM-DD`, the user's local calendar date. Ranges are **inclusive** (an offer with `validTo: "2026-11-15"` is valid all of 15 Nov). |
| Ids | Short text, unique within its section (`offers`, `milestones`, …). Ids are stable across refreshes so changes can be diffed. |
| Provenance | Every rule has `sourceId` (must match a `sources[].id`), optional `clause` (a short quote ≤ 600 chars from the source), and `verified` (true only when the clause states the rule unambiguously). |
| Unknown values | Leave the field out and set `verified: false`. **Never guess a number.** |
| Forbidden | Full card numbers, expiry dates, CVV, PIN, OTP, passwords — anywhere. |

## Top level
| Field | Required | Meaning |
|---|---|---|
| `format` | ✔ | `"ekfba-rulepack"` |
| `schemaVersion` | ✔ | `1` |
| `card` | ✔ | `{ bank, name, kind?: "credit"\|"debit", network?, variants?: [names] }` — variants listed here are the ones this pack covers |
| `checkedAt` | ✔ | Date all sources were last read. Not in the future. |
| `sources` | ✔ | `[{ id, type, title, url? \| document?, checkedAt? }]`, `type` ∈ bank_page, tnc_pdf, offer_page, network_page, statement, other. `url` must be https. |
| `notes` | | Free text |
| `fees` | | `{ joiningFeePaise?, annualFeePaise?, sourceId?, items?: [rule + bps? flatPaise? appliesTo?] }` (markups, surcharges, waivers) |
| `pointValue` | | `{ paisePerPoint (number, ≤ 2 decimals), sourceId, clause?, verified }` — the realistic redemption value |
| `earnRules` | | Base and accelerated rewards (below) |
| `exclusions` | | Spend that earns nothing / does not count (below) |
| `offers` | | Merchant and platform offers (below) |
| `milestones` | | Spend thresholds: fee waiver, lounge unlock, bonuses (below) |
| `lounge` | | Lounge entitlements (below) |
| `otherBenefits` | | Text-only benefits: `{ id, label, detail?, sourceId, clause?, verified }` |

Every rule object has `id`, `label` (one line a person understands), `sourceId`, `clause?`, `verified`.

### Scope (`appliesTo`, `counts`)
`{ categories?: [category], merchants?: [names], channel?: "online"|"offline"|"any" }`. Missing = applies to everything.
Categories (closed list): grocery, dining, food_delivery, fuel, travel, flights, hotels, electronics, apparel,
online_shopping, department_store, utilities, telecom, rent, wallet_load, insurance, education, government, tax,
emi, jewellery, entertainment, healthcare, cash_withdrawal, international, other.

### Periods
`transaction`, `statement_cycle` (needs the card's statement day), `calendar_month`, `calendar_quarter`,
`calendar_year`, `card_year` (from the card's issue/anniversary date).

### `earnRules[]`
| Field | Meaning |
|---|---|
| `kind` | `cashback` or `points` |
| `rateBps` | cashback: % of spend in basis points |
| `pointsPer` | points: `{ points, perPaise }` — 2 points per ₹100 = `{ "points": 2, "perPaise": 10000 }` |
| `appliesTo` | scope |
| `capPaise` / `capPoints` + `capPeriod` | maximum earned per period |
| `minTransactionPaise` | minimum single transaction |

Effective value check: `points × paisePerPoint ÷ perPaise` must not exceed 100% (error); above 25% is a warning.

### `exclusions[]`
`appliesTo` scope plus `excludedFrom: ["rewards" | "milestones" | "offers", …]`.

### `offers[]`
| Field | Meaning |
|---|---|
| `merchant` | Merchant/platform name as people say it ("Croma", "Swiggy Instamart"). Required unless `appliesTo.categories` is set. |
| `benefitType` | `instant_discount_percent`, `instant_discount_flat`, `cashback_percent`, `cashback_flat`, `bonus_points` |
| `valueBps` / `valuePaise` / `valuePoints` | the benefit, matching the type |
| `maxBenefitPaise` | cap per transaction (warning if a % offer has none) |
| `minSpendPaise` | minimum transaction |
| `validFrom`, `validTo` | inclusive dates; missing `validTo` = "end date unknown" (warning) |
| `usageCap` | `{ count, period }` |
| `variantsOnly` | offer applies only to these variants; other variants of the same card never get it |
| `promoCode`, `stackGroup` | offers sharing a `stackGroup` never combine; the best one wins |

Status on a day: `expired` (validTo < today), `upcoming` (validFrom > today), `no_end_date`, else `active`.
**An expired offer is never presented as valid.**

### `milestones[]`
`kind` ∈ fee_waiver, lounge_unlock, spend_bonus, other · `thresholdPaise` · `period` (not `transaction`) ·
`counts?` scope of spend that counts · `benefit` text · `feeReversal` ("auto" | "on_request", required for fee_waiver).

### `lounge[]`
`scope` (domestic | international) · `visits` + `period`, or `unlimited: true` (then no `visits`; `period` optional) · `requiresMilestoneId?` (must exist in `milestones`).

## Freshness
Days since `checkedAt`: offers are **stale after 30 days**, baseline rules **after 180 days**. Stale and
unverified items are shown with badges; they are never hidden and never shown as confirmed.

## Matching a pack to a wallet card
Bank and card names are compared ignoring case, punctuation and the words bank/card/credit/debit/ltd/limited.
If the pack lists `variants` and the wallet card's variant is not among them, import shows a warning.

## Review and versions
Importing never changes anything until approved. The review shows a plain-language diff against the card's
current version (added / changed fields / removed by id). Approval stores a new immutable version
`{ id, cardId, version, status: "active", pack, approvedAt }` and marks the previous one `superseded`.
