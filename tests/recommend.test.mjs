import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { recommend, parseQuery } from '../src/core/recommend.js';

const dir = new URL('../spec/test-vectors/recommend/', import.meta.url);

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const v = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  test(`vector ${file}: ${v.description}`, () => {
    const wallet = v.wallet.map((w) => ({ card: w.card, pack: JSON.parse(readFileSync(new URL(w.pack, dir), 'utf8')) }));
    const r = recommend(wallet, v.query, v.today);
    const e = v.expect;
    if ('amountPaise' in e) assert.equal(r.query.amountPaise, e.amountPaise);
    if (e.merchant) assert.equal(r.query.merchant?.name, e.merchant);
    if (e.needs) { assert.equal(r.needs, e.needs); return; }
    assert.equal(r.needs, null);
    const by = Object.fromEntries(r.results.map((x) => [x.cardId, x]));
    if (e.order) assert.deepEqual(r.results.map((x) => x.cardId), e.order);
    for (const [id, n] of Object.entries(e.netPaise || {})) assert.equal(by[id].netPaise, n, `net for ${id}`);
    for (const [id, o] of Object.entries(e.offerId || {})) assert.equal(by[id].offer?.offer.id ?? null, o, `offer for ${id}`);
    for (const [id, n] of Object.entries(e.offerShort || {})) assert.equal(by[id].offer?.minSpendShortPaise, n);
    for (const id of e.rewardExcluded || []) assert.equal(by[id].reward.excluded, true);
    for (const [id, ids] of Object.entries(e.offersNotNow || {})) assert.deepEqual(by[id].offersNotNow.map((x) => x.offer.id), ids);
  });
}

test('parseQuery: amounts, merchants, categories', () => {
  assert.deepEqual([parseQuery('Croma 65000').merchant.name, parseQuery('Croma 65000').amountPaise], ['Croma', 6500000]);
  assert.equal(parseQuery('₹1.2L tv at croma').amountPaise, 12000000);
  assert.equal(parseQuery('I am spending Rs 15,000 at Croma').amountPaise, 1500000);
  assert.equal(parseQuery('swiggy instamart').merchant.name, 'Swiggy Instamart');
  assert.equal(parseQuery('swiggy').merchant.name, 'Swiggy');
  assert.equal(parseQuery('Tata 1mg').merchant.name, 'Tata 1mg');
  assert.equal(parseQuery('Tata 1mg').amountPaise, null);
  assert.deepEqual(parseQuery('petrol 2k').categories, ['fuel']);
  assert.equal(parseQuery('maximum 500').merchant, null);
  assert.ok(parseQuery('hotel in dubai international 20000').categories.includes('international'));
  assert.equal(parseQuery('ratnadeep').channel, 'offline');
});
