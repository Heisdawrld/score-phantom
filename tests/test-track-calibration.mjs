// Phase 2 (money map) — track-record recalibration + market quarantine + odds gate.
// Run: node --test tests/test-track-calibration.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTrackRecordCalibration,
  isTrackCalibrationEnabled,
  TRACK_CALIBRATION,
} from '../src/probabilities/trackRecordCalibration.js';
import { buildMarketCandidates } from '../src/markets/buildMarketCandidates.js';
import {
  evaluateRecommendation,
  findSafetyFallback,
} from '../src/engine/recommendationPolicy.js';

// ── applyTrackRecordCalibration ───────────────────────────────────────────────

test('calibration reproduces the money-map spot checks', () => {
  // Fitted on 1,762 settled rows; the map must land within ~1pt of the
  // observed frequencies the money map measured on the big bands.
  const map = applyTrackRecordCalibration(0.859);
  assert.ok(Math.abs(map - 0.672) < 0.01, `0.859 -> ${map}, expected ~0.672`);

  const mid = applyTrackRecordCalibration(0.749);
  assert.ok(Math.abs(mid - 0.608) < 0.01, `0.749 -> ${mid}, expected ~0.608`);
});

test('calibration output is monotone non-decreasing in the input', () => {
  let prev = -1;
  for (let p = 0.02; p <= 0.98; p += 0.01) {
    const out = applyTrackRecordCalibration(p);
    assert.ok(out >= prev - 1e-9, `non-monotone at p=${p.toFixed(2)}: ${out} < ${prev}`);
    prev = out;
  }
});

test('calibration compresses high confidence toward reality (anti-overconfidence)', () => {
  // The whole point: 85% class picks must stop being displayed as near-certain.
  const out = applyTrackRecordCalibration(0.90);
  assert.ok(out < 0.75, `0.90 should drop below 0.75, got ${out}`);
  assert.ok(out > 0.60, `but must not collapse below 0.60, got ${out}`);
});

test('calibration output stays within sane bounds', () => {
  for (const p of [0, 0.001, 0.5, 0.999, 1]) {
    const out = applyTrackRecordCalibration(p);
    assert.ok(out >= 0 && out <= 1, `out of range for p=${p}: ${out}`);
  }
  // interior clamp guarantees [0.05, 0.90]
  assert.ok(applyTrackRecordCalibration(0.98) <= 0.90);
  assert.ok(applyTrackRecordCalibration(0.02) >= 0.05);
});

test('kill switch restores identity mapping', () => {
  process.env.DISABLE_TRACK_CALIBRATION = '1';
  try {
    assert.equal(isTrackCalibrationEnabled(), false);
    assert.equal(applyTrackRecordCalibration(0.859), 0.859);
    assert.equal(applyTrackRecordCalibration(0.51), 0.51);
  } finally {
    delete process.env.DISABLE_TRACK_CALIBRATION;
  }
  assert.equal(isTrackCalibrationEnabled(), true);
});

test('calibration metadata is recorded for future refits', () => {
  assert.equal(TRACK_CALIBRATION.method, 'logit-affine');
  assert.equal(TRACK_CALIBRATION.nFit, 1762);
  assert.ok(TRACK_CALIBRATION.cvBrier < TRACK_CALIBRATION.identityBrier,
    'CV Brier must beat identity — otherwise the map is not justified');
});

// ── buildMarketCandidates integration ────────────────────────────────────────

test('candidates carry calibrated modelProbability AND rawModelProbability', () => {
  const candidates = buildMarketCandidates({ homeWin: 0.85, draw: 0.10, awayWin: 0.05 }, {});
  const homeWin = candidates.find((c) => c.marketKey === 'home_win');
  assert.ok(homeWin, 'home_win candidate missing');
  assert.equal(homeWin.rawModelProbability, 0.85);
  assert.ok(homeWin.modelProbability < 0.85, 'calibrated prob must be lower for overconfident range');
  assert.ok(Math.abs(homeWin.modelProbability - applyTrackRecordCalibration(0.85)) < 1e-9);
});

test('low raw probabilities are preserved verbatim when calibration is off', () => {
  process.env.DISABLE_TRACK_CALIBRATION = '1';
  try {
    const candidates = buildMarketCandidates({ homeWin: 0.85 }, {});
    const homeWin = candidates.find((c) => c.marketKey === 'home_win');
    assert.equal(homeWin.modelProbability, 0.85);
    assert.equal(homeWin.rawModelProbability, 0.85);
  } finally {
    delete process.env.DISABLE_TRACK_CALIBRATION;
  }
});

// ── market quarantine (btts_no) ──────────────────────────────────────────────

function candidate(overrides = {}) {
  return {
    marketKey: 'btts_no',
    selection: 'BTTS No',
    modelProbability: 0.68,
    bookmakerOdds: 1.75,
    edge: 0.10,
    finalScore: 0.62,
    tacticalFitScore: 0.72,
    ...overrides,
  };
}

const strongContext = {
  features: {
    dataCompletenessScore: 0.82,
    matchChaosScore: 0.24,
    upsetRiskScore: 0.28,
    lineupCertaintyScore: 0.80,
  },
  script: { volatilityScore: 0.24 },
  confidence: { model: 'HIGH' },
  valueTier: { tier: 'STRONG', tierDescription: 'High confidence with fair odds' },
  challengeRecommendation: 'PASS',
};

test('btts_no is quarantined to SKIP even with a strong thesis', () => {
  const decision = evaluateRecommendation(candidate(), strongContext);
  assert.equal(decision.status, 'SKIP');
  assert.equal(decision.reasonCode, 'MARKET_QUARANTINE');
});

test('quarantine can be disabled with the kill switch', () => {
  process.env.DISABLE_MARKET_QUARANTINE = '1';
  try {
    const decision = evaluateRecommendation(candidate(), strongContext);
    assert.notEqual(decision.reasonCode, 'MARKET_QUARANTINE');
  } finally {
    delete process.env.DISABLE_MARKET_QUARANTINE;
  }
});

test('other markets are not quarantined', () => {
  const decision = evaluateRecommendation(candidate({ marketKey: 'home_win', selection: 'Home Win' }), strongContext);
  assert.notEqual(decision.reasonCode, 'MARKET_QUARANTINE');
});

// ── odds gate (< 1.80 publish gate) ──────────────────────────────────────────

test('BET at 1.80+ is downgraded to WATCH with ODDS_GATE_HIGH_PRICE', () => {
  const decision = evaluateRecommendation(
    candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 2.05 }),
    strongContext,
  );
  assert.equal(decision.status, 'WATCH');
  assert.equal(decision.reasonCode, 'ODDS_GATE_HIGH_PRICE');
});

test('BET below 1.80 still publishes', () => {
  const decision = evaluateRecommendation(
    candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 1.72 }),
    strongContext,
  );
  assert.equal(decision.status, 'BET');
});

test('odds gate boundary: exactly 1.80 is blocked, 1.79 passes', () => {
  const blocked = evaluateRecommendation(
    candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 1.80 }),
    strongContext,
  );
  assert.equal(blocked.reasonCode, 'ODDS_GATE_HIGH_PRICE');

  const allowed = evaluateRecommendation(
    candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 1.79 }),
    strongContext,
  );
  assert.equal(allowed.status, 'BET');
});

test('odds gate is tunable via ODDS_GATE_MAX', () => {
  process.env.ODDS_GATE_MAX = '1.50';
  try {
    const decision = evaluateRecommendation(
      candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 1.72 }),
      strongContext,
    );
    assert.equal(decision.reasonCode, 'ODDS_GATE_HIGH_PRICE');
  } finally {
    delete process.env.ODDS_GATE_MAX;
  }
});

test('odds gate kill switch restores unrestricted BET', () => {
  process.env.DISABLE_ODDS_GATE = '1';
  try {
    const decision = evaluateRecommendation(
      candidate({ marketKey: 'home_win', selection: 'Home Win', bookmakerOdds: 2.05 }),
      strongContext,
    );
    assert.equal(decision.status, 'BET');
  } finally {
    delete process.env.DISABLE_ODDS_GATE;
  }
});

test('safety fallback cannot smuggle a quarantined btts_no pick back in', () => {
  // findSafetyFallback evaluates via evaluateRecommendation, so quarantined
  // markets are excluded there too.
  const original = candidate({ marketKey: 'btts_no' });
  const alternatives = [
    candidate({ marketKey: 'btts_no', selection: 'BTTS No (alt)' }),
    candidate({ marketKey: 'under_35', selection: 'Under 3.5 Goals', modelProbability: 0.72, bookmakerOdds: 1.40 }),
  ];
  const fallback = findSafetyFallback(original, alternatives, strongContext);
  assert.ok(fallback, 'expected under_35 fallback');
  assert.equal(fallback.candidate.marketKey, 'under_35');
});
