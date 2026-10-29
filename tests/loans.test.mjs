import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLoan, emiFor, loanStatus, looksLoanRelated } from '../src/core/loans.js';
import { validatePurchase } from '../src/core/purchases.js';

test('EMI formula', () => {
  // ₹10,00,000 at 8.5% for 240 months ≈ ₹8,678.23
  assert.equal(emiFor(100000000, 850, 240), 867823);
  assert.equal(emiFor(120000, 0, 12), 10000);
});

test('loan validation: bank loans need rate, term and EMI (EMI can be worked out); hand loans are flexible', () => {
  const r = validateLoan({ id: 'l1', name: 'SBI home loan', type: 'home', principalPaise: 100000000, startDate: '2026-01-05', annualRateBps: 850, termMonths: 240 }, null, 1);
  assert.equal(r.ok, true);
  assert.equal(r.loan.emiPaise, 867823);
  const bad = validateLoan({ name: 'PL', type: 'personal', principalPaise: 50000000, startDate: '2026-01-05' });
  assert.ok(bad.errors.annualRateBps && bad.errors.termMonths);
  assert.equal(validateLoan({ name: 'From Ravi', type: 'hand', principalPaise: 5000000, startDate: '2026-09-01' }).ok, true);
  assert.ok(validateLoan({ name: 'X', type: 'hand', principalPaise: 100, startDate: '2026-09-01', openingPaise: 50 }).errors.openingDate);
});

test('outstanding after payments: reducing balance with daily interest; hand loan is simple', () => {
  const loan = { id: 'l1', type: 'personal', principalPaise: 12000000, startDate: '2026-01-01', annualRateBps: 1200, termMonths: 12, emiPaise: emiFor(12000000, 1200, 12) };
  const pay = (date, amountPaise) => ({ loanId: 'l1', date, amountPaise, status: 'completed', cardId: 'c', merchant: 'EMI', category: 'emi' });
  // 31 days of interest on ₹1,20,000 at 12% = ₹1,223.01; EMI ₹10,661.85 → ₹1,10,561.16 left
  let st = loanStatus(loan, [pay('2026-02-01', loan.emiPaise)], '2026-02-10');
  assert.equal(st.interestPaise, 122301);
  assert.equal(st.outstandingPaise, 12000000 + 122301 - loan.emiPaise);
  assert.equal(st.payments, 1);
  assert.equal(st.emisLeft, 11);
  assert.equal(st.missingEarlier, false);
  assert.equal(loanStatus(loan, [pay('2026-06-01', loan.emiPaise)], '2026-06-10').missingEarlier, true);
  // A prepayment brings it down further; future-dated and other loans' payments are ignored.
  st = loanStatus(loan, [pay('2026-02-01', loan.emiPaise), pay('2026-02-01', 5000000), pay('2026-03-01', 999), { ...pay('2026-02-01', 5), loanId: 'x' }], '2026-02-10');
  assert.equal(st.outstandingPaise, 12000000 + 122301 - loan.emiPaise - 5000000);
  assert.ok(st.emisLeft < 11);
  // Starting from an outstanding amount on a later date.
  st = loanStatus({ ...loan, openingPaise: 6000000, openingDate: '2026-06-01' }, [pay('2026-05-01', 999999), pay('2026-07-01', 1000000)], '2026-07-02');
  assert.equal(st.payments, 1);
  assert.equal(st.outstandingPaise, 6000000 + Math.round(6000000 * 0.12 * 30 / 365) - 1000000);
  // Hand loan: no interest charged.
  const hand = { id: 'h', type: 'hand', principalPaise: 5000000, startDate: '2026-09-01', annualRateBps: 1200 };
  st = loanStatus(hand, [{ ...pay('2026-10-01', 2000000), loanId: 'h' }], '2026-10-29');
  assert.equal(st.outstandingPaise, 3000000);
  assert.equal(st.interestPaise, 0);
  assert.equal(st.paidPercent, 40);
});

test('loan repayment detection and purchases keep the loan', () => {
  for (const m of ['HDFC home loan EMI', 'Loan repayment', 'Bajaj Finserv EMI', 'Ravi hand loan']) assert.equal(looksLoanRelated({ merchant: m }), true, m);
  for (const m of ['Croma', 'Emirates', 'Swiggy']) assert.equal(looksLoanRelated({ merchant: m }), false, m);
  assert.equal(looksLoanRelated({ merchant: 'Bank', category: 'emi' }), true);
  assert.equal(validatePurchase({ date: '2026-10-05', merchant: 'SBI EMI', category: 'emi', amountPaise: 867823, cardId: 'c', loanId: 'l1' }).purchase.loanId, 'l1');
});
