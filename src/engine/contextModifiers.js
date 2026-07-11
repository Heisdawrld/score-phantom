/**
 * Context Modifiers — Things a real analyst considers that the engine
 * currently ignores when evaluating probability.
 *
 * The engine currently uses probability as the sole driver for badges and picks.
 * But a real analyst considers:
 *   - Table position gap (2nd vs 15th → boost the better team)
 *   - Recent form trajectory (3 wins in a row, not just average)
 *   - Squad quality gap (xG table, player ratings)
 *   - Home/away split (some teams are terrible away)
 *   - Motivation differential (relegation fight vs mid-table)
 *
 * These are additive modifiers to probability AFTER calibration, capped at ±8%.
 *
 * This is Phase 2C of the Intelligent Analyst Engine.
 */

import { safeNum, clamp } from '../utils/math.js';

/**
 * Compute context-based probability modifiers.
 *
 * @param {object} featureVector — flattened features
 * @param {object} narrative — output of buildMatchNarrative
 * @returns {{ homeWinMod, awayWinMod, drawMod, over25Mod, under25Mod, bttsYesMod, bttsNoMod, modifiers: object[] }}
 */
export function computeContextModifiers(featureVector, narrative) {
  const fv = featureVector || {};
  const nar = narrative || {};
  const modifiers = [];

  let homeWinMod = 0;
  let awayWinMod = 0;
  let drawMod = 0;
  let over25Mod = 0;
  let under25Mod = 0;
  let bttsYesMod = 0;
  let bttsNoMod = 0;

  // ── 1. Table Position Gap ───────────────────────────────────────────────
  // A team 2nd in the table vs 15th has a structural advantage beyond what
  // form data captures. The table reflects sustained quality over 30+ games.
  const homeTablePos = safeNum(fv.homeTablePosition, null);
  const awayTablePos = safeNum(fv.awayTablePosition, null);

  if (homeTablePos != null && awayTablePos != null) {
    const posGap = awayTablePos - homeTablePos; // positive = home higher in table
    const absGap = Math.abs(posGap);

    if (absGap >= 8) {
      // Huge table gap (e.g., 2nd vs 15th) — strong modifier
      const mod = clamp(absGap * 0.006, 0, 0.06); // max 6%
      if (posGap > 0) {
        homeWinMod += mod;
        awayWinMod -= mod * 0.5;
      } else {
        awayWinMod += mod;
        homeWinMod -= mod * 0.5;
      }
      modifiers.push({
        name: 'table_position_gap',
        detail: `Position gap: ${absGap} places`,
        effect: posGap > 0 ? `Home +${(mod*100).toFixed(1)}%` : `Away +${(mod*100).toFixed(1)}%`,
      });
    } else if (absGap >= 4) {
      // Moderate table gap
      const mod = clamp(absGap * 0.004, 0, 0.03);
      if (posGap > 0) homeWinMod += mod;
      else awayWinMod += mod;
      modifiers.push({
        name: 'table_position_moderate_gap',
        detail: `Position gap: ${absGap} places`,
        effect: posGap > 0 ? `Home +${(mod*100).toFixed(1)}%` : `Away +${(mod*100).toFixed(1)}%`,
      });
    }
  }

  // ── 2. Recent Form Trajectory ───────────────────────────────────────────
  // Not just "average form" — trajectory matters. 3 wins in a row is different
  // from W-L-W-L-W even if the points are similar.
  const homeStreak = safeNum(fv.homeFormStreak, 0);  // positive = winning streak
  const awayStreak = safeNum(fv.awayFormStreak, 0);  // negative = losing streak

  if (homeStreak >= 3) {
    homeWinMod += 0.03;
    modifiers.push({ name: 'home_hot_streak', detail: `Home on ${homeStreak}-win streak`, effect: 'Home +3.0%' });
  } else if (homeStreak <= -3) {
    awayWinMod += 0.02;
    modifiers.push({ name: 'home_cold_streak', detail: `Home on ${Math.abs(homeStreak)}-loss streak`, effect: 'Away +2.0%' });
  }

  if (awayStreak >= 3) {
    awayWinMod += 0.03;
    modifiers.push({ name: 'away_hot_streak', detail: `Away on ${awayStreak}-win streak`, effect: 'Away +3.0%' });
  } else if (awayStreak <= -3) {
    homeWinMod += 0.02;
    modifiers.push({ name: 'away_cold_streak', detail: `Away on ${Math.abs(awayStreak)}-loss streak`, effect: 'Home +2.0%' });
  }

  // ── 3. Squad Quality Gap (xG Table / Player Ratings) ────────────────────
  // If BSD or xG table shows clear quality gap, boost the better team
  if (fv.hasXgTable) {
    const xgGap = safeNum(fv.xgTableGap, 0);
    const absXgGap = Math.abs(xgGap);
    if (absXgGap >= 8) {
      const mod = clamp(absXgGap * 0.003, 0, 0.04);
      if (xgGap > 0) homeWinMod += mod;
      else awayWinMod += mod;
      modifiers.push({
        name: 'xg_table_gap',
        detail: `xG table gap: ${xgGap > 0 ? '+' : ''}${xgGap.toFixed(1)}`,
        effect: xgGap > 0 ? `Home +${(mod*100).toFixed(1)}%` : `Away +${(mod*100).toFixed(1)}%`,
      });
    }
  }

  // Player rating gap (BSD)
  if (fv.hasDeepPlayerIntel || fv.hasPlayerStats) {
    const homeRating = safeNum(fv.homeAvgPlayerRating, safeNum(fv.homeCoreAvgRating, null));
    const awayRating = safeNum(fv.awayAvgPlayerRating, safeNum(fv.awayCoreAvgRating, null));
    if (homeRating != null && awayRating != null) {
      const ratingGap = homeRating - awayRating;
      if (Math.abs(ratingGap) >= 0.3) {
        const mod = clamp(Math.abs(ratingGap) * 0.02, 0, 0.03);
        if (ratingGap > 0) homeWinMod += mod;
        else awayWinMod += mod;
        modifiers.push({
          name: 'player_rating_gap',
          detail: `Rating gap: ${ratingGap > 0 ? '+' : ''}${ratingGap.toFixed(2)}`,
          effect: ratingGap > 0 ? `Home +${(mod*100).toFixed(1)}%` : `Away +${(mod*100).toFixed(1)}%`,
        });
      }
    }
  }

  // ── 4. Home/Away Split Quality ──────────────────────────────────────────
  // Not just generic home advantage — some teams are terrible away specifically
  const homeHomeWinRate = safeNum(fv.homeHomeWinRate, null);
  const awayAwayWinRate = safeNum(fv.awayAwayWinRate, null);

  if (homeHomeWinRate != null && homeHomeWinRate < 0.30) {
    // Home team barely wins at home — slight away boost
    awayWinMod += 0.02;
    modifiers.push({ name: 'home_poor_home_record', detail: `Home win rate at home: ${(homeHomeWinRate*100).toFixed(0)}%`, effect: 'Away +2.0%' });
  } else if (homeHomeWinRate != null && homeHomeWinRate > 0.65) {
    // Home team dominant at home
    homeWinMod += 0.02;
    modifiers.push({ name: 'home_strong_home_record', detail: `Home win rate at home: ${(homeHomeWinRate*100).toFixed(0)}%`, effect: 'Home +2.0%' });
  }

  if (awayAwayWinRate != null && awayAwayWinRate < 0.20) {
    // Away team terrible on the road
    homeWinMod += 0.03;
    modifiers.push({ name: 'away_poor_away_record', detail: `Away win rate away: ${(awayAwayWinRate*100).toFixed(0)}%`, effect: 'Home +3.0%' });
  } else if (awayAwayWinRate != null && awayAwayWinRate > 0.50) {
    // Away team strong on the road
    awayWinMod += 0.02;
    modifiers.push({ name: 'away_strong_away_record', detail: `Away win rate away: ${(awayAwayWinRate*100).toFixed(0)}%`, effect: 'Away +2.0%' });
  }

  // ── 5. Motivation Differential ──────────────────────────────────────────
  // Teams fighting relegation or for titles play harder than mid-table teams
  const homeMotivation = safeNum(fv.homeMotivationScore, 0.5);
  const awayMotivation = safeNum(fv.awayMotivationScore, 0.5);
  const motivationGap = homeMotivation - awayMotivation;

  if (Math.abs(motivationGap) >= 0.25) {
    const mod = clamp(Math.abs(motivationGap) * 0.04, 0, 0.04);
    if (motivationGap > 0) homeWinMod += mod;
    else awayWinMod += mod;
    modifiers.push({
      name: 'motivation_differential',
      detail: `Motivation: Home ${(homeMotivation*100).toFixed(0)}% vs Away ${(awayMotivation*100).toFixed(0)}%`,
      effect: motivationGap > 0 ? `Home +${(mod*100).toFixed(1)}%` : `Away +${(mod*100).toFixed(1)}%`,
    });

    // High motivation teams tend to play more aggressively → goals
    const higherMotivation = Math.max(homeMotivation, awayMotivation);
    if (higherMotivation > 0.75) {
      over25Mod += 0.02;
      bttsYesMod += 0.01;
    }
  }

  // ── 6. Narrative-Driven Goal Modifiers ──────────────────────────────────
  // If the narrative says high-event, boost Over/BTTS
  if (nar.goalExpectation === 'very_high') {
    over25Mod += 0.03;
    bttsYesMod += 0.02;
    under25Mod -= 0.03;
  } else if (nar.goalExpectation === 'low') {
    under25Mod += 0.03;
    bttsNoMod += 0.02;
    over25Mod -= 0.03;
  }

  // ── Cap all modifiers at ±8% ────────────────────────────────────────────
  const cap = (v) => clamp(v, -0.08, 0.08);
  homeWinMod = cap(homeWinMod);
  awayWinMod = cap(awayWinMod);
  drawMod = cap(drawMod);
  over25Mod = cap(over25Mod);
  under25Mod = cap(under25Mod);
  bttsYesMod = cap(bttsYesMod);
  bttsNoMod = cap(bttsNoMod);

  return {
    homeWinMod: parseFloat(homeWinMod.toFixed(4)),
    awayWinMod: parseFloat(awayWinMod.toFixed(4)),
    drawMod: parseFloat(drawMod.toFixed(4)),
    over25Mod: parseFloat(over25Mod.toFixed(4)),
    under25Mod: parseFloat(under25Mod.toFixed(4)),
    bttsYesMod: parseFloat(bttsYesMod.toFixed(4)),
    bttsNoMod: parseFloat(bttsNoMod.toFixed(4)),
    modifiers,
  };
}

/**
 * Apply context modifiers to calibrated probabilities.
 * Returns a new probabilities object (does not mutate input).
 *
 * @param {object} calibratedProbs — market probabilities
 * @param {object} contextMods — output of computeContextModifiers
 * @returns {object} adjusted probabilities
 */
export function applyContextModifiers(calibratedProbs, contextMods) {
  if (!calibratedProbs || !contextMods) return calibratedProbs;

  const cp = { ...calibratedProbs };

  cp.homeWin = clamp(safeNum(cp.homeWin, 0) + contextMods.homeWinMod, 0.02, 0.95);
  cp.awayWin = clamp(safeNum(cp.awayWin, 0) + contextMods.awayWinMod, 0.02, 0.95);
  cp.draw = clamp(safeNum(cp.draw, 0) + contextMods.drawMod, 0.02, 0.95);
  cp.over25 = clamp(safeNum(cp.over25, 0) + contextMods.over25Mod, 0.02, 0.95);
  cp.under25 = clamp(safeNum(cp.under25, 0) + contextMods.under25Mod, 0.02, 0.95);
  cp.over15 = Math.max(safeNum(cp.over15, 0), safeNum(cp.over25, 0)); // Over 1.5 >= Over 2.5
  cp.bttsYes = clamp(safeNum(cp.bttsYes, 0) + contextMods.bttsYesMod, 0.02, 0.95);
  cp.bttsNo = clamp(safeNum(cp.bttsNo, 0) + contextMods.bttsNoMod, 0.02, 0.95);

  // Normalize 1X2 to sum to 1.0
  const sum1x2 = cp.homeWin + cp.awayWin + cp.draw;
  if (sum1x2 > 0 && Math.abs(sum1x2 - 1.0) > 0.01) {
    const scale = 1.0 / sum1x2;
    cp.homeWin *= scale;
    cp.awayWin *= scale;
    cp.draw *= scale;
  }

  // Normalize Over/Under pairs
  if (cp.over25 + cp.under25 > 0) {
    const o25 = cp.over25;
    cp.under25 = 1 - o25;
  }
  if (cp.bttsYes + cp.bttsNo > 0) {
    cp.bttsNo = 1 - cp.bttsYes;
  }

  // Ensure monotonic ordering: over15 >= over25 >= over35
  cp.over35 = Math.min(safeNum(cp.over35, 0), safeNum(cp.over25, 0));
  cp.over15 = Math.max(safeNum(cp.over15, 0), safeNum(cp.over25, 0));
  cp.under35 = Math.max(safeNum(cp.under35, 0), safeNum(cp.under25, 0));

  return cp;
}
