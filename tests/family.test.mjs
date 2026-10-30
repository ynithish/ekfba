import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMember, renameInPolicies } from '../src/core/family.js';

test('family members', () => {
  const r = validateMember({ id: 'm1', name: '  Nandini ', relation: 'Spouse' }, [], null, 2);
  assert.deepEqual(r.member, { name: 'Nandini', relation: 'Spouse', id: 'm1', createdAt: 2, updatedAt: 2 });
  assert.ok(validateMember({ name: 'nandini' }, [{ id: 'm1', name: 'Nandini' }]).errors.name);
  assert.equal(validateMember({ id: 'm1', name: 'Nandini K' }, [{ id: 'm1', name: 'Nandini' }], { id: 'm1' }).ok, true);
  assert.equal(validateMember({ name: 'X', relation: 'Boss' }).member.relation, '');
  const ps = [{ id: 'a', people: ['Nithish', 'Nandini'] }, { id: 'b', people: ['Nithish'] }];
  assert.deepEqual(renameInPolicies(ps, 'nandini', 'Nandini K'), [{ id: 'a', people: ['Nithish', 'Nandini K'] }]);
});
