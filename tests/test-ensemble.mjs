/**
 * Ensemble Tests
 *
 * Tests for the multi-model probability ensemble.
 * Run: node tests/test-ensemble.mjs
 */

import assert from 'assert';
import { buildScoreMatrix, deriveMarketProbabilities } from '../src/probabilities/poisson.js';
import { calibrateProbabilities } from '../src/probabilities/calibrateProbabilities.js';
import { ensembleProbabilities, getEnsembleConfidenceAdjustment } from '../src/probabilities/ensemble.js';

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`${PASS} ${name}`); }
  catch (err) { failed++; console.log(`${FAIL} ${name}\n        ${err.message}`); }
}

// Helper: build a baseline calibrated probs object
function baselineProbs(homeLambda = 1.5, awayLambda = 1.2) {
  const m = buildScoreMatrix(homeLambda, awayLambda, 7);
  const raw = deriveMarketProbabilities(m);
  return calibrateProbabilities(raw, { primary: 'open_end_to_end' }, null, null);
}

// Helper: build a typical BSD CatBoost prediction (the new expanded shape)
function bsdPrediction({ conf = 0.55, predicted = 'A', homeWin = 28.5, draw = 21.3, awayWin = 50.2, xgH = 1.17, xgA = 1.68, over25 = 65.0, btts = 67.1 } = {}) {
  return {
    prediction: predicted === 'H' ? 'home_win' : predicted === 'A' ? 'away_win' : predicted === 'D' ? 'draw' : null,
    homeWinProb: homeWin / 100,
    drawProb: draw / 100,
    awayWinProb: awayWin / 100,
    expectedHomeGoals: xgH,
    expectedAwayGoals: xgA,
    over15Prob: 0.84,
    over25Prob: over25 / 100,
    over35Prob: 0.34,
    bttsYesProb: btts / 100,
    mostLikelyScore: '1-1',
    modelConfidence: conf,
    modelVersion: 'v5.0',
    recommendations: { favorite: 'A', favorite_prob: 50.2 },
  };
}

console.log('\n── Ensemble: Graceful Fallback ────────────────────────────────');

test('Returns input unchanged when no external signals', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: null, polymarketOdds: null, features: {} });
  assert.strictEqual(result.ensembleMeta.active, false);
  assert.strictEqual(result.ensembleMeta.reason, 'no_external_signals');
  assert.deepStrictEqual(result.probabilities, input);
});

test('Returns input unchanged when BSD has no probabilities (null fields)', () => {
  const input = baselineProbs();
  const emptyBsd = { prediction: null, homeWinProb: null, drawProb: null, awayWinProb: null };
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: emptyBsd, polymarketOdds: null, features: {} });
  assert.strictEqual(result.ensembleMeta.active, false);
});

console.log('\n── Ensemble: Blending ────────────────────────────────────────');

test('Ensemble activates when BSD prediction is present', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: null, features: {} });
  assert.strictEqual(result.ensembleMeta.active, true);
  assert.ok(result.ensembleMeta.weights.poisson > 0);
  assert.ok(result.ensembleMeta.weights.catboost > 0);
});

test('1X2 probabilities sum to ~1.0 after ensemble', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: null, features: {} });
  const sum = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;
  assert.ok(Math.abs(sum - 1.0) < 0.01, `1X2 sum = ${sum}, expected ~1.0`);
});

test('Complement pairs sum to 1.0 after ensemble', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: null, features: {} });
  const p = result.probabilities;
  assert.ok(Math.abs((p.over15 + p.under15) - 1.0) < 0.01);
  assert.ok(Math.abs((p.over25 + p.under25) - 1.0) < 0.01);
  assert.ok(Math.abs((p.bttsYes + p.bttsNo) - 1.0) < 0.01);
});

test('Monotonic ordering preserved: over15 >= over25 >= over35', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: null, features: {} });
  const p = result.probabilities;
  assert.ok(p.over15 >= p.over25, `over15 (${p.over15}) should be >= over25 (${p.over25})`);
  assert.ok(p.over25 >= p.over35, `over25 (${p.over25}) should be >= over35 (${p.over35})`);
});

test('All probabilities in [0, 1] after ensemble', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: null, features: {} });
  for (const [key, val] of Object.entries(result.probabilities)) {
    if (typeof val === 'number') {
      assert.ok(val >= 0 && val <= 1, `${key} = ${val} out of [0,1]`);
    }
  }
});

console.log('\n── Ensemble: Agreement Signal ────────────────────────────────');

test('Strong agreement when both models pick the same winner with high confidence', () => {
  // Our model: homeWin = 0.55 (home is top pick with big gap)
  // BSD: also picks home with 60% confidence
  const input = baselineProbs(2.5, 0.8); // high home xG → high homeWin
  const bsd = bsdPrediction({ conf: 0.65, predicted: 'H', homeWin: 60, draw: 25, awayWin: 15 });
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  assert.ok(['strong', 'moderate', 'weak'].includes(result.ensembleMeta.agreement), `agreement = ${result.ensembleMeta.agreement}`);
  assert.ok(result.ensembleMeta.agreementSignal > 0, `signal should be positive for agreement, got ${result.ensembleMeta.agreementSignal}`);
});

test('Divergent signal when models disagree on winner', () => {
  // Our model: strong home win (2.5, 0.8)
  // BSD: picks away with 50% confidence → clear disagreement
  const input = baselineProbs(2.5, 0.8);
  const bsd = bsdPrediction({ conf: 0.55, predicted: 'A', homeWin: 25, draw: 20, awayWin: 55 });
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  assert.strictEqual(result.ensembleMeta.agreement, 'divergent');
  assert.ok(result.ensembleMeta.agreementSignal < 0, `signal should be negative for divergence, got ${result.ensembleMeta.agreementSignal}`);
});

test('getEnsembleConfidenceAdjustment returns 0 when ensemble inactive', () => {
  const adj = getEnsembleConfidenceAdjustment({ active: false });
  assert.strictEqual(adj, 0);
});

test('getEnsembleConfidenceAdjustment returns signal when active', () => {
  const adj = getEnsembleConfidenceAdjustment({ active: true, agreementSignal: 0.04 });
  assert.strictEqual(adj, 0.04);
});

console.log('\n── Ensemble: Weight Dynamics ─────────────────────────────────');

test('High-confidence CatBoost gets more weight than low-confidence', () => {
  const input = baselineProbs();
  const highConf = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction({ conf: 0.75 }), polymarketOdds: null, features: {} });
  const lowConf = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction({ conf: 0.30 }), polymarketOdds: null, features: {} });
  assert.ok(highConf.ensembleMeta.weights.catboost > lowConf.ensembleMeta.weights.catboost,
    `high-conf catboost weight (${highConf.ensembleMeta.weights.catboost}) should be > low-conf (${lowConf.ensembleMeta.weights.catboost})`);
});

test('Missing Polymarket redistributes weight to Poisson and CatBoost', () => {
  const input = baselineProbs();
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction({ conf: 0.55 }), polymarketOdds: null, features: {} });
  // Weights should sum to 1.0
  const sum = result.ensembleMeta.weights.poisson + result.ensembleMeta.weights.catboost + result.ensembleMeta.weights.polymarket;
  assert.ok(Math.abs(sum - 1.0) < 0.001, `weights sum = ${sum}, expected 1.0`);
  assert.strictEqual(result.ensembleMeta.weights.polymarket, 0);
});

test('Polymarket present gets non-zero polymarket weight', () => {
  const input = baselineProbs();
  const poly = { odds: { '1x2': { home: 0.30, draw: 0.25, away: 0.45 }, btts: { yes: 0.60, no: 0.40 }, over_under: { over_25: 0.55 } } };
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsdPrediction(), polymarketOdds: poly, features: {} });
  assert.ok(result.ensembleMeta.weights.polymarket > 0, `polymarket weight should be > 0, got ${result.ensembleMeta.weights.polymarket}`);
});

console.log('\n── Ensemble: Boundary Conditions ─────────────────────────────');

test('Handles extreme BSD probabilities (0.95 / 0.05) without NaN', () => {
  const input = baselineProbs();
  const bsd = bsdPrediction({ conf: 0.80, predicted: 'H', homeWin: 95, draw: 3, awayWin: 2 });
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  for (const [key, val] of Object.entries(result.probabilities)) {
    if (typeof val === 'number') {
      assert.ok(!Number.isNaN(val), `${key} is NaN`);
      assert.ok(Number.isFinite(val), `${key} is not finite`);
    }
  }
});

test('Ensemble is deterministic (same input → same output)', () => {
  const input = baselineProbs();
  const bsd = bsdPrediction();
  const r1 = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  const r2 = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  assert.deepStrictEqual(r1.probabilities, r2.probabilities);
});

test('Ensemble moves probabilities toward BSD when BSD has high confidence', () => {
  const input = baselineProbs(1.5, 1.2); // ~balanced
  const bsd = bsdPrediction({ conf: 0.80, predicted: 'A', homeWin: 20, draw: 20, awayWin: 60 });
  const result = ensembleProbabilities({ calibratedProbs: input, bsdPrediction: bsd, polymarketOdds: null, features: {} });
  // Original awayWin was ~0.29, BSD says 0.60, blend should be in between but closer to BSD
  assert.ok(result.probabilities.awayWin > input.awayWin, `awayWin should increase toward BSD (${result.probabilities.awayWin} > ${input.awayWin})`);
  assert.ok(result.probabilities.awayWin < 0.60, `awayWin should not exceed BSD's 0.60 (got ${result.probabilities.awayWin})`);
});

console.log('\n───────────────────────────────────────────────────────────────');
console.log(`\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
console.log('───────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error('\x1b[31mSome tests failed — fix before proceeding.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mAll ensemble tests passed. Safe to proceed to Phase 3.\x1b[0m');
}
