import assert from 'assert';
import { oddsToImpliedProb, removeVig, computeClv, getOddsForPick } from '../src/storage/clvTracker.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ PASS ${name}`); }
  catch (err) { failed++; console.log(`✗ FAIL ${name}\n        ${err.message}`); }
}

console.log('\n── CLV (Closing Line Value) Tracker ───────────────────────────');

test('oddsToImpliedProb: 2.0 odds → 0.50 implied', () => {
  assert.strictEqual(oddsToImpliedProb(2.0), 0.5);
});

test('oddsToImpliedProb: 4.0 odds → 0.25 implied', () => {
  assert.strictEqual(oddsToImpliedProb(4.0), 0.25);
});

test('oddsToImpliedProb: returns null for invalid odds', () => {
  assert.strictEqual(oddsToImpliedProb(0), null);
  assert.strictEqual(oddsToImpliedProb(1), null);
  assert.strictEqual(oddsToImpliedProb(-2), null);
  assert.strictEqual(oddsToImpliedProb(null), null);
});

test('removeVig: 1.95/3.60/4.20 → fair probabilities sum to 1.0', () => {
  const fair = removeVig({ home: 1.95, draw: 3.60, away: 4.20 });
  const sum = fair.home + fair.draw + fair.away;
  assert.ok(Math.abs(sum - 1.0) < 0.001, `sum = ${sum}, expected 1.0`);
  assert.ok(fair.home > fair.draw && fair.draw > fair.away, 'home should be most likely');
});

test('removeVig: returns null for empty input', () => {
  assert.strictEqual(removeVig(null), null);
  assert.strictEqual(removeVig({}), null);
});

test('computeClv: positive CLV when odds shorten (1.95 → 1.85)', () => {
  // We bet at 1.95, closing was 1.85 → we got value (odds got shorter)
  const clv = computeClv(1.95, 1.85);
  assert.ok(clv.clv > 0, `CLV should be positive, got ${clv.clv}`);
  assert.ok(clv.openingImplied < clv.closingImplied, 'closing implied should be higher');
});

test('computeClv: negative CLV when odds drift (1.85 → 1.95)', () => {
  // We bet at 1.85, closing was 1.95 → we got bad price (odds got longer)
  const clv = computeClv(1.85, 1.95);
  assert.ok(clv.clv < 0, `CLV should be negative, got ${clv.clv}`);
});

test('computeClv: zero CLV when odds unchanged', () => {
  const clv = computeClv(2.0, 2.0);
  assert.strictEqual(clv.clv, 0);
});

test('computeClv: returns null for invalid inputs', () => {
  assert.strictEqual(computeClv(null, 2.0), null);
  assert.strictEqual(computeClv(2.0, null), null);
  assert.strictEqual(computeClv(1, 2.0), null); // odds must be > 1
  assert.strictEqual(computeClv(2.0, 0), null);
});

test('getOddsForPick: extracts correct odds for market key', () => {
  const odds = { home_win: 1.95, draw: 3.60, away_win: 4.20, over_25: 1.85, btts_yes: 1.75 };
  assert.strictEqual(getOddsForPick(odds, 'home_win'), 1.95);
  assert.strictEqual(getOddsForPick(odds, 'over_25'), 1.85);
  assert.strictEqual(getOddsForPick(odds, 'btts_yes'), 1.75);
});

test('getOddsForPick: case-insensitive', () => {
  const odds = { home_win: 1.95 };
  assert.strictEqual(getOddsForPick(odds, 'HOME_WIN'), 1.95);
  assert.strictEqual(getOddsForPick(odds, 'Home_Win'), 1.95);
});

test('getOddsForPick: returns null for missing market', () => {
  const odds = { home_win: 1.95 };
  assert.strictEqual(getOddsForPick(odds, 'over_25'), null);
  assert.strictEqual(getOddsForPick(null, 'home_win'), null);
});

test('CLV magnitude is reasonable for typical odds movements', () => {
  // A 5% odds movement (1.95 → 1.85) should produce ~2-3pp CLV
  const clv = computeClv(1.95, 1.85);
  assert.ok(clv.clv > 0.01 && clv.clv < 0.05, `CLV ${clv.clv} should be in [0.01, 0.05] range`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
