import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanned, markPlannedPaid, datesInMonth, forecastTotals, addMonths, monthBounds } from '../src/core/planned.js';

test('planned payment validation', () => {
  const r = validatePlanned({ id: 'p', name: 'School fees', dueDate: '2026-11-15' }, null, 1);
  assert.equal(r.ok, true);
  assert.equal(r.planned.amountPaise, null);
  assert.equal(r.planned.repeat, null);
  assert.deepEqual(validatePlanned({ name: 'Tax', dueDate: '2027-04-30', amountPaise: 450000, repeat: { every: 'yearly' } }).planned.repeat, { every: 'yearly' });
  assert.ok(validatePlanned({ name: 'Tax', dueDate: '2027-04-30', repeat: { every: 'custom', count: 0, unit: 'months' } }).errors.repeat);
  assert.ok(validatePlanned({ name: '', dueDate: 'x' }).errors.dueDate);
});

test('marking paid moves repeating ones on and closes one-offs', () => {
  const tax = { name: 'Tax', dueDate: '2026-04-30', repeat: { every: 'yearly' } };
  assert.equal(markPlannedPaid(tax, '2026-04-28').dueDate, '2027-04-30');
  assert.equal(markPlannedPaid(tax, '2027-05-02').dueDate, '2028-04-30'); // paid very late
  const fee = { name: 'Fees', dueDate: '2026-11-15', repeat: null };
  assert.deepEqual([markPlannedPaid(fee, '2026-11-10').status, markPlannedPaid(fee, '2026-11-10').lastPaid], ['done', '2026-11-10']);
});

test('projecting into a month and totals', () => {
  assert.deepEqual(datesInMonth('2026-11-15', null, '2026-11'), ['2026-11-15']);
  assert.deepEqual(datesInMonth('2026-11-15', null, '2026-12'), []);
  assert.deepEqual(datesInMonth('2026-04-30', { every: 'yearly' }, '2027-04'), ['2027-04-30']);
  assert.deepEqual(datesInMonth('2026-10-05', { every: '28d' }, '2026-11'), ['2026-11-02', '2026-11-30']);
  assert.deepEqual(datesInMonth('2026-01-10', { every: 'custom', count: 3, unit: 'months' }, '2026-10'), ['2026-10-10']);
  assert.deepEqual(forecastTotals([{ amountPaise: 100 }, { amountPaise: null }, { amountPaise: 250 }]), { knownPaise: 350, unknownCount: 1, count: 3 });
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.deepEqual(monthBounds('2027-02'), { start: '2027-02-01', end: '2027-02-28' });
});
