/**
 * cornersCardsModel.js — Probability model for corners and cards markets.
 *
 * BSD serves odds for: corners_1x2, total_corners (22+ lines), red_card,
 * total_red_cards. Previously these odds flowed into the engine but no model
 * probability was computed → no candidates → no edge calculation → dead data.
 *
 * This module computes model probabilities for corners and cards markets using
 * a simple regression on team average corners/cards per match (derived from
 * BSD post-match stats in form data).
 *
 * APPROACH
 * ────────
 * Corners and cards don't follow Poisson as cleanly as goals (they're more
 * referee-dependent and tactical), but a Poisson approximation with per-team
 * lambda rates works reasonably well for pre-match estimation:
 *
 *   homeCornersLambda = avg(homeTeamCornersPerMatch) * leagueAdjustment
 *   awayCornersLambda = avg(awayTeamCornersPerMatch) * leagueAdjustment
 *   totalCornersLambda = homeCornersLambda + awayCornersLambda
 *
 *   P(total corners > N) = 1 - poissonCDF(N, totalCornersLambda)
 *   P(home has more corners) = sum over h>a of poisson(h, homeLambda) * poisson(a, awayLambda)
 *
 * Red cards are rare events (avg ~0.15 per match) — we use a simple base rate
 * adjusted by team tendency.
 *
 * CALIBRATION
 * ───────────
 * The lambdas are calibrated from BSD post-match stats (corner_kicks,
 * yellow_cards, red_cards fields) stored in historical_matches. When no form
 * data is available, we fall back to league averages.
 *
 * OUTPUT
 * ──────
 * {
 *   corners_1x2_home, corners_1x2_draw, corners_1x2_away,
 *   total_corners_over, total_corners_under, total_corners_line,
 *   red_card_yes, red_card_no,
 *   total_red_cards_over, total_red_cards_under, total_red_cards_line,
 * }
 */

import { poissonProb } from '../probabilities/poisson.js';
import { safeNum, clamp } from '../utils/math.js';

// League-average corners per match (empirical, can be calibrated from history)
const LEAGUE_AVG_CORNERS_HOME = 5.2;
const LEAGUE_AVG_CORNERS_AWAY = 4.4;
const LEAGUE_AVG_TOTAL_CORNERS = 10.6;

// Red card base rates (empirical)
const LEAGUE_AVG_RED_CARDS = 0.15; // per match total
const RED_CARD_YES_BASE_RATE = 0.11; // ~11% of matches have at least 1 red card

/**
 * Extract team average corners and cards from form features.
 *
 * Form features store per-match stats from BSD. We look for:
 *   - homeProfileFeatures.avgCorners / awayProfileFeatures.avgCorners
 *   - homeFormFeatures.avgCorners / awayFormFeatures.avgCorners
 *   - Fallback to league average
 *
 * @param {Object} features - the full feature vector
 * @returns {{ homeCornersAvg, awayCornersAvg, homeRedCardRate, awayRedCardRate }}
 */
function extractTeamRates(features) {
  const fv = features || {};

  // Try home/away profile features first (most reliable — computed from BSD stats)
  const homeProfile = fv.homeProfileFeatures || {};
  const awayProfile = fv.awayProfileFeatures || {};

  // Try form features as fallback
  const homeForm = fv.homeFormFeatures || {};
  const awayForm = fv.awayFormFeatures || {};

  const homeCornersAvg = safeNum(
    homeProfile.avgCorners ?? homeForm.avgCorners ?? homeProfile.cornersPerGame,
    LEAGUE_AVG_CORNERS_HOME
  );
  const awayCornersAvg = safeNum(
    awayProfile.avgCorners ?? awayForm.avgCorners ?? awayProfile.cornersPerGame,
    LEAGUE_AVG_CORNERS_AWAY
  );

  // Red card rates — very rare, use small base rate
  const homeRedCardRate = safeNum(homeProfile.redCardRate ?? homeForm.redCardRate, LEAGUE_AVG_RED_CARDS / 2);
  const awayRedCardRate = safeNum(awayProfile.redCardRate ?? awayForm.redCardRate, LEAGUE_AVG_RED_CARDS / 2);

  return { homeCornersAvg, awayCornersAvg, homeRedCardRate, awayRedCardRate };
}

/**
 * Compute Poisson CDF: P(X <= k) given lambda.
 */
function poissonCDF(k, lambda) {
  if (lambda <= 0) return k < 0 ? 0 : 1;
  let cumulative = 0;
  for (let i = 0; i <= k; i++) {
    cumulative += poissonProb(lambda, i);
  }
  return clamp(cumulative, 0, 1);
}

/**
 * Compute corners and cards market probabilities.
 *
 * @param {Object} features - the full feature vector
 * @param {Object|null} oddsSnapshot - bookmaker odds (used to determine the main line)
 * @returns {Object} probabilities for all corners/cards markets
 */
export function computeCornersCardsProbabilities(features, oddsSnapshot) {
  const { homeCornersAvg, awayCornersAvg, homeRedCardRate, awayRedCardRate } = extractTeamRates(features);

  // ── Corners ──────────────────────────────────────────────────────────────
  const homeLambda = Math.max(1.0, homeCornersAvg);
  const awayLambda = Math.max(1.0, awayCornersAvg);
  const totalLambda = homeLambda + awayLambda;

  // Corners 1X2: which team earns more corners
  // Build a score matrix up to 20 corners (enough for convergence)
  const maxCorners = 20;
  let cornersHome = 0, cornersDraw = 0, cornersAway = 0;
  for (let h = 0; h <= maxCorners; h++) {
    for (let a = 0; a <= maxCorners; a++) {
      const p = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      if (h > a) cornersHome += p;
      else if (h === a) cornersDraw += p;
      else cornersAway += p;
    }
  }
  // Normalize (matrix doesn't sum to exactly 1 due to truncation)
  const cornersSum = cornersHome + cornersDraw + cornersAway;
  if (cornersSum > 0) {
    cornersHome /= cornersSum;
    cornersDraw /= cornersSum;
    cornersAway /= cornersSum;
  }

  // Total corners — find the main line from odds, or default to nearest .5 to totalLambda
  let mainLine = null;
  if (oddsSnapshot?.total_corners_line != null) {
    mainLine = oddsSnapshot.total_corners_line;
  } else {
    // Default: round totalLambda to nearest 0.5
    mainLine = Math.round(totalLambda * 2) / 2;
  }

  // P(total > line) = 1 - P(total <= floor(line))
  // For .5 lines: P(over) = 1 - poissonCDF(floor(line), totalLambda)
  const overProb = 1 - poissonCDF(Math.floor(mainLine), totalLambda);
  const underProb = 1 - overProb;

  // ── Red cards ────────────────────────────────────────────────────────────
  // P(at least 1 red card) = 1 - P(no red cards)
  // P(no red cards) = poisson(0, homeRedCardRate) * poisson(0, awayRedCardRate)
  const totalRedCardLambda = homeRedCardRate + awayRedCardRate;
  const noRedCardProb = poissonProb(totalRedCardLambda, 0);
  const redCardYesProb = 1 - noRedCardProb;
  const redCardNoProb = noRedCardProb;

  // Total red cards — main line is typically 0.5
  let rcMainLine = oddsSnapshot?.total_red_cards_line != null ? oddsSnapshot.total_red_cards_line : 0.5;
  const rcOverProb = 1 - poissonCDF(Math.floor(rcMainLine), totalRedCardLambda);
  const rcUnderProb = 1 - rcOverProb;

  const cap = (v) => parseFloat(Math.min(Math.max(v, 0.01), 0.99).toFixed(4));

  return {
    // Corners 1X2
    corners_1x2_home: cap(cornersHome),
    corners_1x2_draw: cap(cornersDraw),
    corners_1x2_away: cap(cornersAway),
    // Total corners (main line)
    total_corners_over: cap(overProb),
    total_corners_under: cap(underProb),
    total_corners_line: mainLine,
    // Red card yes/no
    red_card_yes: cap(redCardYesProb),
    red_card_no: cap(redCardNoProb),
    // Total red cards (main line)
    total_red_cards_over: cap(rcOverProb),
    total_red_cards_under: cap(rcUnderProb),
    total_red_cards_line: rcMainLine,
    // Metadata for debugging
    _meta: {
      homeCornersAvg, awayCornersAvg, totalLambda,
      homeRedCardRate, awayRedCardRate, totalRedCardLambda,
    },
  };
}

/**
 * Compute Asian Handicap probabilities from the Poisson score matrix.
 *
 * Convention: `line` is the HOME team's handicap.
 *   - line = -1.5 → home is favored by 1.5 goals (home -1.5). Home covers if they win by 2+.
 *   - line = +1.5 → home gets +1.5 (home is underdog). Home covers if they win, draw, or lose by 1.
 *
 * Math:
 *   Home cover condition: (h - a) + line > 0  →  (h - a) > -line
 *   Push condition:       (h - a) + line == 0  →  (h - a) == -line (only for whole lines)
 *   Away cover condition: (h - a) + line < 0  →  (h - a) < -line
 *
 * For whole lines, the push is split 50/50 between home and away (Asian Handicap convention).
 *
 * @param {number[][]} scoreMatrix - from buildScoreMatrix
 * @param {number} line - home team's handicap (negative = home favored, positive = home underdog)
 * @returns {{ homeCover, awayCover }} probabilities (0-1, sum to ~1)
 */
export function computeAsianHandicapProbabilities(scoreMatrix, line) {
  if (!scoreMatrix || !Array.isArray(scoreMatrix) || line == null) {
    return { homeCover: 0.5, awayCover: 0.5 };
  }

  const maxGoals = scoreMatrix.length - 1;
  let homeWin = 0, push = 0, awayWin = 0;

  // The required goal differential for home to cover is -line
  // e.g., line=-1.5 → home needs (h-a) > 1.5
  // e.g., line=+1.5 → home needs (h-a) > -1.5
  const requiredDiff = -line;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = scoreMatrix[h]?.[a] || 0;
      const diff = h - a;
      if (diff > requiredDiff) homeWin += p;
      else if (diff < requiredDiff) awayWin += p;
      else push += p; // exact match — only happens for whole lines
    }
  }

  // For half-lines, push is always 0.
  // For whole lines, split the push 50/50 between home and away (Asian Handicap convention)
  const isWholeLine = line === Math.floor(line);
  if (isWholeLine) {
    homeWin += push * 0.5;
    awayWin += push * 0.5;
  }

  const total = homeWin + awayWin;
  if (total <= 0) return { homeCover: 0.5, awayCover: 0.5 };

  const cap = (v) => parseFloat(Math.min(Math.max(v, 0.01), 0.99).toFixed(4));
  return {
    homeCover: cap(homeWin / total),
    awayCover: cap(awayWin / total),
  };
}
