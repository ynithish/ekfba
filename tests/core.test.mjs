import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRupeesToPaise, formatPaise, percentOf, progressPercent } from '../src/core/money.js';
import { findSensitiveData, scanForSensitiveData } from '../src/core/sensitive.js';
import { validateCard, cardLabel } from '../src/core/card.js';
import { encryptJson, decryptJson } from '../src/core/crypto.js';
import { buildBackup, validateBackup, mergeRecords } from '../src/core/backup.js';

test('money: parses Indian inputs to integer paise', () => {
  assert.equal(parseRupeesToPaise('15,000'), 1_500_000);
  assert.equal(parseRupeesToPaise('₹1,50,000.50'), 15_000_050);
  assert.equal(parseRupeesToPaise('Rs. 499'), 49_900);
  assert.equal(parseRupeesToPaise('65k'), 6_500_000);
  assert.equal(parseRupeesToPaise('1.2L'), 12_000_000);
  assert.equal(parseRupeesToPaise('3 lakh'), 30_000_000);
  assert.equal(parseRupeesToPaise('0.1'), 10);
  assert.equal(parseRupeesToPaise(0.1 + 0.2), 30); // float noise rounds to the paisa
  for (const bad of ['', 'abc', '-5', '1.234', '12..3', null, undefined, NaN]) assert.equal(parseRupeesToPaise(bad), null, String(bad));
});

test('money: formats with Indian digit grouping', () => {
  assert.equal(formatPaise(23_500_000), '₹2,35,000');
  assert.equal(formatPaise(30_000_000), '₹3,00,000');
  assert.equal(formatPaise(99), '₹0.99');
  assert.equal(formatPaise(123_456_789_00), '₹12,34,56,789');
  assert.equal(formatPaise(-150_000), '−₹1,500');
  assert.equal(formatPaise(150_000, { showSign: true }), '+₹1,500');
  assert.throws(() => formatPaise(1.5));
});

test('money: percentages and progress', () => {
  assert.equal(percentOf(1_500_000, 500), 75_000); // 5% of ₹15,000 = ₹750
  assert.equal(percentOf(999, 150), 14); // rounds down
  assert.equal(progressPercent(23_500_000, 30_000_000), 78.3); // the spec's example
  assert.equal(progressPercent(5, 0), 100);
  assert.equal(progressPercent(40, 20), 100);
});

test('sensitive: blocks card numbers, CVV, PIN, OTP, passwords', () => {
  assert.ok(findSensitiveData('my card 4111 1111 1111 1111'));
  assert.ok(findSensitiveData('5500-0000-0000-0004'));
  assert.ok(findSensitiveData('cvv 123'));
  assert.ok(findSensitiveData('ATM PIN: 4321'));
  assert.ok(findSensitiveData('OTP is 834921'));
  assert.ok(findSensitiveData('netbanking password: hunter22'));
  assert.equal(findSensitiveData('Spend ₹3,00,000 in a year for waiver; call 1800 202 6161'), null);
  assert.equal(findSensitiveData('ends 4417'), null);
  assert.deepEqual(scanForSensitiveData({ a: { cvv: '999' } }).path, 'a.cvv');
  assert.equal(scanForSensitiveData({ orderRef: '4111111111111111' }), null); // order refs exempt
});

test('card: valid card is normalised with id and version', () => {
  const r = validateCard({ bank: ' HDFC Bank ', name: 'Millennia', kind: 'credit', network: 'Visa', last4: '4417', annualFeePaise: 100_000 });
  assert.equal(r.ok, true);
  assert.equal(r.card.bank, 'HDFC Bank');
  assert.equal(r.card.version, 1);
  assert.match(r.card.id, /^[0-9a-f-]{36}$/);
  assert.equal(cardLabel(r.card), 'HDFC Bank Millennia ••4417');
  const edited = validateCard({ ...r.card, nickname: 'Daily' }, r.card);
  assert.equal(edited.card.id, r.card.id);
  assert.equal(edited.card.version, 2);
  assert.equal(cardLabel(edited.card), 'Daily ••4417');
});

test('card: rejects missing fields, full numbers and bad last4', () => {
  const r = validateCard({ bank: '', name: 'X', kind: 'gold', network: 'Visa' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.bank && r.errors.kind && r.errors.nickname);
  assert.ok(validateCard({ bank: 'A', name: 'B', kind: 'debit', network: 'RuPay', last4: '12345' }).errors.last4);
  const leak = validateCard({ bank: 'A', name: 'B', kind: 'debit', network: 'RuPay', nickname: 'x', notes: 'number 4111111111111111' });
  assert.equal(leak.ok, false);
  assert.match(leak.errors.notes, /card number/);
});

test('crypto: encrypt/decrypt round trip; wrong passphrase fails', async () => {
  const data = { hello: 'world', n: [1, 2, 3] };
  const env = await encryptJson(data, 'correct horse battery');
  assert.equal(env.format, 'ekfba-encrypted');
  assert.ok(!JSON.stringify(env).includes('world'));
  assert.deepEqual(await decryptJson(env, 'correct horse battery'), data);
  await assert.rejects(decryptJson(env, 'wrong passphrase!!'), /Wrong passphrase/);
  await assert.rejects(encryptJson(data, 'short'), /at least 10/);
});

test('backup: build -> validate preserves records exactly', () => {
  const card = validateCard({ bank: 'SBI', name: 'Cashback', kind: 'credit', network: 'Visa', nickname: 'SBI CB' }).card;
  const b = buildBackup({ cards: [card], settings: [{ key: 'theme', value: 'dark' }] }, '0.1.0');
  const v = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.stores.cards[0], card);
  assert.equal(v.summary.cards, 1);
  assert.equal(v.summary.settings, 1);
});

test('backup: rejects foreign files, newer formats, duplicates and leaks', () => {
  assert.equal(validateBackup({}).ok, false);
  assert.equal(validateBackup({ format: 'ekfba-backup', schemaVersion: 99, stores: {} }).ok, false);
  const card = validateCard({ bank: 'SBI', name: 'C', kind: 'credit', network: 'Visa', nickname: 'n' }).card;
  assert.equal(validateBackup(buildBackup({ cards: [card, card] }, 'x')).ok, false);
  const leaky = buildBackup({ cards: [{ ...card, notes: 'cvv: 123' }] }, 'x');
  assert.match(validateBackup(leaky).errors[0], /CVV/);
});

test('backup: merge keeps the newer record', () => {
  const a = { id: '1', updatedAt: '2026-01-01', v: 'old' };
  const b = { id: '1', updatedAt: '2026-02-01', v: 'new' };
  const c = { id: '2', updatedAt: '2026-01-01' };
  const m = mergeRecords([a], [b, c]);
  assert.equal(m.added, 1);
  assert.equal(m.updated, 1);
  assert.equal(m.merged.find((r) => r.id === '1').v, 'new');
  assert.equal(mergeRecords([b], [a]).unchanged, 1);
});
