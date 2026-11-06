import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMember, renameInPolicies } from '../src/core/family.js';

test('family members', () => {
  const r = validateMember({ id: 'm1', name: '  Nandini ', relation: 'Spouse' }, [], null, 2);
  assert.deepEqual(r.member, { name: 'Nandini', relation: 'Spouse', documents: [], vaccinations: [], id: 'm1', createdAt: 2, updatedAt: 2 });
  assert.ok(validateMember({ name: 'nandini' }, [{ id: 'm1', name: 'Nandini' }]).errors.name);
  assert.equal(validateMember({ id: 'm1', name: 'Nandini K' }, [{ id: 'm1', name: 'Nandini' }], { id: 'm1' }).ok, true);
  assert.equal(validateMember({ name: 'X', relation: 'Boss' }).member.relation, '');
  const ps = [{ id: 'a', people: ['Nithish', 'Nandini'] }, { id: 'b', people: ['Nithish'] }];
  assert.deepEqual(renameInPolicies(ps, 'nandini', 'Nandini K'), [{ id: 'a', people: ['Nithish', 'Nandini K'] }]);
});

test('ID documents on family members', async () => {
  const { checkIdDoc, maskId } = await import('../src/core/family.js');
  assert.deepEqual(checkIdDoc({ type: 'Aadhaar', number: '1234 5678 9012', url: 'https://drive.google.com/a' })[0].number, '1234 5678 9012');
  assert.equal(checkIdDoc({ type: 'Aadhaar', number: '123456789012' })[0].number, '1234 5678 9012');
  assert.ok(checkIdDoc({ type: 'Aadhaar', number: '1234' })[1]);
  assert.equal(checkIdDoc({ type: 'PAN', number: 'abcde1234f' })[0].number, 'ABCDE1234F');
  assert.ok(checkIdDoc({ type: 'PAN', number: 'ABC1234' })[1]);
  assert.ok(checkIdDoc({ type: 'Driving Licence', number: 'TS09 20190012345', url: 'http://x' })[1]);
  assert.equal(checkIdDoc({ type: 'Driving Licence', number: 'TS09 20190012345' })[1], null);
  assert.equal(maskId('1234 5678 9012'), '•••• •••• 9012');
  assert.equal(maskId('ABCDE1234F'), '•••• •• 234F');
  const r = validateMember({ id: 'm', name: 'Nithish', documents: [{ type: 'PAN', number: 'ABCDE1234F' }, { type: 'Other', number: '', url: '' }] }, []);
  assert.equal(r.ok, true);
  assert.equal(r.member.documents.length, 1);
  assert.ok(validateMember({ name: 'N', documents: [{ type: 'Aadhaar', number: '12' }] }, []).errors['documents.0']);
});

test('vaccinations on family members', async () => {
  const { checkVaccination, nextVaccination } = await import('../src/core/family.js');
  assert.equal(checkVaccination({ name: 'MMR', dose: '2', givenOn: '2026-01-10', nextDue: '2027-01-10' })[1], null);
  assert.ok(checkVaccination({ name: '', givenOn: '2026-01-10' })[1]);
  assert.ok(checkVaccination({ name: 'MMR' })[1]);
  assert.ok(checkVaccination({ name: 'MMR', givenOn: '2026-01-10', nextDue: '2026-01-01' })[1]);
  const r = validateMember({ id: 'k', name: 'Adhyasree', vaccinations: [{ name: 'Typhoid', nextDue: '2027-03-01' }, { name: 'MMR', givenOn: '2026-05-01', nextDue: '2026-12-01' }, { name: '' }] }, []);
  assert.equal(r.ok, true);
  assert.equal(r.member.vaccinations.length, 2);
  assert.equal(nextVaccination(r.member).name, 'MMR');
  assert.ok(validateMember({ name: 'K', vaccinations: [{ name: 'X', givenOn: 'bad' }] }, []).errors['vaccinations.0']);
});
