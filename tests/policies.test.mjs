import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, parsePeople, sortPolicies, allPeople, policyCalendarLink } from '../src/core/policies.js';

test('policy validation keeps the NLNLALD shape', () => {
  const r = validatePolicy({ id: 'p1', insurer: ' Care Health Insurance ', type: 'Health', people: 'Nithish, Nandini, nithish', renewalDate: '2027-09-01',
    documents: [{ kind: 'Policy copy', label: 'Policy Copy', url: 'https://drive.google.com/x' }], createdAt: 7 }, null, 9);
  assert.equal(r.ok, true);
  assert.deepEqual(r.policy.people, ['Nithish', 'Nandini']);
  assert.equal(r.policy.insurer, 'Care Health Insurance');
  assert.equal(r.policy.createdAt, 7);
  assert.equal(r.policy.updatedAt, 9);
  assert.equal(validatePolicy({ insurer: '', type: 'Life', renewalDate: '2027-07-15' }).errors.insurer, 'Enter the insurance company.');
  assert.ok(validatePolicy({ insurer: 'X', type: 'Life', renewalDate: '2027-02-30' }).errors.renewalDate);
  assert.ok(validatePolicy({ insurer: 'X', type: 'Life', renewalDate: '2027-07-15', documents: [{ kind: 'Other', url: 'http://x' }] }).errors['documents.0']);
  assert.equal(validatePolicy({ insurer: 'X', type: 'Life', renewalDate: '2027-07-15', comments: 'card 4111 1111 1111 1111' }).ok, false);
});

test('people, sorting and reminders', () => {
  assert.deepEqual(parsePeople(['A', ' a ', 'B']), ['A', 'B']);
  const ps = [{ insurer: 'B', renewalDate: '2027-09-01', people: ['Nandini'] }, { insurer: 'A', renewalDate: '2027-07-15', people: ['Nithish'] }, { insurer: 'C', people: [] }];
  assert.deepEqual(sortPolicies(ps).map((p) => p.insurer), ['A', 'B', 'C']);
  assert.deepEqual(allPeople(ps), ['Nandini', 'Nithish']);
  const l = policyCalendarLink({ insurer: 'Care', type: 'Health', renewalDate: '2027-09-01', people: ['Nithish'] }, 30, '2026-10-19');
  assert.match(l, /dates=20270802\/20270803/);
  assert.equal(policyCalendarLink({ insurer: 'Care', type: 'Health', renewalDate: '2026-10-20' }, 7, '2026-10-19'), null);
});
