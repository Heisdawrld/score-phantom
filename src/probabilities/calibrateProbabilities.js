import { clamp } from '../utils/math.js';

/**
 * calibrateProbabilities.js
 *
 * Calibrate Poisson probabilities with market anchors and script-based micro-adjustments.
 *
 * v2: Uses bookmaker odds blending as the only external calibration anchor.
 *
 * The bookmaker's implied probabilities are the sharpest baseline available.
 * They aggregate millions of dollars of sharp money and sophisticated models.
 * Ignoring them was the root cause of the "all predictions are under_35" bug.
 *
 * New calibration layers:
 * 1. Bookmaker 1X2 blending (55% model / 45% bookmaker)
 * 2. Bookmaker O/U blending (65% model / 35% bookmaker for over lines)
 * 3. Bookmaker BTTS blending (60% model / 40% bookmaker)
 * 4. Script-based micro-adjustments (±0.02-0.04)
 * 5. Complement enforcement, monotonic ordering
 *
 * Rules (non-negotiable):
 * 1. NO shrink() — probabilities come from real Poisson math, don't cap them.
 * 2. After any adjustment, enforce: under_X = 1 - over_X for each line.
 * 3. Enforce monotonic ordering: over15 >= over25 >= over35.
 */
export function calibrateProbabilities(rawProbs, scriptOutput, _unusedMarketContext = null, impliedOdds = null) {
  const script = scriptOutput || {};
  const primary = script.primary || '';

  // Work on a copy
  const cal = { ...rawProbs };

  // Helper: add a delta and clamp to [0.01, 0.99]
  function adj(key, delta) {
    if (cal[key] == null) return;
    cal[key] = parseFloat(clamp(cal[key] + delta, 0.01, 0.99).toFixed(4));
  }

  // ── LAYER 1: Bookmaker Odds Blending (STRONGEST ANCHOR) ──────────────────
  // Bookmaker implied probabilities are the sharpest baseline available.
  // They represent the consensus of millions of dollars of sharp money.
  //
  // Blend weights:
  // - 1X2: 55% model / 45% bookmaker — bookmaker is very accurate for match outcomes
  // - Over/Under: 65% model / 35% bookmaker — model has more granular total goals info
  // - BTTS: 60% model / 40% bookmaker — moderate anchor
  //
  // If the model says homeWin=16% but the bookmaker says 55%, the blend gives:
  // 0.55 * 0.16 + 0.45 * 0.55 = 0.088 + 0.2475 = 33.5%
  // This is MUCH more reasonable than 16%, and subsequent layers (Polymarket, script)
  // will further refine it.

  if (impliedOdds) {
    const impHome = impliedOdds.impliedHomeProb;
    const impAway = impliedOdds.impliedAwayProb;
    const impOver25 = impliedOdds.impliedOver25;
    const impOver15 = impliedOdds.impliedOver15;
    const impBttsYes = impliedOdds.impliedBttsYes;

    // 1X2 blending
    if (impHome != null && impAway != null && cal.homeWin != null && cal.awayWin != null) {
      const impDraw = Math.max(0.01, 1 - impHome - impAway);
      const oldHome = cal.homeWin;
      const oldDraw = cal.draw || (1 - cal.homeWin - cal.awayWin);
      const oldAway = cal.awayWin;

      cal.homeWin = parseFloat(((oldHome * 0.55) + (impHome * 0.45)).toFixed(4));
      cal.draw = parseFloat(((oldDraw * 0.55) + (impDraw * 0.45)).toFixed(4));
      cal.awayWin = parseFloat(((oldAway * 0.55) + (impAway * 0.45)).toFixed(4));

      console.log(`[calibrate] Bookmaker 1X2 blend: H ${oldHome.toFixed(3)}→${cal.homeWin.toFixed(3)} D ${oldDraw.toFixed(3)}→${cal.draw.toFixed(3)} A ${oldAway.toFixed(3)}→${cal.awayWin.toFixed(3)} (implied: H=${(impHome*100).toFixed(1)}% D=${(impDraw*100).toFixed(1)}% A=${(impAway*100).toFixed(1)}%)`);
    }

    // Over/Under blending
    if (impOver25 != null && cal.over25 != null) {
      const oldOver25 = cal.over25;
      cal.over25 = parseFloat(((oldOver25 * 0.65) + (impOver25 * 0.35)).toFixed(4));
      cal.under25 = parseFloat((1 - cal.over25).toFixed(4));
      console.log(`[calibrate] Bookmaker O2.5 blend: ${oldOver25.toFixed(3)}→${cal.over25.toFixed(3)} (implied: ${(impOver25*100).toFixed(1)}%)`);
    }

    if (impOver15 != null && cal.over15 != null) {
      const oldOver15 = cal.over15;
      cal.over15 = parseFloat(((oldOver15 * 0.65) + (impOver15 * 0.35)).toFixed(4));
      cal.under15 = parseFloat((1 - cal.over15).toFixed(4));
    }

    // BTTS blending
    if (impBttsYes != null && cal.bttsYes != null) {
      const oldBtts = cal.bttsYes;
      cal.bttsYes = parseFloat(((oldBtts * 0.60) + (impBttsYes * 0.40)).toFixed(4));
      cal.bttsNo = parseFloat((1 - cal.bttsYes).toFixed(4));
      console.log(`[calibrate] Bookmaker BTTS blend: ${oldBtts.toFixed(3)}→${cal.bttsYes.toFixed(3)} (implied: ${(impBttsYes*100).toFixed(1)}%)`);
    }
  }

  // ── LAYER 2: Script-based micro-adjustments (tiny — ≤ 0.04 per field) ────
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
    ['over05',  'under05'],
    ['over15',  'under15'],
    ['over25',  'under25'],
    ['over35',  'under35'],
    ['bttsYes', 'bttsNo'],
    ['homeOver05', 'homeUnder05'],
    ['awayOver05', 'awayUnder05'],
    ['homeOver15', 'homeUnder15'],
    ['awayOver15', 'awayUnder15'],
    ['homeOver25', 'homeUnder25'],
    ['awayOver25', 'awayUnder25'],
    ['homeOver35', 'homeUnder35'],
    ['awayOver35', 'awayUnder35']
  ];
  for (const [overKey, underKey] of pairs) {
    if (cal[overKey] != null) {
      cal[underKey] = parseFloat((1 - cal[overKey]).toFixed(4));
    }
  }

  // ── Over 1.5 confidence dampening ─────────────────────────────────────
  // Over 1.5 is structurally overconfident in low-scoring matches.
  if (cal.over15 != null) {
    if (cal.over15 > 0.90) cal.over15 = 0.90;
    if (cal.over25 != null && cal.over25 < 0.40) {
      const df = 0.84 + (cal.over25 / 0.40) * 0.10;
      cal.over15 = parseFloat((cal.over15 * df).toFixed(4));
    }
    if (primary === 'tight_low_event' && cal.over15 > 0.72) {
      cal.over15 = parseFloat((cal.over15 * 0.87).toFixed(4));
    }
    cal.under15 = parseFloat((1 - cal.over15).toFixed(4));
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

  // ── Enforce 1X2 sum ≈ 1.0 ───────────────────────────────────────────────
  if (cal.homeWin != null && cal.draw != null && cal.awayWin != null) {
    const sum = cal.homeWin + cal.draw + cal.awayWin;
    if (Math.abs(sum - 1.0) > 0.01) {
      const scale = 1.0 / sum;
      cal.homeWin = parseFloat(clamp(cal.homeWin * scale, 0.01, 0.99).toFixed(4));
      cal.draw = parseFloat(clamp(cal.draw * scale, 0.01, 0.99).toFixed(4));
      cal.awayWin = parseFloat(clamp(cal.awayWin * scale, 0.01, 0.99).toFixed(4));
    }
  }

  // ── Clamp all to [0, 1] ───────────────────────────────────────────────────
  for (const key of Object.keys(cal)) {
    if (typeof cal[key] === 'number') {
      cal[key] = parseFloat(clamp(cal[key], 0, 1).toFixed(4));
    }
  }

  return cal;
}
