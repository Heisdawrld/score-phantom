/**
 * trackRecordCalibration.js — empirical probability recalibration (Phase 2, money-map item 1).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The Phase 1 money map (1,762 settled outcomes, prod track record) proved the
 * engine is SYSTEMATICALLY OVERCONFIDENT, and the gap GROWS with confidence:
 *
 *   predicted 51.2% → actual 50.0%  (n=6)
 *   predicted 58.5% → actual 43.5%  (n=23)
 *   predicted 62.8% → actual 52.9%  (n=153)
 *   predicted 67.6% → actual 57.4%  (n=265)
 *   predicted 74.9% → actual 60.5%  (n=709)
 *   predicted 85.9% → actual 67.5%  (n=609)   ← where picks concentrate
 *
 * When the model believes +16pt edges that do not exist, the value detector
 * publishes −EV bets. Priced-era ROI was −12.8% (−14.62u / 114.4u over 70 bets).
 *
 * ── The map ────────────────────────────────────────────────────────────────
 * Fitted 2026-09-06 on settled_outcomes.csv (see
 * scripts/fit_calibration.py, results in download/money-map/calibration_fit.json).
 * Two candidates were compared with 5-fold CV on Brier score:
 *
 *   isotonic (PAV):        CV Brier 0.23453
 *   logit-affine (a,b):    CV Brier 0.23399  ← selected (smoother, 2 params)
 *   identity (no fix):     Brier   0.25600
 *
 * Map: p_cal = sigmoid(a · logit(p) + b), a = 0.40, b = 0.00.
 * Spot checks against the money map's big bands:
 *   0.859 → 0.672 (actual 67.5% ✓)   0.749 → 0.608 (actual 60.5% ✓)
 *   0.676 → 0.573 (actual 57.4% ✓)
 *
 * ── Where it applies ───────────────────────────────────────────────────────
 * buildMarketCandidates() — the exact boundary between MODEL logic (xG, Poisson,
 * script, ensemble, bookmaker blend, context modifiers) and SELECTION logic
 * (edge, EV, pruning, floors, policy). Everything downstream sees honest
 * probabilities; the raw scale is preserved on candidate.rawModelProbability
 * and persisted to predictions_v2.best_pick_raw_probability so future refits
 * never compound calibration on calibration.
 *
 * Kill switch: DISABLE_TRACK_CALIBRATION=1 restores raw probabilities.
 */
import { clamp } from '../utils/math.js';

export const TRACK_CALIBRATION = Object.freeze({
  version: 'trc-v1-2026-09',
  fittedAt: '2026-09-06',
  method: 'logit-affine',
  a: 0.40,
  b: 0.00,
  nFit: 1762,
  cvBrier: 0.23399,
  identityBrier: 0.256,
});

const LOGIT_A = TRACK_CALIBRATION.a;
const LOGIT_B = TRACK_CALIBRATION.b;
// Input guard: logit() is unstable at the extremes; engine probabilities beyond
// these bounds are numerical noise. Output guard: affine can never exceed these
// at a=0.4 anyway, but keep the map future-proof if a/b are refitted.
const INPUT_MIN = 0.02;
const INPUT_MAX = 0.98;
const OUTPUT_MIN = 0.05;
const OUTPUT_MAX = 0.90;

function logit(p) {
  const v = clamp(p, INPUT_MIN, INPUT_MAX);
  return Math.log(v / (1 - v));
}

export function isTrackCalibrationEnabled() {
  return process.env.DISABLE_TRACK_CALIBRATION !== '1';
}

/**
 * Map a raw model probability to its empirically calibrated (effective) value.
 * Pure function — safe to call on every candidate.
 *
 * @param {number} p - raw model probability in [0, 1]
 * @returns {number} calibrated probability in [OUTPUT_MIN, OUTPUT_MAX]
 */
export function applyTrackRecordCalibration(p) {
  const raw = Number(p);
  if (!Number.isFinite(raw)) return raw;
  if (raw <= 0 || raw >= 1) return clamp(raw, 0, 1);
  if (!isTrackCalibrationEnabled()) return raw;

  const calibrated = 1 / (1 + Math.exp(-(LOGIT_A * logit(raw) + LOGIT_B)));
  return parseFloat(clamp(calibrated, OUTPUT_MIN, OUTPUT_MAX).toFixed(4));
}
