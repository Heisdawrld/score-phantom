import test from 'node:test';
import assert from 'node:assert/strict';
import { transactionMatchesExpected } from '../src/services/flutterwave.js';

const transaction = {
  status: 'successful',
  tx_ref: 'SP_42_123',
  amount: 3000,
  currency: 'NGN',
};

test('verified Flutterwave transaction must match every initialized field', () => {
  assert.equal(transactionMatchesExpected(transaction, {
    txRef: 'SP_42_123',
    amount: 3000,
    currency: 'NGN',
  }), true);
});

test('a successful transaction cannot be replayed against another reference', () => {
  assert.equal(transactionMatchesExpected(transaction, {
    txRef: 'SP_99_456',
    amount: 3000,
    currency: 'NGN',
  }), false);
});

test('wrong amount, currency, or status never grants value', () => {
  assert.equal(transactionMatchesExpected({ ...transaction, amount: 1000 }, { txRef: transaction.tx_ref, amount: 3000, currency: 'NGN' }), false);
  assert.equal(transactionMatchesExpected({ ...transaction, currency: 'USD' }, { txRef: transaction.tx_ref, amount: 3000, currency: 'NGN' }), false);
  assert.equal(transactionMatchesExpected({ ...transaction, status: 'pending' }, { txRef: transaction.tx_ref, amount: 3000, currency: 'NGN' }), false);
});

test('invalid expected payment data fails closed', () => {
  assert.equal(transactionMatchesExpected(transaction, { txRef: transaction.tx_ref, amount: null, currency: 'NGN' }), false);
});
