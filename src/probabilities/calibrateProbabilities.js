import { clamp } from '../utils/math.js';

/**
 * Calibrate Poisson probabilities with script-based micro-adjustments.
 *
 * Rules (non-negotiable):
 * 1. NO shrink() — probabilities come from real Poisson math, don't cap them.
 * 2. After any adjustment, enforce: under_X = 1 - over_X for each line.
 * 3. Enforce monotonic ordering: over15 >= over25 >= over35.
 */
export function calibrateProbabilities(rawProbs, scriptOutput) {
  const script = scriptOutput || {};
  const primary = script.primary || '';

  // Work on a copy
  const cal = { ...rawProbs };

  // Helper: add a delta and clamp to [0.01, 0.99]
  function adj(key, delta) {
    if (cal[key] == null) return;
    cal[key] = parseFloat(clamp(cal[key] + delta, 0.01, 0.99).toFixed(4));
  }

  // Script-based micro-adjustments (tiny — ≤ 0.04 per field)
  if (primary === 'dominant_home_pressure') {
    adj('homeWin', +0.03);
    adj('awayWin', -0.02);
  } else if (primary === 'dominant_away_pressure') {
    adj('awayWin', +0.03);
    adj('homeWin', -0.02);
  } else if (primary === 'open_end_to_end') {
    adj('bttsYes',  +0.04);
    adj('over25',   +0.03);
    adj('over35',   +0.02);
    adj('bttsNo',   -0.03);
  } else if (primary === 'tight_low_event') {
    adj('bttsNo',   +0.04);
    adj('over25',   -0.03);
    adj('over15',   -0.02);
    adj('bttsYes',  -0.03);
  } else if (primary === 'chaotic_unreliable') {
    // Slight regression toward 50% for top probabilities
    for (const key of Object.keys(cal)) {
      if (typeof cal[key] === 'number' && cal[key] > 0.70) {
        cal[key] = parseFloat((cal[key] * 0.97).toFixed(4));
      }
    }
  }

  // ── Enforce complements (under = 1 - over) ───────────────────────────────
  const pairs = [
    ['over15',  'under15'],
    ['over25',  'under25'],
    ['over35',  'under35'],
    ['over_0_5', 'under_0_5'],
    ['bttsYes', 'bttsNo'],
  ];
  for (const [overKey, underKey] of pairs) {
    if (cal[overKey] != null) {
      cal[underKey] = parseFloat((1 - cal[overKey]).toFixed(4));
    }
  }

  // ── Enforce monotonic ordering for over lines ─────────────────────────────
  // over15 >= over25 >= over35
  if (cal.over25 != null && cal.over15 != null && cal.over15 < cal.over25) {
    cal.over15 = cal.over25;
    cal.under15 = parseFloat((1 - cal.over15).toFixed(4));
  }
  if (cal.over35 != null && cal.over25 != null && cal.over25 < cal.over35) {
    cal.over25 = cal.over35;
    cal.under25 = parseFloat((1 - cal.over25).toFixed(4));
  }

  // ── Clamp all to [0, 1] ───────────────────────────────────────────────────
  for (const key of Object.keys(cal)) {
    if (typeof cal[key] === 'number') {
      cal[key] = parseFloat(clamp(cal[key], 0, 1).toFixed(4));
    }
  }

  return cal;
}
