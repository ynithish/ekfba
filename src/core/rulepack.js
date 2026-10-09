// Card Rule Pack v1 — validation, review diff and status helpers.
// The format is specified in spec/RULEPACK.md; this file must stay consistent with it.
// Pure functions only: no DOM, no storage, no network (portable to Dart line by line).

import { findSensitiveData } from './sensitive.js';

export const RULEPACK_FORMAT = 'ekfba-rulepack';
export const RULEPACK_SCHEMA_VERSION = 1;

export const CATEGORIES = [
  'grocery', 'dining', 'food_delivery', 'fuel', 'travel', 'flights', 'hotels', 'transport', 'electronics', 'apparel',
  'online_shopping', 'department_store', 'utilities', 'telecom', 'rent', 'wallet_load', 'insurance',
  'education', 'government', 'tax', 'emi', 'jewellery', 'entertainment', 'healthcare', 'cash_withdrawal',
  'international', 'other',
];
export const CHANNELS = ['online', 'offline', 'any'];
export const PERIOD_TYPES = ['transaction', 'statement_cycle', 'calendar_month', 'calendar_quarter', 'calendar_year', 'card_year'];
export const OFFER_BENEFITS = ['instant_discount_percent', 'instant_discount_flat', 'cashback_percent', 'cashback_flat', 'bonus_points'];
export const EARN_KINDS = ['cashback', 'points'];
export const MILESTONE_KINDS = ['fee_waiver', 'lounge_unlock', 'spend_bonus', 'other'];
export const SOURCE_TYPES = ['bank_page', 'tnc_pdf', 'offer_page', 'network_page', 'statement', 'other'];

const MAX_PAISE = 1_00_00_000_00; // ₹1 crore
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 300) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isPaise = (v, min = 0) => Number.isInteger(v) && v >= min && v <= MAX_PAISE;
const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u);

/** Today's local date as YYYY-MM-DD. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from date a to date b (YYYY-MM-DD), b - a. */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/**
 * Validates a parsed rule pack. Returns { ok, errors: [{path, message}], warnings: [{path, message}] }.
 * `today` (YYYY-MM-DD) is injectable so results are reproducible in tests.
 */
export function validateRulePack(pack, today = localDate()) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObj(pack)) return { ok: false, errors: [{ path: '', message: 'Not a rule pack (expected a JSON object).' }], warnings };
  if (pack.format !== RULEPACK_FORMAT) err('format', `Expected format "${RULEPACK_FORMAT}".`);
  if (pack.schemaVersion !== RULEPACK_SCHEMA_VERSION) err('schemaVersion', `Unsupported schemaVersion ${pack.schemaVersion}; this app reads version ${RULEPACK_SCHEMA_VERSION}.`);

  // Card identity
  if (!isObj(pack.card)) err('card', 'Missing card identity.');
  else {
    if (!isStr(pack.card.bank, 80)) err('card.bank', 'Bank is required.');
    if (!isStr(pack.card.name, 80)) err('card.name', 'Card name is required.');
    if (pack.card.kind !== undefined && !['credit', 'debit'].includes(pack.card.kind)) err('card.kind', 'Must be credit or debit.');
    if (pack.card.variants !== undefined && !(Array.isArray(pack.card.variants) && pack.card.variants.every((v) => isStr(v, 60)))) {
      err('card.variants', 'Variants must be a list of names.');
    }
  }

  // Dates
  if (!isDateStr(pack.checkedAt)) err('checkedAt', 'checkedAt must be a date (YYYY-MM-DD).');
  else if (pack.checkedAt > today) err('checkedAt', 'checkedAt is in the future.');

  // Sources
  const sourceIds = new Set();
  if (!Array.isArray(pack.sources) || pack.sources.length === 0) err('sources', 'At least one source is required.');
  else pack.sources.forEach((s, i) => {
    const p = `sources[${i}]`;
    if (!isObj(s)) return err(p, 'Must be an object.');
    if (!isStr(s.id, 40)) err(`${p}.id`, 'Source id is required.');
    else if (sourceIds.has(s.id)) err(`${p}.id`, `Duplicate source id "${s.id}".`);
    else sourceIds.add(s.id);
    if (!isStr(s.title, 200)) err(`${p}.title`, 'Source title is required.');
    if (!SOURCE_TYPES.includes(s.type)) err(`${p}.type`, `Type must be one of: ${SOURCE_TYPES.join(', ')}.`);
    if (s.url !== undefined && !isHttps(s.url)) err(`${p}.url`, 'URL must start with https://');
    if (s.url === undefined && !isStr(s.document, 200)) err(`${p}`, 'Give a url or a document name.');
    if (s.checkedAt !== undefined && !isDateStr(s.checkedAt)) err(`${p}.checkedAt`, 'Must be YYYY-MM-DD.');
  });

  // Every rule: id, sourceId, clause, verified
  const checkProvenance = (r, p, ids) => {
    if (!isStr(r.id, 60)) err(`${p}.id`, 'Rule id is required.');
    else if (ids.has(r.id)) err(`${p}.id`, `Duplicate id "${r.id}".`);
    else ids.add(r.id);
    if (!isStr(r.label, 160)) err(`${p}.label`, 'A short label is required.');
    if (!sourceIds.has(r.sourceId)) err(`${p}.sourceId`, `sourceId "${r.sourceId ?? ''}" does not match any source.`);
    if (r.clause !== undefined && !(typeof r.clause === 'string' && r.clause.length <= 600)) err(`${p}.clause`, 'Clause must be text up to 600 characters.');
    if (typeof r.verified !== 'boolean') err(`${p}.verified`, 'verified must be true or false.');
    if (r.verified === true && !isStr(r.clause, 600)) warn(`${p}.clause`, 'Verified rule has no clause from the source.');
  };
  const checkScope = (a, p) => {
    if (a === undefined) return;
    if (!isObj(a)) return err(p, 'Must be an object.');
    if (a.categories !== undefined) {
      if (!Array.isArray(a.categories)) err(`${p}.categories`, 'Must be a list.');
      else a.categories.forEach((c, j) => { if (!CATEGORIES.includes(c)) err(`${p}.categories[${j}]`, `Unknown category "${c}".`); });
    }
    if (a.merchants !== undefined && !(Array.isArray(a.merchants) && a.merchants.every((m) => isStr(m, 80)))) err(`${p}.merchants`, 'Must be a list of merchant names.');
    if (a.channel !== undefined && !CHANNELS.includes(a.channel)) err(`${p}.channel`, `Channel must be one of: ${CHANNELS.join(', ')}.`);
  };
  const checkPeriod = (per, p, required = true) => {
    if (per === undefined && !required) return;
    if (!PERIOD_TYPES.includes(per)) err(p, `Period must be one of: ${PERIOD_TYPES.join(', ')}.`);
  };
  const list = (name) => {
    const v = pack[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) { err(name, 'Must be a list.'); return []; }
    return v;
  };

  // Fees
  if (pack.fees !== undefined) {
    if (!isObj(pack.fees)) err('fees', 'Must be an object.');
    else {
      for (const k of ['joiningFeePaise', 'annualFeePaise']) if (pack.fees[k] !== undefined && pack.fees[k] !== null && !isPaise(pack.fees[k])) err(`fees.${k}`, 'Must be whole paise (₹1 = 100).');
      if (pack.fees.sourceId !== undefined && !sourceIds.has(pack.fees.sourceId)) err('fees.sourceId', 'Does not match any source.');
      if (pack.fees.items !== undefined) {
        const ids = new Set();
        (Array.isArray(pack.fees.items) ? pack.fees.items : []).forEach((f, i) => {
          const p = `fees.items[${i}]`;
          checkProvenance(f, p, ids);
          if (f.bps !== undefined && !(Number.isInteger(f.bps) && f.bps >= 0 && f.bps <= 10000)) err(`${p}.bps`, 'Percentage in basis points (1% = 100), 0–10000.');
          if (f.flatPaise !== undefined && !isPaise(f.flatPaise)) err(`${p}.flatPaise`, 'Must be whole paise.');
          checkScope(f.appliesTo, `${p}.appliesTo`);
        });
      }
    }
  }

  // Reward point value
  if (pack.pointValue !== undefined) {
    const pv = pack.pointValue;
    if (!isObj(pv)) err('pointValue', 'Must be an object.');
    else {
      if (!(typeof pv.paisePerPoint === 'number' && pv.paisePerPoint >= 0 && pv.paisePerPoint <= 1000 && Math.round(pv.paisePerPoint * 100) === pv.paisePerPoint * 100)) {
        err('pointValue.paisePerPoint', 'Paise per point, 0–1000, at most 2 decimals.');
      }
      if (!sourceIds.has(pv.sourceId)) err('pointValue.sourceId', 'Does not match any source.');
      if (typeof pv.verified !== 'boolean') err('pointValue.verified', 'verified must be true or false.');
    }
  }

  // Earn rules
  const earnIds = new Set();
  list('earnRules').forEach((r, i) => {
    const p = `earnRules[${i}]`;
    if (!isObj(r)) return err(p, 'Must be an object.');
    checkProvenance(r, p, earnIds);
    if (!EARN_KINDS.includes(r.kind)) err(`${p}.kind`, `Kind must be one of: ${EARN_KINDS.join(', ')}.`);
    if (r.kind === 'cashback') {
      if (!(Number.isInteger(r.rateBps) && r.rateBps >= 0 && r.rateBps <= 10000)) err(`${p}.rateBps`, 'Cashback rate in basis points (1% = 100), 0–10000.');
      else if (r.rateBps > 2500) warn(`${p}.rateBps`, `Unusually high cashback (${r.rateBps / 100}%). Check the source.`);
    }
    if (r.kind === 'points') {
      const pp = r.pointsPer;
      if (!isObj(pp) || !(typeof pp.points === 'number' && pp.points > 0 && pp.points <= 1000) || !isPaise(pp.perPaise, 1)) {
        err(`${p}.pointsPer`, 'Use { "points": N, "perPaise": spend in paise }, e.g. 2 points per ₹100 = { "points": 2, "perPaise": 10000 }.');
      } else if (pack.pointValue && typeof pack.pointValue.paisePerPoint === 'number') {
        const effBps = (pp.points * pack.pointValue.paisePerPoint * 10000) / pp.perPaise;
        if (effBps > 10000) err(`${p}.pointsPer`, 'Rewards would be worth more than 100% of spend.');
        else if (effBps > 2500) warn(`${p}.pointsPer`, `Unusually high reward value (${(effBps / 100).toFixed(1)}%). Check the source.`);
      }
    }
    checkScope(r.appliesTo, `${p}.appliesTo`);
    if (r.capPaise !== undefined && !isPaise(r.capPaise)) err(`${p}.capPaise`, 'Cap must be whole paise.');
    if (r.capPoints !== undefined && !(Number.isInteger(r.capPoints) && r.capPoints >= 0)) err(`${p}.capPoints`, 'Must be a whole number.');
    if (r.capPaise !== undefined || r.capPoints !== undefined) checkPeriod(r.capPeriod, `${p}.capPeriod`);
    if (r.minTransactionPaise !== undefined && !isPaise(r.minTransactionPaise)) err(`${p}.minTransactionPaise`, 'Must be whole paise.');
  });

  // Exclusions
  const exIds = new Set();
  list('exclusions').forEach((x, i) => {
    const p = `exclusions[${i}]`;
    if (!isObj(x)) return err(p, 'Must be an object.');
    checkProvenance(x, p, exIds);
    checkScope(x.appliesTo, `${p}.appliesTo`);
    if (!Array.isArray(x.excludedFrom) || x.excludedFrom.length === 0 || !x.excludedFrom.every((e) => ['rewards', 'milestones', 'offers'].includes(e))) {
      err(`${p}.excludedFrom`, 'List what it is excluded from: rewards, milestones, offers.');
    }
  });

  // Offers
  const offerIds = new Set();
  list('offers').forEach((o, i) => {
    const p = `offers[${i}]`;
    if (!isObj(o)) return err(p, 'Must be an object.');
    checkProvenance(o, p, offerIds);
    if (!OFFER_BENEFITS.includes(o.benefitType)) err(`${p}.benefitType`, `Must be one of: ${OFFER_BENEFITS.join(', ')}.`);
    if (o.benefitType?.endsWith('_percent')) {
      if (!(Number.isInteger(o.valueBps) && o.valueBps > 0 && o.valueBps <= 10000)) err(`${p}.valueBps`, 'Percentage in basis points (10% = 1000), 1–10000.');
      if (o.maxBenefitPaise === undefined) warn(`${p}.maxBenefitPaise`, 'Percentage offer has no maximum benefit. Most bank offers have one.');
    }
    if (o.benefitType?.endsWith('_flat') && !isPaise(o.valuePaise, 1)) err(`${p}.valuePaise`, 'Flat benefit in whole paise.');
    if (o.benefitType === 'bonus_points' && !(Number.isInteger(o.valuePoints) && o.valuePoints > 0)) err(`${p}.valuePoints`, 'Bonus points must be a whole number.');
    if (o.maxBenefitPaise !== undefined && !isPaise(o.maxBenefitPaise, 1)) err(`${p}.maxBenefitPaise`, 'Must be whole paise.');
    if (o.minSpendPaise !== undefined && !isPaise(o.minSpendPaise)) err(`${p}.minSpendPaise`, 'Must be whole paise.');
    if (!isStr(o.merchant, 80) && !(o.appliesTo && Array.isArray(o.appliesTo.categories) && o.appliesTo.categories.length)) {
      err(`${p}.merchant`, 'Give a merchant or at least one category.');
    }
    checkScope(o.appliesTo, `${p}.appliesTo`);
    if (o.validFrom !== undefined && !isDateStr(o.validFrom)) err(`${p}.validFrom`, 'Must be YYYY-MM-DD.');
    if (o.validTo !== undefined && !isDateStr(o.validTo)) err(`${p}.validTo`, 'Must be YYYY-MM-DD.');
    if (isDateStr(o.validFrom) && isDateStr(o.validTo) && o.validFrom > o.validTo) err(`${p}.validTo`, 'Ends before it starts.');
    if (o.validTo === undefined) warn(`${p}.validTo`, 'No end date. The offer will be shown as "end date unknown".');
    if (o.usageCap !== undefined) {
      if (!isObj(o.usageCap) || !(Number.isInteger(o.usageCap.count) && o.usageCap.count > 0)) err(`${p}.usageCap`, 'Use { "count": N, "period": … }.');
      else checkPeriod(o.usageCap.period, `${p}.usageCap.period`);
    }
    if (o.variantsOnly !== undefined && !(Array.isArray(o.variantsOnly) && o.variantsOnly.every((v) => isStr(v, 60)))) err(`${p}.variantsOnly`, 'Must be a list of variant names.');
    if (o.promoCode !== undefined && !isStr(o.promoCode, 40)) err(`${p}.promoCode`, 'Promo code must be short text.');
    if (o.stackGroup !== undefined && !isStr(o.stackGroup, 40)) err(`${p}.stackGroup`, 'Stack group must be short text.');
  });

  // Milestones
  const msIds = new Set();
  list('milestones').forEach((m, i) => {
    const p = `milestones[${i}]`;
    if (!isObj(m)) return err(p, 'Must be an object.');
    checkProvenance(m, p, msIds);
    if (!MILESTONE_KINDS.includes(m.kind)) err(`${p}.kind`, `Kind must be one of: ${MILESTONE_KINDS.join(', ')}.`);
    if (!isPaise(m.thresholdPaise, 1)) err(`${p}.thresholdPaise`, 'Spend threshold in whole paise, greater than zero.');
    checkPeriod(m.period, `${p}.period`);
    if (m.period === 'transaction') err(`${p}.period`, 'A spend milestone cannot be per transaction.');
    checkScope(m.counts, `${p}.counts`);
    if (m.kind === 'fee_waiver' && !['auto', 'on_request'].includes(m.feeReversal)) err(`${p}.feeReversal`, 'Say whether the waiver is "auto" or "on_request".');
    if (!isStr(m.benefit, 300)) err(`${p}.benefit`, 'Describe what is unlocked.');
  });

  // Lounge access
  const lgIds = new Set();
  list('lounge').forEach((l, i) => {
    const p = `lounge[${i}]`;
    if (!isObj(l)) return err(p, 'Must be an object.');
    checkProvenance(l, p, lgIds);
    if (!['domestic', 'international'].includes(l.scope)) err(`${p}.scope`, 'Scope must be domestic or international.');
    if (l.unlimited !== undefined && typeof l.unlimited !== 'boolean') err(`${p}.unlimited`, 'unlimited must be true or false.');
    if (l.unlimited === true) {
      if (l.visits !== undefined) err(`${p}.visits`, 'Leave visits out when access is unlimited.');
      checkPeriod(l.period, `${p}.period`, false);
    } else {
      if (!(Number.isInteger(l.visits) && l.visits >= 0 && l.visits <= 100)) err(`${p}.visits`, 'Visits must be a whole number (or set "unlimited": true).');
      checkPeriod(l.period, `${p}.period`);
    }
    if (l.requiresMilestoneId !== undefined && !msIds.has(l.requiresMilestoneId)) err(`${p}.requiresMilestoneId`, `No milestone with id "${l.requiresMilestoneId}".`);
  });

  // Other benefits (text only)
  const obIds = new Set();
  list('otherBenefits').forEach((b, i) => {
    const p = `otherBenefits[${i}]`;
    if (!isObj(b)) return err(p, 'Must be an object.');
    checkProvenance(b, p, obIds);
    if (b.detail !== undefined && !isStr(b.detail, 400)) err(`${p}.detail`, 'Detail must be text up to 400 characters.');
  });

  // Sensitive data anywhere (card numbers, CVV, PIN, OTP, passwords)
  const scan = (v, path) => {
    if (typeof v === 'string') { const r = findSensitiveData(v); if (r) err(path, `Refused: ${r}.`); }
    else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
    else if (isObj(v)) Object.entries(v).forEach(([k, x]) => scan(x, path ? `${path}.${k}` : k));
  };
  scan(pack, '');

  const size = JSON.stringify(pack).length;
  if (size > 200_000) err('', `Pack is too large (${Math.round(size / 1000)} KB, max 200 KB).`);

  return { ok: errors.length === 0, errors, warnings };
}

/* ---------------- Review diff ---------------- */

const SECTIONS = [
  ['earnRules', 'Reward'], ['exclusions', 'Exclusion'], ['offers', 'Offer'],
  ['milestones', 'Milestone'], ['lounge', 'Lounge access'], ['otherBenefits', 'Benefit'],
];

function changedFields(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

/**
 * Compares a previous approved pack (or null) with a new one.
 * Returns a list of { kind: 'added'|'removed'|'changed', section, id, label, fields? } plus fee changes.
 */
export function diffRulePacks(prev, next) {
  const out = [];
  const pf = prev?.fees || {};
  const nf = next.fees || {};
  for (const k of ['joiningFeePaise', 'annualFeePaise']) {
    if ((pf[k] ?? null) !== (nf[k] ?? null)) out.push({ kind: prev ? 'changed' : 'added', section: 'Fees', id: k, label: k === 'annualFeePaise' ? 'Annual fee' : 'Joining fee', from: pf[k] ?? null, to: nf[k] ?? null });
  }
  if (JSON.stringify(prev?.pointValue ?? null) !== JSON.stringify(next.pointValue ?? null)) {
    out.push({ kind: prev?.pointValue ? 'changed' : 'added', section: 'Reward value', id: 'pointValue', label: 'Value of one reward point', from: prev?.pointValue?.paisePerPoint ?? null, to: next.pointValue?.paisePerPoint ?? null });
  }
  for (const [key, name] of SECTIONS) {
    const before = new Map((prev?.[key] || []).map((r) => [r.id, r]));
    const after = new Map((next[key] || []).map((r) => [r.id, r]));
    for (const [id, r] of after) {
      if (!before.has(id)) out.push({ kind: 'added', section: name, id, label: r.label });
      else {
        const fields = changedFields(before.get(id), r);
        if (fields.length) out.push({ kind: 'changed', section: name, id, label: r.label, fields });
      }
    }
    for (const [id, r] of before) if (!after.has(id)) out.push({ kind: 'removed', section: name, id, label: r.label });
  }
  return out;
}

/* ---------------- Status helpers ---------------- */

/** Offer status on a given day: 'expired' | 'upcoming' | 'active' | 'no_end_date'. */
export function offerStatus(offer, today = localDate()) {
  if (offer.validTo && offer.validTo < today) return 'expired';
  if (offer.validFrom && offer.validFrom > today) return 'upcoming';
  if (!offer.validTo) return 'no_end_date';
  return 'active';
}

export const OFFER_STALE_DAYS = 30;
export const BASELINE_STALE_DAYS = 180;

/** Freshness of a pack on a given day. */
export function packFreshness(pack, today = localDate()) {
  const age = daysBetween(pack.checkedAt, today);
  return {
    ageDays: age,
    offersStale: age > OFFER_STALE_DAYS,
    baselineStale: age > BASELINE_STALE_DAYS,
    unverifiedCount: countUnverified(pack),
  };
}

export function countUnverified(pack) {
  let n = 0;
  for (const [key] of SECTIONS) n += (pack[key] || []).filter((r) => r.verified === false).length;
  if (pack.pointValue && pack.pointValue.verified === false) n++;
  return n;
}

/** Does this pack describe this wallet card? Returns 'match' | 'variant_mismatch' | 'mismatch'. */
export function packMatchesCard(pack, card) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\b(bank|card|credit|debit|ltd|limited)\b/g, '').replace(/[^a-z0-9]/g, '');
  const bankOk = norm(pack.card.bank) === norm(card.bank) || norm(pack.card.bank).includes(norm(card.bank)) || norm(card.bank).includes(norm(pack.card.bank));
  const nameOk = norm(pack.card.name) === norm(card.name) || norm(pack.card.name).includes(norm(card.name)) || norm(card.name).includes(norm(pack.card.name));
  if (!bankOk || !nameOk) return 'mismatch';
  const variants = pack.card.variants || [];
  if (variants.length && card.variant && !variants.some((v) => norm(v) === norm(card.variant))) return 'variant_mismatch';
  return 'match';
}

/** Offers that apply to this card's variant (offers marked variantsOnly exclude other variants). */
export function offersForCard(pack, card) {
  const norm = (s) => String(s || '').toLowerCase().trim();
  return (pack.offers || []).filter((o) => !o.variantsOnly?.length || o.variantsOnly.some((v) => norm(v) === norm(card.variant)));
}
