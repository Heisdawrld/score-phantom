import { clamp } from '../utils/math.js';

/**
 * Calibrate raw Poisson probabilities — shrink overconfident values and
 * apply script-based adjustments.
 */
export function calibrateProbabilities(rawProbs, scriptOutput) {
  const script = scriptOutput || {};
  const primary = script.primary || '';

  // Step 1: Shrink overconfident values
  function shrink(prob) {
    if (prob == null) return prob;
    if (prob > 0.82) return 0.78;
    if (prob > 0.75) return prob * 0.96;
    if (prob < 0.12) return prob * 1.08;
    return prob;
  }

  const cal = {};
  for (const [key, val] of Object.entries(rawProbs || {})) {
    cal[key] = typeof val === 'number' ? parseFloat(shrink(val).toFixed(4)) : val;
  }

  // Step 2: Apply script adjustments
  function adj(key, delta) {
    if (cal[key] == null) return;
    cal[key] = parseFloat(clamp(cal[key] + delta, 0.01, 0.99).toFixed(4));
  }

  if (primary === 'dominant_home_pressure') {
    adj('homeWin', +0.04);
    adj('homeOver15', +0.03);
    adj('homeOver05', +0.02);
    adj('awayWin', -0.03);
  } else if (primary === 'dominant_away_pressure') {
    adj('awayWin', +0.04);
    adj('awayOver15', +0.03);
    adj('awayOver05', +0.02);
    adj('homeWin', -0.03);
  } else if (primary === 'open_end_to_end') {
    adj('bttsYes', +0.05);
    adj('over25', +0.04);
    adj('over15', +0.03);
    adj('over35', +0.02);
    adj('bttsNo', -0.04);
    adj('under25', -0.03);
  } else if (primary === 'tight_low_event') {
    adj('bttsNo', +0.05);
    adj('under25', +0.04);
    adj('under15', +0.02);
    adj('bttsYes', -0.04);
    adj('over25', -0.03);
  } else if (primary === 'chaotic_unreliable') {
    // Find and reduce the top 3 most probable markets
    const marketEntries = Object.entries(cal)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1]);

    for (let i = 0; i < Math.min(3, marketEntries.length); i++) {
      const key = marketEntries[i][0];
      adj(key, -0.05);
    }
  }

  return cal;
}
