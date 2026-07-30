import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStake } from '../src/engine/stakeSizing.js';

const pick = {
  modelProbability: 0.76,
  bookmakerOdds: 1.70,
};

test('WATCH and SKIP always receive zero stake', () => {
  for (const advisorStatus of ['WATCH', 'SKIP']) {
    const stake = computeStake(pick, {
      advisorStatus,
      convictionTier: 'MAX',
      confidence: { model: 'HIGH' },
      bankroll: 100,
    });
    assert.equal(stake.shouldBet, false);
    assert.equal(stake.stakeUnits, 0);
    assert.equal(stake.bankrollPct, 0);
  }
});

test('maximum conviction is capped at three percent of bankroll', () => {
  const stake = computeStake(pick, {
    advisorStatus: 'BET',
    convictionTier: 'MAX',
    confidence: { model: 'HIGH' },
    bankroll: 1000,
  });

  assert.equal(stake.shouldBet, true);
  assert.ok(stake.bankrollPct <= 0.03);
  assert.ok(stake.stakeUnits <= 30);
  assert.equal(stake.exposureLabel, 'MAXIMUM APPROVED');
});

test('standard conviction is capped at one and a half percent', () => {
  const stake = computeStake(pick, {
    advisorStatus: 'BET',
    convictionTier: 'STANDARD',
    confidence: { model: 'HIGH' },
    bankroll: 1000,
  });

  assert.equal(stake.shouldBet, true);
  assert.ok(stake.bankrollPct <= 0.015);
  assert.ok(stake.stakeUnits <= 15);
});

test('a price without positive Kelly edge cannot produce a bet', () => {
  const stake = computeStake(
    { modelProbability: 0.50, bookmakerOdds: 1.80 },
    {
      advisorStatus: 'BET',
      convictionTier: 'HIGH',
      confidence: { model: 'HIGH' },
      bankroll: 100,
    },
  );

  assert.equal(stake.shouldBet, false);
  assert.equal(stake.stakeUnits, 0);
});
