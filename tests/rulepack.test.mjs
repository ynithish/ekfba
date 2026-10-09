import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRulePack, diffRulePacks, offerStatus, packFreshness, packMatchesCard, offersForCard, countUnverified } from '../src/core/rulepack.js';
import { nextAnniversary, renewalStatus, feeCalendarLink } from '../src/core/feedates.js';
import { validateCard } from '../src/core/card.js';
import { buildBackup, validateBackup } from '../src/core/backup.js';

const example = () => JSON.parse(readFileSync(new URL('../spec/examples/example-pack.json', import.meta.url), 'utf8'));
const TODAY = '2026-10-09';

test('example pack is valid', () => {
  const r = validateRulePack(example(), TODAY);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('rejects wrong format, future date, unknown source and category', () => {
  const p = example();
  p.format = 'something';
  p.checkedAt = '2027-01-01';
  p.offers[0].sourceId = 'nope';
  p.offers[0].appliesTo.categories = ['gadgets'];
  const paths = validateRulePack(p, TODAY).errors.map((e) => e.path);
  assert.ok(paths.includes('format'));
  assert.ok(paths.includes('checkedAt'));
  assert.ok(paths.includes('offers[0].sourceId'));
  assert.ok(paths.includes('offers[0].appliesTo.categories[0]'));
});

test('sanity limits: reward over 100%, offer ending before it starts, duplicate ids', () => {
  const p = example();
  p.earnRules[0].pointsPer = { points: 500, perPaise: 10000 }; // 500 × 25p per ₹100 = 125%
  p.offers[1].validFrom = '2027-01-01';
  p.milestones[1].id = 'fee-waiver';
  const msgs = validateRulePack(p, TODAY).errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(msgs, /earnRules\[0\]\.pointsPer: Rewards would be worth more than 100%/);
  assert.match(msgs, /offers\[1\]\.validTo: Ends before it starts/);
  assert.match(msgs, /milestones\[1\]\.id: Duplicate id/);
});

test('refuses card numbers, CVV, passwords anywhere in a pack', () => {
  const p = example();
  p.otherBenefits[0].detail = 'Test card 4111 1111 1111 1111';
  assert.match(validateRulePack(p, TODAY).errors[0].message, /card number/);
  const q = example();
  q.notes = 'Do not share your password with anyone'; // ordinary T&C wording is allowed
  assert.equal(validateRulePack(q, TODAY).ok, true);
});

test('warnings for missing caps and end dates do not block import', () => {
  const p = example();
  delete p.offers[0].maxBenefitPaise;
  delete p.offers[1].validTo;
  const r = validateRulePack(p, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 2);
});

test('diff lists added, changed and removed items', () => {
  const a = example();
  const b = example();
  b.fees.annualFeePaise = 99900;
  b.offers[0].validTo = '2026-11-30';
  b.offers.pop();
  b.milestones.push({ ...b.milestones[0], id: 'bonus', kind: 'spend_bonus', label: 'Bonus 1,000 points at ₹50,000', benefit: '1,000 bonus points' });
  const d = diffRulePacks(a, b);
  const pick = (kind, section) => d.filter((x) => x.kind === kind && x.section === section).map((x) => x.id);
  assert.deepEqual(pick('changed', 'Fees'), ['annualFeePaise']);
  assert.deepEqual(pick('changed', 'Offer'), ['croma-diwali']);
  assert.deepEqual(d.find((x) => x.id === 'croma-diwali').fields, ['validTo']);
  assert.deepEqual(pick('removed', 'Offer'), ['summer-old']);
  assert.deepEqual(pick('added', 'Milestone'), ['bonus']);
  assert.equal(diffRulePacks(a, example()).length, 0);
  assert.ok(diffRulePacks(null, a).every((x) => x.kind === 'added'));
});

test('offer status: expired offers are never active (Scenario 6)', () => {
  const p = example();
  assert.equal(offerStatus(p.offers[0], TODAY), 'active');
  assert.equal(offerStatus(p.offers[2], TODAY), 'expired');
  assert.equal(offerStatus(p.offers[0], '2026-09-30'), 'upcoming');
  assert.equal(offerStatus({ }, TODAY), 'no_end_date');
  assert.equal(offerStatus(p.offers[0], '2026-11-15'), 'active'); // last day still valid
  assert.equal(offerStatus(p.offers[0], '2026-11-16'), 'expired');
});

test('freshness and unverified counts (Scenario 10)', () => {
  const p = example();
  assert.deepEqual(packFreshness(p, TODAY), { ageDays: 8, offersStale: false, baselineStale: false, unverifiedCount: 2 });
  assert.equal(packFreshness(p, '2026-11-15').offersStale, true);
  assert.equal(countUnverified(p), 2);
});

test('pack matching and variant-only offers', () => {
  const p = example();
  const classic = { bank: 'Example Bank Ltd', name: 'Sample Rewards Credit Card', variant: 'Classic' };
  assert.equal(packMatchesCard(p, classic), 'match');
  assert.equal(packMatchesCard(p, { ...classic, variant: 'Platinum' }), 'variant_mismatch');
  assert.equal(packMatchesCard(p, { bank: 'Other Bank', name: 'Sample Rewards' }), 'mismatch');
  assert.deepEqual(offersForCard(p, classic).map((o) => o.id), ['croma-diwali', 'summer-old']);
  assert.ok(offersForCard(p, { ...classic, variant: 'Signature' }).some((o) => o.id === 'instamart-flat'));
});

test('fee dates and NLNLALD statuses', () => {
  assert.equal(nextAnniversary('2024-11-20', TODAY), '2026-11-20');
  assert.equal(nextAnniversary('2024-03-05', TODAY), '2027-03-05');
  assert.equal(nextAnniversary('2026-10-01', TODAY), '2027-10-01'); // first fee one year after issue
  assert.equal(nextAnniversary('2024-02-29', '2027-01-01'), '2027-02-28');
  assert.equal(nextAnniversary('', TODAY), null);
  assert.equal(renewalStatus(-1).label, 'Overdue');
  assert.equal(renewalStatus(0).label, 'Urgent');
  assert.equal(renewalStatus(7).label, 'Urgent');
  assert.equal(renewalStatus(8).label, 'Renews soon');
  assert.equal(renewalStatus(60).label, 'Renews soon');
  assert.equal(renewalStatus(61).label, 'On track');
  const link = feeCalendarLink({ nickname: 'Shopping' }, '2026-11-20', 30, TODAY);
  assert.match(link, /dates=20261021\/20261022/);
  assert.match(link, /Shopping%20due%20in%2030%20days/);
  assert.equal(feeCalendarLink({ nickname: 'x' }, '2026-11-20', 60, TODAY), null); // already passed
});

test('cards: ms timestamps, holder name, expiry dates refused', () => {
  const r = validateCard({ bank: 'HDFC Bank', name: 'Millennia', kind: 'credit', network: 'Visa', last4: '4417', holderName: 'Nithish' });
  assert.equal(typeof r.card.createdAt, 'number');
  assert.equal(r.card.holderName, 'Nithish');
  const bad = validateCard({ bank: 'A', name: 'B', kind: 'debit', network: 'RuPay', nickname: 'x', notes: 'exp 08/29' });
  assert.match(bad.errors.notes, /expiry/);
});

test('backup uses the NLNLALD envelope and round-trips', () => {
  const card = validateCard({ bank: 'SBI', name: 'Cashback', kind: 'credit', network: 'Visa', nickname: 'SBI CB' }).card;
  const pack = { id: 'p1', cardId: card.id, version: 1, status: 'active', pack: example(), createdAt: 1, updatedAt: 1 };
  const b = buildBackup({ cards: [card], rulePacks: [pack] }, '0.2.0', ['cards', 'rulePacks']);
  assert.equal(b.app, 'NLNLALD');
  assert.equal(b.module, 'credit_cards');
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.records.length, 1);
  const v = validateBackup(JSON.parse(JSON.stringify(b)), ['cards', 'rulePacks']);
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.stores.cards[0], card);
  assert.equal(v.stores.rulePacks.length, 1);
  assert.match(validateBackup({ app: 'NLNLALD', module: 'insurance', schemaVersion: 1, records: [] }).errors[0], /insurance module/);
});
