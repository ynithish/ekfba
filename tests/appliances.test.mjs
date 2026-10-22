import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppliance, looksApplianceRelated, itemTotals } from '../src/core/appliances.js';
import { nextDueDate, subscriptionsFrom, subscriptionLabel, normaliseSubscription } from '../src/core/subscriptions.js';
import { validatePurchase } from '../src/core/purchases.js';

test('appliance validation with AMC', () => {
  const r = validateAppliance({ id: 'a1', name: 'Bedroom AC', type: 'AC', amc: { provider: 'Voltas', startDate: '2026-04-01', endDate: '2027-03-31', amountPaise: 350000 } }, null, 3);
  assert.equal(r.ok, true);
  assert.equal(r.item.group, 'appliance');
  assert.deepEqual(r.item.amc, { provider: 'Voltas', startDate: '2026-04-01', endDate: '2027-03-31', amountPaise: 350000, notes: '' });
  assert.equal(validateAppliance({ name: 'iPhone 15', type: 'Mobile' }).item.group, 'device');
  assert.equal(validateAppliance({ name: 'iPhone', type: 'Mobile' }).item.amc, null);
  assert.ok(validateAppliance({ name: 'AC', type: 'AC', amc: { provider: 'Voltas' } }).errors['amc.endDate']);
  assert.ok(validateAppliance({ name: 'AC', type: 'AC', amc: { startDate: '2027-05-01', endDate: '2027-03-31' } }).errors['amc.endDate']);
  assert.ok(validateAppliance({ name: '' }).errors.name);
});

test('appliance/device detection', () => {
  for (const m of ['Airtel recharge', 'Jio', 'Vi postpaid', 'Voltas AC service', 'Kent RO service', 'Samsung TV repair', 'ACT Fibernet broadband', 'Tata Play DTH', 'AMC renewal', 'Laptop charger'])
    assert.equal(looksApplianceRelated({ merchant: m }), true, m);
  for (const m of ['Croma', 'Swiggy', 'Tiffin', 'Vijay Sales', 'Accenture', 'Robo toys', 'Jiogger'])
    assert.equal(looksApplianceRelated({ merchant: m }), false, m);
  assert.equal(looksApplianceRelated({ merchant: 'Some shop', category: 'telecom' }), true);
});

test('subscriptions: next due dates and grouping', () => {
  assert.equal(nextDueDate('2026-10-05', '28d'), '2026-11-02');
  assert.equal(nextDueDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextDueDate('2026-11-15', 'quarterly'), '2027-02-15');
  assert.equal(nextDueDate('2026-10-22', 'yearly'), '2027-10-22');
  const base = { cardId: 'c', category: 'telecom', status: 'completed' };
  const ps = [
    { ...base, id: '1', merchant: 'Airtel', date: '2026-09-07', amountPaise: 29900, subscription: { every: '28d' }, applianceId: 'm1' },
    { ...base, id: '2', merchant: 'airtel', date: '2026-10-05', amountPaise: 34900, subscription: { every: '28d' }, applianceId: 'm1' },
    { ...base, id: '3', merchant: 'Netflix', date: '2026-10-10', amountPaise: 64900, subscription: { every: 'monthly' } },
    { ...base, id: '4', merchant: 'Croma', date: '2026-10-10', amountPaise: 100 },
    { ...base, id: '5', merchant: 'Hotstar', date: '2026-10-01', amountPaise: 100, subscription: { every: 'yearly' }, status: 'cancelled' },
  ];
  const subs = subscriptionsFrom(ps);
  assert.deepEqual(subs.map((s) => [s.merchant, s.nextDue, s.amountPaise, s.count]), [['Airtel', '2026-11-02', 34900, 2], ['Netflix', '2026-11-10', 64900, 1]]);
  assert.deepEqual(itemTotals(ps, '2026-10-01', '2026-10-31'), { m1: { paise: 34900, count: 1 } });
});

test('purchases keep appliance and subscription', () => {
  const b = { date: '2026-10-09', merchant: 'Airtel', category: 'telecom', amountPaise: 29900, cardId: 'c1' };
  const r = validatePurchase({ ...b, applianceId: 'm1', subscription: { every: '28d' } });
  assert.equal(r.purchase.applianceId, 'm1');
  assert.deepEqual(r.purchase.subscription, { every: '28d' });
  assert.equal(validatePurchase(b).purchase.subscription, null);
  assert.ok(validatePurchase({ ...b, subscription: { every: 'weekly' } }).errors.subscription);
});

test('custom periods and variable amounts', () => {
  assert.equal(nextDueDate('2026-10-22', { every: 'custom', count: 7, unit: 'months' }), '2027-05-22');
  assert.equal(nextDueDate('2026-10-22', { every: 'custom', count: 45, unit: 'days' }), '2026-12-06');
  assert.equal(subscriptionLabel({ every: 'custom', count: 13, unit: 'months' }), 'Every 13 months');
  assert.equal(subscriptionLabel({ every: 'custom', count: 1, unit: 'days' }), 'Every 1 day');
  assert.equal(subscriptionLabel({ every: 'monthly' }), 'Monthly');
  assert.equal(normaliseSubscription({ every: 'custom', count: 0, unit: 'months' }), undefined);
  assert.equal(normaliseSubscription({ every: 'custom', count: 61, unit: 'months' }), undefined);
  assert.deepEqual(normaliseSubscription({ every: 'monthly', variable: true }), { every: 'monthly', variable: true });
  const b = { date: '2026-10-09', merchant: 'TSSPDCL', category: 'utilities', amountPaise: 150000, cardId: 'c1' };
  assert.deepEqual(validatePurchase({ ...b, subscription: { every: 'custom', count: '7', unit: 'months' } }).purchase.subscription, { every: 'custom', count: 7, unit: 'months' });
  assert.ok(validatePurchase({ ...b, subscription: { every: 'custom', count: 'x', unit: 'months' } }).errors.subscription);
  const ps = [
    { ...b, id: '1', date: '2026-08-05', amountPaise: 120000, status: 'completed', subscription: { every: 'monthly', variable: true } },
    { ...b, id: '2', date: '2026-09-05', amountPaise: 180000, status: 'completed', subscription: { every: 'monthly', variable: true } },
    { ...b, id: '3', date: '2026-10-05', amountPaise: 150000, status: 'completed', subscription: { every: 'monthly', variable: true } },
    { ...b, id: '4', date: '2026-07-05', amountPaise: 900000, status: 'completed', subscription: { every: 'monthly', variable: true } },
  ];
  const [x] = subscriptionsFrom(ps);
  assert.equal(x.variable, true);
  assert.equal(x.amountPaise, 150000);
  assert.equal(x.averagePaise, 150000); // last three: 1,500 + 1,800 + 1,200
  assert.equal(x.nextDue, '2026-11-05');
  assert.equal(x.count, 4);
});
