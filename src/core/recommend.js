// Recommendation engine: "where are you spending, and how much?" → best card from the wallet.
// Pure and deterministic. Semantics are specified in spec/RECOMMEND.md and pinned by
// spec/test-vectors/recommend/*.json, which a Dart port must also pass.

import { MERCHANTS, CATEGORY_WORDS } from './merchants.js';
import { parseRupeesToPaise, formatPaise } from './money.js';
import { offerStatus, offersForCard, packFreshness, localDate } from './rulepack.js';

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9₹.]+/g, ' ').trim()} `;
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------------- Query parsing ---------------- */

const AMOUNT_RE = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k|l|lakh|lakhs|lac|cr|crore)?\b/gi;

/**
 * Parses free text such as "Croma 65000", "₹1.2L tv at croma", "swiggy instamart", "petrol 2k".
 * Returns { text, amountPaise|null, merchant|null, categories[], channel|null, international }.
 */
export function parseQuery(text, merchants = MERCHANTS) {
  const raw = String(text || '').trim();
  let amountPaise = null;
  let rest = raw;
  const amounts = [...raw.matchAll(AMOUNT_RE)].filter((m) => /\d/.test(m[1]));
  // Prefer a number written with ₹/Rs or a k/lakh suffix; else the largest plain number of 2+ digits.
  const scored = amounts.map((m) => ({ m, explicit: /₹|rs|inr/i.test(m[0]) || !!m[2], paise: parseRupeesToPaise(m[1].replace(/,/g, '') + (m[2] || '')) }))
    .filter((a) => a.paise !== null && (a.explicit || a.m[1].replace(/[,.]/g, '').length >= 2));
  scored.sort((a, b) => (b.explicit - a.explicit) || (b.paise - a.paise));
  if (scored.length) { amountPaise = scored[0].paise; rest = raw.replace(scored[0].m[0], ' '); }

  const t = norm(rest);
  let merchant = null;
  let best = 0;
  for (const m of merchants) {
    for (const n of [m.name, ...(m.aliases || [])]) {
      const k = norm(n);
      if (k.trim() && t.includes(k) && k.length > best) { merchant = m; best = k.length; }
    }
  }
  let categories = merchant ? [...merchant.categories] : [];
  if (!merchant) {
    for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
      if (words.some((w) => t.includes(norm(w)))) categories.push(cat);
    }
  }
  let channel = merchant && merchant.channel !== 'any' ? merchant.channel : null;
  if (/\b(online|app|website)\b/.test(t)) channel = 'online';
  if (/\b(in store|instore|offline|outlet|shop|showroom|counter|swipe)\b/.test(t)) channel = channel || 'offline';
  const international = /\b(international|abroad|overseas|forex|usd|dollars?|euros?)\b/.test(t);
  if (international && !categories.includes('international')) categories.push('international');
  const leftover = t.replace(merchant ? norm(merchant.name) : '', ' ').replace(/\b(at|on|in|from|for|buy|buying|spend|spending|order|ordering|pay|paying|the|a|an|my|rs|inr|online|offline|store|which|card|should|i|use)\b/g, ' ').trim();
  return { text: raw, amountPaise, merchant, merchantGuess: merchant ? null : (leftover || null), categories, channel, international };
}

/* ---------------- Matching ---------------- */

function merchantMatches(ruleMerchant, ctx) {
  if (!ruleMerchant || !ctx.merchant) return false;
  const r = nameKey(ruleMerchant);
  const names = [ctx.merchant.name, ...(ctx.merchant.aliases || [])].map(nameKey);
  return names.some((n) => n && (n === r || n.includes(r) || r.includes(n)));
}

/** How a scope applies to this purchase: -1 = does not apply, else specificity (3 merchant, 2 category, 1 channel, 0 general). */
function scopeFit(scope, ctx) {
  if (!scope) return 0;
  // A channel-specific rule applies only when the purchase channel is known and matches.
  if (scope.channel && scope.channel !== 'any' && scope.channel !== ctx.channel) return -1;
  if (scope.merchants?.length) {
    if (scope.merchants.some((m) => merchantMatches(m, ctx))) return 3;
    if (!scope.categories?.length) return -1;
  }
  if (scope.categories?.length) {
    return scope.categories.some((c) => ctx.categories.includes(c)) ? 2 : -1;
  }
  return scope.channel && scope.channel !== 'any' ? 1 : 0;
}

/* ---------------- Per-card evaluation ---------------- */

const PERIOD_WORD = { transaction: 'a transaction', statement_cycle: 'a statement cycle', calendar_month: 'a month', calendar_quarter: 'a quarter', calendar_year: 'a calendar year', card_year: 'a card year' };

function offerBenefit(o, amountPaise, pointValue) {
  if (amountPaise === null) return null;
  if (o.minSpendPaise && amountPaise < o.minSpendPaise) return 0;
  let b = 0;
  if (o.benefitType.endsWith('_percent')) b = Math.floor((amountPaise * o.valueBps) / 10000);
  else if (o.benefitType.endsWith('_flat')) b = o.valuePaise;
  else if (o.benefitType === 'bonus_points') b = pointValue ? Math.floor(o.valuePoints * pointValue.paisePerPoint) : null;
  if (b !== null && o.maxBenefitPaise) b = Math.min(b, o.maxBenefitPaise);
  if (b !== null) b = Math.min(b, amountPaise);
  return b;
}
const offerHeadline = (o) => o.maxBenefitPaise || o.valuePaise || 0;

/**
 * Evaluates one card for one purchase. Returns a result object (see spec/RECOMMEND.md).
 */
export function evaluateCard(card, pack, ctx, today = localDate()) {
  const amount = ctx.amountPaise;
  const notes = [];
  const pv = pack.pointValue || null;
  const fresh = packFreshness(pack, today);

  // Exclusions
  const excludedFrom = new Set();
  for (const x of pack.exclusions || []) {
    if (scopeFit(x.appliesTo, ctx) >= 2) x.excludedFrom.forEach((e) => excludedFrom.add(e));
  }

  // Offers: merchant offers must name this merchant; category offers must match the category.
  const usable = [];
  const notNow = [];
  if (!excludedFrom.has('offers')) {
    for (const o of offersForCard(pack, card)) {
      const fits = o.merchant ? merchantMatches(o.merchant, ctx) && scopeFit({ channel: o.appliesTo?.channel }, ctx) >= 0
        : scopeFit(o.appliesTo, ctx) >= 2;
      if (!fits) continue;
      const status = offerStatus(o, today);
      if (status === 'expired' || status === 'upcoming') { notNow.push({ offer: o, status }); continue; }
      const benefit = offerBenefit(o, amount, pv);
      usable.push({ offer: o, status, benefitPaise: benefit, minSpendShortPaise: amount !== null && o.minSpendPaise && amount < o.minSpendPaise ? o.minSpendPaise - amount : 0,
        stale: fresh.offersStale, verified: o.verified });
    }
  }
  // Offers on one card never stack: the single best one counts.
  usable.sort((a, b) => (amount !== null ? (b.benefitPaise ?? -1) - (a.benefitPaise ?? -1) : offerHeadline(b.offer) - offerHeadline(a.offer)));
  const offer = usable[0] || null;
  const offerPaise = offer && amount !== null ? (offer.benefitPaise || 0) : null;

  // Rewards: most specific matching earn rule.
  let reward = { rule: null, points: 0, valuePaise: 0, rateBps: 0, kind: null, excluded: false, valueKnown: true };
  if (excludedFrom.has('rewards')) {
    reward.excluded = true;
    notes.push('This spend earns no rewards on this card.');
  } else {
    const fits = (pack.earnRules || []).map((r) => ({ r, fit: scopeFit(r.appliesTo, ctx) })).filter((x) => x.fit >= 0);
    const rate = (r) => (r.kind === 'cashback' ? r.rateBps : pv ? (r.pointsPer.points * pv.paisePerPoint * 10000) / r.pointsPer.perPaise : r.pointsPer.points * 10000 / r.pointsPer.perPaise);
    fits.sort((a, b) => b.fit - a.fit || rate(b.r) - rate(a.r));
    const r = fits[0]?.r;
    if (r) {
      reward.rule = r;
      reward.kind = r.kind;
      if (r.kind === 'cashback') {
        reward.rateBps = r.rateBps;
        if (amount !== null) {
          let v = Math.floor((amount * r.rateBps) / 10000);
          if (r.capPaise && r.capPeriod === 'transaction') v = Math.min(v, r.capPaise);
          reward.valuePaise = v;
        }
        if (r.capPaise && r.capPeriod !== 'transaction') notes.push(`Cashback is capped at ${formatPaise(r.capPaise)} in ${PERIOD_WORD[r.capPeriod]}; earlier spends this period may already use it.`);
      } else {
        const per = r.pointsPer;
        if (amount !== null) {
          let pts = Math.floor(amount / per.perPaise) * per.points;
          if (r.capPoints && r.capPeriod === 'transaction') pts = Math.min(pts, r.capPoints);
          reward.points = pts;
        }
        if (pv) {
          reward.rateBps = Math.round((per.points * pv.paisePerPoint * 10000) / per.perPaise);
          reward.valuePaise = amount !== null ? Math.floor(reward.points * pv.paisePerPoint) : 0;
        } else {
          reward.valueKnown = false;
          reward.valuePaise = null;
          notes.push('The rupee value of these points is not set, so they are not counted in the saving.');
        }
        if (r.capPoints && r.capPeriod !== 'transaction') notes.push(`Points are capped at ${r.capPoints.toLocaleString('en-IN')} in ${PERIOD_WORD[r.capPeriod]}.`);
      }
      if (amount !== null && r.minTransactionPaise && amount < r.minTransactionPaise) { reward.points = 0; reward.valuePaise = reward.valueKnown ? 0 : null; notes.push(`Rewards need at least ${formatPaise(r.minTransactionPaise)} in one transaction.`); }
    }
  }

  // Charges: per-transaction percentage fees for international spends (forex mark-up).
  let feesPaise = 0;
  if (ctx.international) {
    for (const f of pack.fees?.items || []) {
      if (f.bps > 0 && f.appliesTo?.categories?.includes('international')) {
        feesPaise += amount !== null ? Math.floor((amount * f.bps) / 10000) : 0;
        notes.push(`${f.label} applies.`);
      }
    }
  }

  // Milestones this spend counts toward (progress itself needs logged purchases — Phase 4/5).
  const milestones = (pack.milestones || [])
    .filter((m) => !excludedFrom.has('milestones') && (!m.counts || scopeFit(m.counts, ctx) >= 0))
    .map((m) => ({ id: m.id, label: m.label, kind: m.kind, verified: m.verified }));

  const known = amount !== null && reward.valueKnown;
  const netPaise = amount === null ? null : (offerPaise || 0) + (reward.valuePaise || 0) - feesPaise;
  // Rate used for ranking when no amount is given: reward rate (bps) — offers ranked separately by headline value.
  return {
    cardId: card.id, card, offer, otherOffers: usable.slice(1), offersNotNow: notNow,
    offerPaise, reward, feesPaise, netPaise, netComplete: known, milestones, notes,
    freshness: { checkedAt: pack.checkedAt, offersStale: fresh.offersStale },
  };
}

/* ---------------- Ranking ---------------- */

/**
 * wallet: [{ card, pack|null }]. query: string or parsed query.
 * Returns { query, needs: null|'merchant_or_category', results: [...], skipped: [{card, reason}] }.
 */
export function recommend(wallet, query, today = localDate()) {
  const ctx = typeof query === 'string' ? parseQuery(query) : query;
  const skipped = [];
  if (!ctx.merchant && ctx.categories.length === 0) {
    return { query: ctx, needs: 'merchant_or_category', results: [], skipped };
  }
  const results = [];
  for (const { card, pack } of wallet) {
    if (card.status !== 'active') continue;
    if (!pack) { skipped.push({ card, reason: 'No rules added yet' }); continue; }
    results.push(evaluateCard(card, pack, ctx, today));
  }
  const offerScore = (r) => (r.offer && !r.offer.minSpendShortPaise ? offerHeadline(r.offer.offer) : 0);
  results.sort((a, b) => {
    if (ctx.amountPaise !== null) {
      // Known rupee value first; unknown-value rewards cannot be compared and rank after equal known values.
      if (b.netPaise !== a.netPaise) return b.netPaise - a.netPaise;
      if (a.netComplete !== b.netComplete) return a.netComplete ? -1 : 1;
      return (b.reward.rateBps || 0) - (a.reward.rateBps || 0) || a.card.bank.localeCompare(b.card.bank);
    }
    return offerScore(b) - offerScore(a) || (b.reward.valueKnown - a.reward.valueKnown) || (b.reward.rateBps || 0) - (a.reward.rateBps || 0) || a.card.bank.localeCompare(b.card.bank);
  });
  return { query: ctx, needs: null, results, skipped };
}

/** One-line reason for the ranking position of a result relative to the winner. */
export function explain(result, winner, amountKnown) {
  const parts = [];
  if (result.offer) {
    const o = result.offer;
    if (o.minSpendShortPaise) parts.push(`offer needs ${formatPaise(o.minSpendShortPaise)} more spend`);
    else if (amountKnown) parts.push(`${o.offer.label}${o.status === 'no_end_date' ? ' (end date unknown)' : ''}`);
    else parts.push(o.offer.label);
  }
  if (result.reward.excluded) parts.push('no rewards on this spend');
  else if (result.reward.rule) {
    const r = result.reward;
    const rate = r.kind === 'cashback' ? `${(r.rateBps / 100).toFixed(2).replace(/\.?0+$/, '')}% cashback` : r.valueKnown ? `≈${(r.rateBps / 100).toFixed(2).replace(/\.?0+$/, '')}% back in points` : `${r.rule.pointsPer.points} points per ${formatPaise(r.rule.pointsPer.perPaise)} (value not set)`;
    parts.push(rate);
  }
  if (result.feesPaise) parts.push(`${formatPaise(result.feesPaise)} charges`);
  if (result !== winner && amountKnown && winner.netPaise !== null && result.netPaise !== null && winner.netPaise > result.netPaise) {
    parts.push(`${formatPaise(winner.netPaise - result.netPaise)} less than the top card`);
  }
  return parts.join(' · ');
}
