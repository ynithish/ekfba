import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePurchase, findDuplicates, netSpend, periodContaining, previousPeriod, totals, milestoneProgress, flattenMonths } from '../src/core/purchases.js';
import { validateCard } from '../src/core/card.js';

const coralPack = JSON.parse(readFileSync(new URL('../spec/packs/icici-coral-debit.json', import.meta.url)));
const emeraldePack = JSON.parse(readFileSync(new URL('../spec/packs/icici-emeralde.json', import.meta.url)));
const base = { date: '2026-10-09', merchant: 'Croma', category: 'electronics', amountPaise: 1500000, cardId: 'c1' };

test('valid purchase; refunds and statuses', () => {
  const r = validatePurchase({ ...base, id: 'p1' }, null, 1);
  assert.equal(r.ok, true);
  assert.equal(r.purchase.refundPaise, 0);
  const bad = validatePurchase({ ...base, amountPaise: 0, cardId: '', category: 'gadgets', date: '2026-13-01' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amountPaise', 'cardId', 'category', 'date']);
  assert.ok(validatePurchase({ ...base, status: 'refunded', refundPaise: 2000000 }).errors.refundPaise);
  const full = validatePurchase({ ...base, status: 'refunded' }).purchase;
  assert.equal(full.refundPaise, 1500000); // full refund by default
  assert.ok(validatePurchase({ ...base, notes: 'card 4111 1111 1111 1111' }).errors.notes);
});

test('net spend: refunds reduce, pending and cancelled count zero (Scenario 7)', () => {
  assert.equal(netSpend({ status: 'completed', amountPaise: 100 }), 100);
  assert.equal(netSpend({ status: 'refunded', amountPaise: 100, refundPaise: 40 }), 60);
  assert.equal(netSpend({ status: 'refunded', amountPaise: 100, refundPaise: 100 }), 0);
  assert.equal(netSpend({ status: 'pending', amountPaise: 100 }), 0);
  assert.equal(netSpend({ status: 'cancelled', amountPaise: 100 }), 0);
});

test('duplicates: same date, card, amount and shop (Scenario 8)', () => {
  const a = { ...base, id: 'a', status: 'completed' };
  assert.equal(findDuplicates({ ...base, id: 'b', merchant: 'croma ' }, [a]).length, 1);
  assert.equal(findDuplicates({ ...base, id: 'b', amountPaise: 1 }, [a]).length, 0);
  assert.equal(findDuplicates({ ...base, id: 'b' }, [{ ...a, status: 'cancelled' }]).length, 0);
  assert.equal(findDuplicates(a, [a]).length, 0); // editing itself is not a duplicate
});

test('periods', () => {
  assert.deepEqual(periodContaining('calendar_month', '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodContaining('calendar_quarter', '2026-10-09'), { start: '2026-10-01', end: '2026-12-31' });
  assert.deepEqual(previousPeriod('calendar_quarter', '2026-10-09'), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(periodContaining('calendar_year', '2026-10-09'), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(periodContaining('card_year', '2026-10-09', { issueDate: '2024-11-20' }), { start: '2025-11-20', end: '2026-11-19' });
  assert.deepEqual(periodContaining('card_year', '2026-12-01', { issueDate: '2024-11-20' }), { start: '2026-11-20', end: '2027-11-19' });
  assert.equal(periodContaining('card_year', '2026-10-09', {}), null);
  assert.deepEqual(periodContaining('statement_cycle', '2026-10-09', { statementDay: 15 }), { start: '2026-09-16', end: '2026-10-15' });
  assert.deepEqual(periodContaining('statement_cycle', '2026-10-20', { statementDay: 15 }), { start: '2026-10-16', end: '2026-11-15' });
  assert.deepEqual(periodContaining('statement_cycle', '2026-03-05', { statementDay: 31 }), { start: '2026-03-01', end: '2026-03-31' });
});

test('totals by card and category for a period', () => {
  const ps = [
    { ...base, id: '1', status: 'completed', estimatedSavingPaise: 15000 },
    { ...base, id: '2', date: '2026-10-02', category: 'grocery', amountPaise: 200000, cardId: 'c2', status: 'refunded', refundPaise: 50000 },
    { ...base, id: '3', status: 'pending', amountPaise: 99900 },
    { ...base, id: '4', status: 'cancelled' },
    { ...base, id: '5', date: '2026-09-30', status: 'completed' },
  ];
  const t = totals(ps, '2026-10-01', '2026-10-31');
  assert.equal(t.totalPaise, 1500000 + 150000);
  assert.equal(t.count, 2);
  assert.deepEqual(t.byCard, { c1: 1500000, c2: 150000 });
  assert.deepEqual(t.byCategory, { electronics: 1500000, grocery: 150000 });
  assert.equal(t.pendingPaise, 99900);
  assert.equal(t.savedPaise, 15000);
});

test('milestone progress: lounge unlock this and last quarter; card-year needs issue date (Scenarios 3, 5)', () => {
  const card = validateCard({ id: 'c2', bank: 'ICICI Bank', name: 'Coral', kind: 'debit', network: 'Visa', nickname: 'Debit' }).card;
  const ps = [
    { ...base, cardId: card.id, id: 'a', date: '2026-08-10', amountPaise: 1200000, status: 'completed' },
    { ...base, cardId: card.id, id: 'b', date: '2026-10-05', amountPaise: 700000, status: 'completed' },
    { ...base, cardId: card.id, id: 'c', date: '2026-10-06', amountPaise: 500000, status: 'refunded', refundPaise: 500000 },
    { ...base, cardId: 'other', id: 'd', date: '2026-10-06', amountPaise: 900000, status: 'completed' },
  ];
  const [lounge] = milestoneProgress(card, coralPack, ps, '2026-10-09');
  assert.equal(lounge.eligiblePaise, 700000);
  assert.equal(lounge.remainingPaise, 300000);
  assert.equal(lounge.percent, 70);
  assert.equal(lounge.met, false);
  assert.equal(lounge.previous.met, true); // ₹12,000 last quarter → visits available now
  const em = validateCard({ id: 'c1', bank: 'ICICI Bank', name: 'Emerald', kind: 'credit', network: 'Visa', nickname: 'E' }).card;
  const fee = milestoneProgress(em, emeraldePack, [], '2026-10-09').find((x) => x.milestone.kind === 'fee_waiver');
  assert.equal(fee.missing, 'issueDate');
  const fee2 = milestoneProgress({ ...em, issueDate: '2024-11-20' }, emeraldePack, [{ ...base, cardId: em.id, id: 'x', amountPaise: 23500000_00 / 100, status: 'completed' }], '2026-10-09').find((x) => x.milestone.kind === 'fee_waiver');
  assert.equal(fee2.percent, 23.5);
});

test('month records flatten newest first', () => {
  const m = [{ purchases: [{ id: 'a', date: '2026-10-01', createdAt: 1 }] }, { purchases: [{ id: 'b', date: '2026-10-05', createdAt: 2 }, { id: 'c', date: '2026-10-05', createdAt: 3 }] }];
  assert.deepEqual(flattenMonths(m).map((x) => x.id), ['c', 'b', 'a']);
});

test('shop names: directory spelling or capitalised words', async () => {
  const { formatShopName } = await import('../src/core/merchants.js');
  assert.equal(formatShopName('bookmyshow'), 'BookMyShow');
  assert.equal(formatShopName('  dmart '), 'DMart');
  assert.equal(formatShopName('ratnadeep   supermarket'), 'Ratnadeep');
  assert.equal(formatShopName('sri sai tiffin centre'), 'Sri Sai Tiffin Centre');
  assert.equal(formatShopName('KFC'), 'KFC');
  assert.equal(formatShopName('othe'), 'Othe');
});

test('credit card bill and payment dates', async () => {
  const { billingInfo, dueDateFor } = await import('../src/core/purchases.js');
  assert.equal(dueDateFor('2026-10-15', 4), '2026-11-04');
  assert.equal(dueDateFor('2026-10-02', 22), '2026-10-22');
  assert.equal(dueDateFor('2026-12-20', 8), '2027-01-08');
  assert.equal(dueDateFor('2026-01-31', 30), '2026-02-28');
  const card = { id: 'c', kind: 'credit', statementDay: 15, dueDay: 4 };
  const ps = [
    { cardId: 'c', date: '2026-09-20', amountPaise: 100000, status: 'completed' },
    { cardId: 'c', date: '2026-10-01', amountPaise: 50000, status: 'refunded', refundPaise: 20000 },
    { cardId: 'c', date: '2026-10-16', amountPaise: 70000, status: 'completed' },
  ];
  const b = billingInfo(card, ps, '2026-10-09');
  assert.equal(b.lastBill, '2026-09-15');
  assert.equal(b.lastDue, '2026-10-04');
  assert.equal(b.nextBill, '2026-10-15');
  assert.equal(b.nextDue, '2026-11-04');
  assert.equal(b.unbilledPaise, 130000);
  assert.deepEqual(b.payBy, { date: '2026-11-04', bill: '2026-10-15', amountPaise: null });
  const b2 = billingInfo(card, ps, '2026-10-20');
  assert.equal(b2.lastBilledPaise, 130000);
  assert.deepEqual(b2.payBy, { date: '2026-11-04', bill: '2026-10-15', amountPaise: 130000 });
  assert.equal(billingInfo({ ...card, kind: 'debit' }, ps, '2026-10-09'), null);
  assert.equal(billingInfo({ ...card, statementDay: null }, ps, '2026-10-09'), null);
});
