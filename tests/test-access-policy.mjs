import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccessStatus } from '../src/auth/accessPolicy.js';

const options = { now: new Date('2026-09-08T12:00:00Z'), adminEmail: 'owner@example.test' };
const access = user => computeAccessStatus(user, options);

test('missing or malformed expiry never grants an indefinite trial or premium subscription', () => {
  for (const status of ['trial', 'premium']) {
    for (const value of [null, '', 'invalid']) {
      const result = access({ status, trial_ends_at: value, premium_expires_at: value, subscription_expires_at: '2020-01-01' });
      assert.equal(result.has_full_access, false);
      assert.equal(result.status, 'expired');
    }
  }
});

test('either valid premium expiry works and expiry boundary is exclusive', () => {
  assert.equal(access({ subscription_expires_at: '2026-09-09' }).subscription_active, true);
  assert.equal(access({ premium_expires_at: '2026-09-09' }).subscription_active, true);
  assert.equal(access({ trial_ends_at: '2026-09-09' }).trial_active, true);
  assert.equal(access({ trial_ends_at: options.now.toISOString() }).has_full_access, false);
});

test('admin entitlement is preserved without accepting a false string flag', () => {
  assert.equal(access({ email: 'OWNER@example.test' }).has_full_access, true);
  assert.equal(access({ is_admin: 1 }).has_full_access, true);
  assert.equal(access({ is_admin: 'false' }).has_full_access, false);
});
