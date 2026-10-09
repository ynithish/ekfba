# Card recommendation — rules v1

Reference implementation: `src/core/recommend.js` (`parseQuery`, `evaluateCard`, `recommend`, `explain`) with the
merchant directory in `src/core/merchants.js`. Behaviour is pinned by `spec/test-vectors/recommend/*.json`
(run by `tests/recommend.test.mjs`); a Dart port must pass the same vectors.

## 1. Understanding the question
- Free text: a shop, outlet, app or category, with or without an amount ("Croma 15000", "swiggy instamart", "petrol 2k").
- **Amount**: a number with ₹/Rs/INR or a k/lakh/crore suffix wins; otherwise the largest plain number of 2+ digits.
- **Merchant**: the longest whole-phrase match of a directory name or alias. It brings its categories and channel.
- **Category**: if no merchant matches, category words ("petrol" → fuel, "electricity bill" → utilities).
- **Channel**: from the merchant, or the words online/app/website vs store/outlet/swipe. Unknown otherwise.
- **International**: words like abroad, forex, USD add the `international` category.
- No merchant and no category → ask one follow-up: which kind of spend is it.

## 2. Evaluating each active card (cards without rules are listed, not ranked)
1. **Exclusions** whose scope matches by category or merchant remove rewards, offers and/or milestone credit.
2. **Offers**: a merchant offer applies only to that merchant; a category offer to its categories. Expired and
   upcoming offers never apply. Variant-only offers apply only to that variant. With an amount: percent →
   round down, capped by `maxBenefitPaise` and the amount; flat → its value; below `minSpendPaise` → ₹0 and the
   shortfall is reported. **Offers on one card never stack; the single best counts.**
3. **Rewards**: the most specific matching earn rule (merchant 3 > category 2 > channel 1 > general 0; ties →
   higher rate). Channel-specific rules apply only when the channel is known and matches.
   Points = whole spend blocks × points (₹15,000 at "4 per ₹100" = 600). Value = points × paise per point,
   rounded down. Without a point value, points are shown but valued at ₹0 and flagged.
   Per-transaction caps are applied; period caps are reported (they need purchase history).
4. **Charges**: percentage fees on `international` (forex mark-up) are subtracted for international spends.
5. **Net saving** = offer + reward value − charges (paise).
6. **Milestones** the spend counts toward are listed (progress arrives with purchase logging).

## 3. Ranking
- With an amount: net saving, high to low; at equal net, fully valued results first, then higher reward rate.
- Without an amount: usable offer headline value (max benefit or flat value), then known-value rewards first,
  then reward rate.
- The explanation for each card names its offer, reward rate, charges and the gap to the top card.

## 4. Honesty rules
- Offers with no end date, from rules older than 30 days, or unverified are labelled as such.
- The engine never suggests spending more to reach an offer minimum or milestone; it reports the shortfall.
