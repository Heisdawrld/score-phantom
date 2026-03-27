import { safeNum, clamp } from '../utils/math.js';
import { computeStatBoosts } from './computeStatBoosts.js';

const LEAGUE_AVG = 1.35;          // average goals per team per game across top leagues
const HOME_ADVANTAGE_BOOST = 1.10;

/**
 * Estimate expected goals using attack/defense strength ratios.
 *
 * Formula:
 *   home_xg = (homeAvgScored / LEAGUE_AVG) * (awayAvgConceded / LEAGUE_AVG) * LEAGUE_AVG * HOME_BOOST
 *   away_xg = (awayAvgScored / LEAGUE_AVG) * (homeAvgConceded / LEAGUE_AVG) * LEAGUE_AVG
 *
 * Hard caps: per-team 0.2–2.5, total 0.8–4.5.
 * Thin-data dampening: regress toward mean when < 3 matches available.
 */
export function estimateExpectedGoals(featureVector, scriptOutput) {
  const fv = featureVector || {};
  const script = scriptOutput || {};

  // Raw goal averages
  const homeAvgScored = safeNum(fv.homeAvgScored, LEAGUE_AVG);
  const awayAvgScored = safeNum(fv.awayAvgScored, LEAGUE_AVG * 0.9);
  const homeAvgConceded = safeNum(fv.homeAvgConceded, LEAGUE_AVG);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, LEAGUE_AVG);

  // Strength ratios (1.0 = league average)
  const homeAttackRatio = clamp(homeAvgScored / LEAGUE_AVG, 0.3, 2.2);
  const awayAttackRatio = clamp(awayAvgScored / LEAGUE_AVG, 0.3, 2.2);
  const homeDefRatio    = clamp(homeAvgConceded / LEAGUE_AVG, 0.3, 1.8); // weakness: higher = leakier
  const awayDefRatio    = clamp(awayAvgConceded / LEAGUE_AVG, 0.3, 1.8);

  // Core xG
  let homeXg = homeAttackRatio * awayDefRatio * LEAGUE_AVG * HOME_ADVANTAGE_BOOST;
  let awayXg = awayAttackRatio * homeDefRatio * LEAGUE_AVG;

  // Thin-data dampening — regress toward mean when sample is small
  const homeMatches = safeNum(fv.h2hMatchesAvailable ?? fv.homeMatchesAvailable, 5);
  const awayMatches = safeNum(fv.awayMatchesAvailable, 5);
  const minMatches  = Math.min(homeMatches, awayMatches);

  if (minMatches < 3) {
    // Extreme thin data — force to league mean
    homeXg = homeXg * 0.5 + LEAGUE_AVG * HOME_ADVANTAGE_BOOST * 0.5;
    awayXg = awayXg * 0.5 + LEAGUE_AVG * 0.5;
  } else if (minMatches < 5) {
    // Partial thin data — gentle regression
    homeXg = homeXg * 0.75 + LEAGUE_AVG * HOME_ADVANTAGE_BOOST * 0.25;
    awayXg = awayXg * 0.75 + LEAGUE_AVG * 0.25;
  }

  // Venue anchoring (split stats) — use when available
  const homeHomeGoalsFor     = fv.homeHomeGoalsFor;
  const awayAwayGoalsFor     = fv.awayAwayGoalsFor;
  const awayAwayGoalsAgainst = fv.awayAwayGoalsAgainst;
  const homeHomeGoalsAgainst = fv.homeHomeGoalsAgainst;

  if (homeHomeGoalsFor != null && awayAwayGoalsAgainst != null) {
    const venueHome = homeHomeGoalsFor * 0.6 + awayAwayGoalsAgainst * 0.4;
    homeXg = homeXg * 0.65 + venueHome * 0.35;
  } else if (homeHomeGoalsFor != null) {
    homeXg = homeXg * 0.75 + homeHomeGoalsFor * 0.25;
  }

  if (awayAwayGoalsFor != null && homeHomeGoalsAgainst != null) {
    const venueAway = awayAwayGoalsFor * 0.6 + homeHomeGoalsAgainst * 0.4;
    awayXg = awayXg * 0.65 + venueAway * 0.35;
  } else if (awayAwayGoalsFor != null) {
    awayXg = awayXg * 0.75 + awayAwayGoalsFor * 0.25;
  }

  // Script-level micro-adjustments (tiny — script should not drive xG explosions)
  const primary = script.primary || '';
  if (primary === 'open_end_to_end') {
    homeXg += 0.05; awayXg += 0.05;
  } else if (primary === 'tight_low_event') {
    homeXg -= 0.08; awayXg -= 0.08;
  } else if (primary === 'dominant_home_pressure') {
    homeXg += 0.05; awayXg -= 0.04;
  } else if (primary === 'dominant_away_pressure') {
    awayXg += 0.05; homeXg -= 0.04;
  } else if (primary === 'chaotic_unreliable') {
    homeXg = homeXg * 0.9 + LEAGUE_AVG * HOME_ADVANTAGE_BOOST * 0.1;
    awayXg = awayXg * 0.9 + LEAGUE_AVG * 0.1;
  }

  // ── Stat-profile boosts (pressure, efficiency, defensive leakiness) ─────────
  // Applied AFTER base xG and script micro-adjustments, BEFORE hard caps.
  // Each boost is ±5–20% max. Thin-data situations auto-scale to near zero.
  const { homeXgBoost, awayXgBoost, _debug: statDebug } = computeStatBoosts(fv);
  if (homeXgBoost !== 0 || awayXgBoost !== 0) {
    console.log(
      `[xG] stat boosts → home: ${(homeXgBoost * 100).toFixed(1)}%, away: ${(awayXgBoost * 100).toFixed(1)}%`,
      statDebug
    );
    homeXg = homeXg * (1 + homeXgBoost);
    awayXg = awayXg * (1 + awayXgBoost);
  }

  // Per-team hard cap: 0.2 – 2.5
  homeXg = clamp(homeXg, 0.2, 2.5);
  awayXg = clamp(awayXg, 0.2, 2.5);

  // Total hard cap: 0.8 – 4.5
  const rawTotal = homeXg + awayXg;
  if (rawTotal > 4.5) {
    const scale = 4.5 / rawTotal;
    homeXg *= scale;
    awayXg *= scale;
  }
  if (rawTotal < 0.8) {
    const scale = 0.8 / rawTotal;
    homeXg *= scale;
    awayXg *= scale;
  }

  return {
    homeExpectedGoals: parseFloat(homeXg.toFixed(3)),
    awayExpectedGoals: parseFloat(awayXg.toFixed(3)),
    totalExpectedGoals: parseFloat((homeXg + awayXg).toFixed(3)),
  };
}
