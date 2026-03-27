import { safeNum, clamp } from '../utils/math.js';
import { computeFormDerivedBoosts } from './computeFormDerivedBoosts.js';
import { computePremiumStatsBoosts } from './computePremiumStatsBoosts.js';

const LEAGUE_AVG = 1.35;          // average goals per team per game across top leagues
const HOME_ADVANTAGE_BOOST = 1.10;

/**
 * Estimate expected goals using attack/defense strength ratios.
 *
 * 3-layer xG estimation:
 *   Layer 1 — Base xG: team strength ratios, home advantage, thin-data dampening, venue anchoring
 *   Layer 2 — Form-derived modifier: ±0–20% from goal rates, BTTS, clean sheets
 *   Layer 3 — Premium stats modifier: NOT ACTIVE (shots/possession — requires API upgrade)
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

  // Snapshot Layer 1 (base) xG before form-derived boosts —
  // returned so the engine can compare L1 vs L1+L2 probabilities.
  const layer1HomeXg = homeXg;
  const layer1AwayXg = awayXg;

  // ── Layer 2: Form-derived modifier ───────────────────────────────────────
  // Applies small multiplicative adjustments (±0–20%) based on form outcomes:
  // goals scored/conceded rates, BTTS rate, clean sheet rate, scoring consistency.
  // Always available for teams with ≥3 form matches.
  const { homeXgBoost: formHomeBoost, awayXgBoost: formAwayBoost, _debug: formDebug } =
    computeFormDerivedBoosts(fv);
  if (formHomeBoost !== 0 || formAwayBoost !== 0) {
    console.log(
      `[xG] layer2 form boosts → home: ${(formHomeBoost * 100).toFixed(1)}%, away: ${(formAwayBoost * 100).toFixed(1)}%`,
      formDebug
    );
    homeXg = homeXg * (1 + formHomeBoost);
    awayXg = awayXg * (1 + formAwayBoost);
  }

  // ── Layer 3: Premium stats modifier (NOT ACTIVE) ──────────────────────────
  // Requires higher LiveScore API plan. Currently returns zero boosts.
  // To activate: upgrade API plan, then uncomment and wire in fetchHistoricalStats.
  // const { homeXgBoost: premHomeBoost, awayXgBoost: premAwayBoost } =
  //   computePremiumStatsBoosts(fv);
  // homeXg = homeXg * (1 + premHomeBoost);
  // awayXg = awayXg * (1 + premAwayBoost);

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

  // Apply the same per-team and total caps to L1 base xG so probability
  // comparisons in the engine are fair (apples-to-apples after capping).
  let baseHome = clamp(layer1HomeXg, 0.2, 2.5);
  let baseAway = clamp(layer1AwayXg, 0.2, 2.5);
  const baseTot = baseHome + baseAway;
  if (baseTot > 4.5) { const s = 4.5 / baseTot; baseHome *= s; baseAway *= s; }
  if (baseTot < 0.8) { const s = 0.8 / baseTot; baseHome *= s; baseAway *= s; }

  return {
    homeExpectedGoals: parseFloat(homeXg.toFixed(3)),
    awayExpectedGoals: parseFloat(awayXg.toFixed(3)),
    totalExpectedGoals: parseFloat((homeXg + awayXg).toFixed(3)),
    // Layer 1-only base xG (before form-derived boosts) — used for override detection
    baseHomeXg: parseFloat(baseHome.toFixed(3)),
    baseAwayXg: parseFloat(baseAway.toFixed(3)),
  };
}
