import assert from 'assert';
import { buildIsotonicCurve, applyIsotonicCalibration, brierScore, calibrationError } from '../src/probabilities/isotonicCalibration.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ PASS ${name}`); }
  catch (err) { failed++; console.log(`✗ FAIL ${name}\n        ${err.message}`); }
}

console.log('\n── Isotonic Calibration ───────────────────────────────────────');

test('Returns null for insufficient data (<50 samples)', () => {
  const data = Array(40).fill(0).map(() => ({ predicted: 0.5, actual: Math.random() > 0.5 ? 1 : 0 }));
  assert.strictEqual(buildIsotonicCurve(data), null);
});

test('Returns curve for sufficient data (≥50 samples)', () => {
  const data = [];
  for (let i = 0; i < 200; i++) {
    const p = Math.random();
    const actual = Math.random() < p ? 1 : 0;
    data.push({ predicted: p, actual });
  }
  const curve = buildIsotonicCurve(data);
  assert.ok(curve != null);
  assert.strictEqual(curve.length, 20);
});

test('Isotonic curve is monotonically non-decreasing (PAVA guarantee)', () => {
  // Generate data where true probability differs from predicted
  const data = [];
  for (let i = 0; i < 500; i++) {
    const predicted = Math.random();
    // True probability is sigmoid of predicted — non-linear
    const true_p = 1 / (1 + Math.exp(-5 * (predicted - 0.5)));
    const actual = Math.random() < true_p ? 1 : 0;
    data.push({ predicted, actual });
  }
  const curve = buildIsotonicCurve(data);
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].calibrated != null && curve[i-1].calibrated != null) {
      assert.ok(curve[i].calibrated >= curve[i-1].calibrated - 0.001,
        `Bin ${i} calibrated (${curve[i].calibrated}) < bin ${i-1} (${curve[i-1].calibrated}) — monotonicity violated`);
    }
  }
});

test('applyIsotonicCalibration returns input when curve is null', () => {
  assert.strictEqual(applyIsotonicCalibration(0.5, null), 0.5);
  assert.strictEqual(applyIsotonicCalibration(0.7, []), 0.7);
});

test('applyIsotonicCalibration returns bin value for in-range probability', () => {
  const curve = [
    { binStart: 0.0, binEnd: 0.5, calibrated: 0.3 },
    { binStart: 0.5, binEnd: 1.0, calibrated: 0.7 },
  ];
  assert.strictEqual(applyIsotonicCalibration(0.3, curve), 0.3);
  assert.strictEqual(applyIsotonicCalibration(0.6, curve), 0.7);
});

test('brierScore returns 0 for perfect predictions', () => {
  const data = [{ predicted: 1, actual: 1 }, { predicted: 0, actual: 0 }];
  assert.strictEqual(brierScore(data), 0);
});

test('brierScore returns 0.25 for random predictions', () => {
  // Always predict 0.5 → Brier = 0.25
  const data = [{ predicted: 0.5, actual: 1 }, { predicted: 0.5, actual: 0 }];
  assert.strictEqual(brierScore(data), 0.25);
});

test('calibrationError returns 0 for perfectly calibrated data', () => {
  // Construct data where observed frequency matches predicted in each bin
  const data = [];
  for (let bin = 0; bin < 10; bin++) {
    const p = (bin + 0.5) / 10;
    for (let i = 0; i < 20; i++) {
      data.push({ predicted: p, actual: Math.random() < p ? 1 : 0 });
    }
  }
  // With 200 samples spread evenly, calibration error should be small (allow statistical noise)
  const err = calibrationError(data, 10);
  assert.ok(err < 0.15, `calibration error ${err} should be < 0.15 for calibrated data`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
