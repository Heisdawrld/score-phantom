/**
 * ScorePhantom Engine Math Tests
 *
 * Property-based tests for the core probability engine.
 * Run: node tests/test-engine-math.mjs
 *
 * These tests protect against regressions when we modify:
 *   - poisson.js (score matrix, market probabilities)
 *   - calibrateProbabilities.js (blending)
 *   - ensemble.js (new — BSD CatBoost ensemble)
 *
 * NO external dependencies — uses Node's built-in assert.
 */

import assert from 'assert';
import { poissonProb, buildScoreMatrix, deriveMarketProbabilities } from '../src/probabilities/poisson.js';
import { calibrateProbabilities } from '../src/probabilities/calibrateProbabilities.js';

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`${PASS} ${name}`);
  } catch (err) {
    failed++;
    console.log(`${FAIL} ${name}`);
    console.log(`        ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`${PASS} ${name}`);
  } catch (err) {
    failed++;
    console.log(`${FAIL} ${name}`);
    console.log(`        ${err.message}`);
  }
}

// ── POISSON TESTS ────────────────────────────────────────────────────────────

console.log('\n── Poisson Distribution ─────────────────────────────────────────');

test('poissonProb(0, 0) = 1 (zero rate → zero events with certainty)', () => {
  assert.strictEqual(poissonProb(0, 0), 1);
});

test('poissonProb(0, k>0) = 0 (zero rate → no events)', () => {
  assert.strictEqual(poissonProb(0, 1), 0);
  assert.strictEqual(poissonProb(0, 5), 0);
});

test('poissonProb(lambda, k) is in [0, 1]', () => {
  for (const lambda of [0.5, 1.0, 1.5, 2.0, 3.0]) {
    for (let k = 0; k <= 10; k++) {
      const p = poissonProb(lambda, k);
      assert.ok(p >= 0 && p <= 1, `poissonProb(${lambda}, ${k}) = ${p} out of [0,1]`);
    }
  }
});

test('poissonProb distribution sums to ~1.0 (within float tolerance)', () => {
  for (const lambda of [0.5, 1.0, 1.5, 2.0, 3.0]) {
    let sum = 0;
    for (let k = 0; k <= 30; k++) sum += poissonProb(lambda, k);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `lambda=${lambda} sum=${sum} deviates from 1.0`);
  }
});

test('poissonProb peaks near the mean (lambda ≈ 1.5 peaks at k=1)', () => {
  const p0 = poissonProb(1.5, 0);
  const p1 = poissonProb(1.5, 1);
  const p2 = poissonProb(1.5, 2);
  const p3 = poissonProb(1.5, 3);
  assert.ok(p1 > p0, 'p(1) should be > p(0) for lambda=1.5');
  assert.ok(p1 > p2, 'p(1) should be > p(2) for lambda=1.5');
  assert.ok(p2 > p3, 'p(2) should be > p(3) for lambda=1.5');
});

// ── SCORE MATRIX TESTS ───────────────────────────────────────────────────────

console.log('\n── Score Matrix (Dixon-Coles) ───────────────────────────────────');

test('buildScoreMatrix returns a square matrix of size maxGoals+1', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  assert.strictEqual(m.length, 8, 'matrix should have 8 rows (0..7)');
  for (const row of m) {
    assert.strictEqual(row.length, 8, 'each row should have 8 cols');
  }
});

test('buildScoreMatrix sums to 1.0 (valid probability distribution)', () => {
  for (const [h, a] of [[1.5, 1.2], [0.8, 2.1], [2.5, 0.5], [1.0, 1.0], [3.0, 3.0]]) {
    const m = buildScoreMatrix(h, a, 7);
    let sum = 0;
    for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) sum += m[i][j];
    assert.ok(Math.abs(sum - 1.0) < 0.001, `matrix for (${h},${a}) sums to ${sum}, expected 1.0`);
  }
});

test('buildScoreMatrix all cells are in [0, 1]', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      assert.ok(m[i][j] >= 0 && m[i][j] <= 1, `cell[${i}][${j}] = ${m[i][j]} out of [0,1]`);
    }
  }
});

test('buildScoreMatrix: higher home lambda → higher homeWin probability', () => {
  const lowHome = buildScoreMatrix(0.5, 1.5, 7);
  const highHome = buildScoreMatrix(2.5, 1.5, 7);
  let lowHomeWin = 0, highHomeWin = 0;
  for (let h = 1; h <= 7; h++) for (let a = 0; a < h; a++) lowHomeWin += lowHome[h][a];
  for (let h = 1; h <= 7; h++) for (let a = 0; a < h; a++) highHomeWin += highHome[h][a];
  assert.ok(highHomeWin > lowHomeWin, `higher home lambda should increase homeWin (${highHomeWin} vs ${lowHomeWin})`);
});

// ── MARKET PROBABILITY TESTS ─────────────────────────────────────────────────

console.log('\n── Market Probabilities ────────────────────────────────────────');

test('deriveMarketProbabilities returns all expected market keys', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const probs = deriveMarketProbabilities(m);
  const required = ['homeWin', 'draw', 'awayWin', 'over05', 'over15', 'over25', 'over35',
                    'under15', 'under25', 'under35', 'bttsYes', 'bttsNo'];
  for (const key of required) {
    assert.ok(probs[key] != null, `missing market key: ${key}`);
  }
});

test('1X2 probabilities sum to ~1.0', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const p = deriveMarketProbabilities(m);
  const sum = p.homeWin + p.draw + p.awayWin;
  assert.ok(Math.abs(sum - 1.0) < 0.01, `1X2 sum = ${sum}, expected 1.0`);
});

test('Complement pairs sum to 1.0 (over/under, btts)', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const p = deriveMarketProbabilities(m);
  assert.ok(Math.abs((p.over15 + p.under15) - 1.0) < 0.001, `O1.5+U1.5 = ${p.over15 + p.under15}`);
  assert.ok(Math.abs((p.over25 + p.under25) - 1.0) < 0.001, `O2.5+U2.5 = ${p.over25 + p.under25}`);
  assert.ok(Math.abs((p.over35 + p.under35) - 1.0) < 0.001, `O3.5+U3.5 = ${p.over35 + p.under35}`);
  assert.ok(Math.abs((p.bttsYes + p.bttsNo) - 1.0) < 0.001, `BTTS yes+no = ${p.bttsYes + p.bttsNo}`);
});

test('Monotonic ordering: over15 >= over25 >= over35', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const p = deriveMarketProbabilities(m);
  assert.ok(p.over15 >= p.over25, `over15 (${p.over15}) should be >= over25 (${p.over25})`);
  assert.ok(p.over25 >= p.over35, `over25 (${p.over25}) should be >= over35 (${p.over35})`);
});

test('over05 is very high (>0.90) for reasonable xG', () => {
  // P(≥1 goal) with combined lambda 2.7 = 1 - e^-2.7 ≈ 0.9327
  // Dixon-Coles adjustment slightly modifies this, so 0.90 is a safe lower bound.
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const p = deriveMarketProbabilities(m);
  assert.ok(p.over05 > 0.90, `over05 = ${p.over05}, expected >0.90`);
});

test('All probabilities are in [0, 1]', () => {
  const m = buildScoreMatrix(1.5, 1.2, 7);
  const p = deriveMarketProbabilities(m);
  for (const [key, val] of Object.entries(p)) {
    assert.ok(val >= 0 && val <= 1, `${key} = ${val} out of [0,1]`);
  }
});

// ── CALIBRATION TESTS ────────────────────────────────────────────────────────

console.log('\n── Calibration ────────────────────────────────────────────────');

test('calibrateProbabilities with no anchors returns probabilities in [0,1]', () => {
  const raw = deriveMarketProbabilities(buildScoreMatrix(1.5, 1.2, 7));
  const cal = calibrateProbabilities(raw, { primary: 'open_end_to_end' }, null, null);
  for (const [key, val] of Object.entries(cal)) {
    if (typeof val === 'number') {
      assert.ok(val >= 0 && val <= 1, `${key} = ${val} out of [0,1] after calibration`);
    }
  }
});

test('calibrateProbabilities: bookmaker blend pulls model toward implied', () => {
  const raw = deriveMarketProbabilities(buildScoreMatrix(1.5, 1.2, 7));
  const originalHome = raw.homeWin;
  const impliedOdds = {
    impliedHomeProb: 0.70,  // bookmaker says 70% home win
    impliedAwayProb: 0.15,
    impliedOver25: 0.60,
    impliedOver15: 0.85,
    impliedBttsYes: 0.55,
  };
  const cal = calibrateProbabilities(raw, { primary: '' }, null, impliedOdds);
  // After blending 55/45, home should move toward 0.70
  assert.ok(cal.homeWin > originalHome, `homeWin should increase toward implied (was ${originalHome}, now ${cal.homeWin})`);
  assert.ok(cal.homeWin < 0.70, `homeWin should not exceed implied 0.70 (got ${cal.homeWin})`);
});

test('calibrateProbabilities: complement pairs preserved after calibration', () => {
  const raw = deriveMarketProbabilities(buildScoreMatrix(1.5, 1.2, 7));
  const cal = calibrateProbabilities(raw, { primary: 'tight_low_event' }, null, null);
  assert.ok(Math.abs((cal.over15 + cal.under15) - 1.0) < 0.01, `O1.5+U1.5 = ${cal.over15 + cal.under15}`);
  assert.ok(Math.abs((cal.over25 + cal.under25) - 1.0) < 0.01, `O2.5+U2.5 = ${cal.over25 + cal.under25}`);
  assert.ok(Math.abs((cal.bttsYes + cal.bttsNo) - 1.0) < 0.01, `BTTS = ${cal.bttsYes + cal.bttsNo}`);
});

test('calibrateProbabilities: 1X2 sums to ~1.0 after calibration', () => {
  const raw = deriveMarketProbabilities(buildScoreMatrix(1.5, 1.2, 7));
  const cal = calibrateProbabilities(raw, { primary: 'open_end_to_end' }, null, {
    impliedHomeProb: 0.55, impliedAwayProb: 0.25, impliedOver25: 0.55, impliedOver15: 0.85, impliedBttsYes: 0.55,
  });
  const sum = cal.homeWin + cal.draw + cal.awayWin;
  assert.ok(Math.abs(sum - 1.0) < 0.02, `1X2 sum = ${sum}, expected ~1.0`);
});

// ── EDGE CASES ───────────────────────────────────────────────────────────────

console.log('\n── Edge Cases ──────────────────────────────────────────────────');

test('buildScoreMatrix with very low lambdas (0.2, 0.2) still sums to 1.0', () => {
  const m = buildScoreMatrix(0.2, 0.2, 7);
  let sum = 0;
  for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) sum += m[i][j];
  assert.ok(Math.abs(sum - 1.0) < 0.001, `sum = ${sum}`);
});

test('buildScoreMatrix with very high lambdas (4.0, 4.0) still sums to 1.0', () => {
  const m = buildScoreMatrix(4.0, 4.0, 7);
  let sum = 0;
  for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) sum += m[i][j];
  assert.ok(Math.abs(sum - 1.0) < 0.05, `sum = ${sum} (high lambdas may truncate tail)`);
});

test('buildScoreMatrix with zero lambdas → 0-0 is certain', () => {
  const m = buildScoreMatrix(0, 0, 7);
  assert.ok(m[0][0] > 0.99, `0-0 probability = ${m[0][0]}, expected >0.99`);
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────

console.log('\n───────────────────────────────────────────────────────────────');
console.log(`\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
console.log('───────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error('\x1b[31mSome tests failed — fix before proceeding.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mAll tests passed — engine math is solid. Safe to proceed with ensemble integration.\x1b[0m');
}

// ── PER-LEAGUE RHO TESTS ─────────────────────────────────────────────────────

console.log('\n── Per-League Dixon-Coles Rho ──────────────────────────────────');

import { getLeagueRho } from '../src/probabilities/poisson.js';

test('getLeagueRho returns -0.10 for null/unknown league (backward compat)', () => {
  assert.strictEqual(getLeagueRho(null), -0.10);
  assert.strictEqual(getLeagueRho(''), -0.10);
  assert.strictEqual(getLeagueRho('some_random_league'), -0.10);
});

test('getLeagueRho returns -0.18 for Serie A (defensive, high draw rate)', () => {
  assert.strictEqual(getLeagueRho('serie_a'), -0.18);
});

test('getLeagueRho returns -0.07 for Eredivisie (attacking, low draw rate)', () => {
  assert.strictEqual(getLeagueRho('eredivisie'), -0.07);
});

test('getLeagueRho is case-insensitive', () => {
  assert.strictEqual(getLeagueRho('SERIE_A'), -0.18);
  assert.strictEqual(getLeagueRho('Serie A'), -0.18); // partial match
  assert.strictEqual(getLeagueRho('Italian Serie A'), -0.18);
});

test('getLeagueRho prefers learned overrides over hardcoded values', () => {
  const learned = { 'serie_a': -0.20 }; // we learned a better value
  assert.strictEqual(getLeagueRho('serie_a', learned), -0.20);
});

test('buildScoreMatrix with per-league rho still sums to 1.0', () => {
  for (const league of ['serie_a', 'eredivisie', 'premier_league', 'bundesliga']) {
    const m = buildScoreMatrix(1.5, 1.2, 7, { leagueKey: league });
    let sum = 0;
    for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) sum += m[i][j];
    assert.ok(Math.abs(sum - 1.0) < 0.001, `league=${league} sum=${sum}`);
  }
});

test('Defensive league (Serie A, rho=-0.18) produces MORE draws than attacking league (Eredivisie, rho=-0.07)', () => {
  const mSerie = buildScoreMatrix(1.3, 1.1, 7, { leagueKey: 'serie_a' });
  const mEredivisie = buildScoreMatrix(1.3, 1.1, 7, { leagueKey: 'eredivisie' });

  let serieDraws = 0, eredDraws = 0;
  for (let i = 0; i <= 7; i++) {
    serieDraws += mSerie[i][i];
    eredDraws += mEredivisie[i][i];
  }
  assert.ok(serieDraws > eredDraws,
    `Serie A draws (${serieDraws.toFixed(4)}) should be > Eredivisie draws (${eredDraws.toFixed(4)})`);
});

test('buildScoreMatrix backward compat: no opts → same as old hardcoded rho', () => {
  // Without opts, should use default -0.10
  const m1 = buildScoreMatrix(1.5, 1.2, 7);
  const m2 = buildScoreMatrix(1.5, 1.2, 7, {});
  assert.deepStrictEqual(m1, m2);
});

test('buildScoreMatrix with explicit leagueRho overrides leagueKey', () => {
  // Explicit rho takes priority
  const m1 = buildScoreMatrix(1.5, 1.2, 7, { leagueRho: -0.20 });
  const m2 = buildScoreMatrix(1.5, 1.2, 7, { leagueKey: 'serie_a' }); // would be -0.18
  // They should differ because -0.20 ≠ -0.18
  let diff = 0;
  for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) diff += Math.abs(m1[i][j] - m2[i][j]);
  assert.ok(diff > 0.001, `matrices should differ (sum of abs diffs = ${diff})`);
});
