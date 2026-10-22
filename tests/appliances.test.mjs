import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppliance, looksApplianceRelated, itemTotals } from '../src/core/appliances.js';
import { nextDueDate, subscriptionsFrom } from '../src/core/subscriptions.js';
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
