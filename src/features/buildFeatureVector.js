/**
 * buildFeatureVector.js
 *
 * Assembles all prediction features for a fixture.
 * Combines:
 *   - Historical form from historical_matches table
 *   - Team profiles (aggregated stats) from fixtures.meta
 *   - Standings + table context from fixtures.meta
 *   - Optional lineup modifier from fixtures.meta
 *   - Odds from fixture_odds table
 */

import db from '../config/database.js';
import { safeNum } from '../utils/math.js';
import { computeFormFeatures } from './computeFormFeatures.js';
import { computeSplitFeatures } from './computeSplitFeatures.js';
import { computeH2HFeatures } from './computeH2HFeatures.js';
import { computeTeamStrength } from './computeTeamStrength.js';
import { computeContextFeatures } from './computeContextFeatures.js';
import { computeVolatilityFeatures } from './computeVolatilityFeatures.js';
import { computeMarketFeatures } from './computeMarketFeatures.js';

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getMatches(fixtureId, type) {
  const result = await db.execute({
    sql: 'SELECT * FROM historical_matches WHERE fixture_id = ? AND type = ? ORDER BY date DESC',
    args: [fixtureId, type],
  });
  return result.rows || [];
}

async function getFixtureMeta(fixtureId) {
  try {
    const result = await db.execute({
      sql: 'SELECT meta FROM fixtures WHERE id = ? LIMIT 1',
      args: [fixtureId],
    });
    const row = result.rows?.[0];
    if (!row?.meta) return {};
    return typeof row.meta === 'object' ? row.meta : JSON.parse(row.meta);
  } catch {
    return {};
  }
}

// ── Table context builder ─────────────────────────────────────────────────────

function buildStandingsMap(standings = []) {
  const map = new Map();
  for (const row of standings) {
    if (row?.team) map.set(row.team, row);
  }
  return map;
}

function buildTableContext(homeTeamName, awayTeamName, standings, homeMomentum, awayMomentum) {
  const homeRow = standings.find((r) => r.team === homeTeamName);
  const awayRow = standings.find((r) => r.team === awayTeamName);
  const homePos = safeNum(homeRow?.position, null);
  const awayPos = safeNum(awayRow?.position, null);
  const homePts = safeNum(homeRow?.points, null);
  const awayPts = safeNum(awayRow?.points, null);
  const positionGap = homePos !== null && awayPos !== null ? awayPos - homePos : 0;
  const pointsGap = homePts !== null && awayPts !== null ? homePts - awayPts : 0;

  function classify(position, total = standings.length || 20) {
    if (position === null) return 'unknown';
    if (position <= 2) return 'title';
    if (position <= 4) return 'ucl';
    if (position <= 6) return 'europe';
    if (position >= total - 2) return 'relegation';
    if (position >= total - 4) return 'danger';
    return 'midtable';
  }

  return {
    available: !!homeRow && !!awayRow,
    home_position: homePos,
    away_position: awayPos,
    home_points: homePts,
    away_points: awayPts,
    position_gap: positionGap,
    points_gap: pointsGap,
    home_context: classify(homePos),
    away_context: classify(awayPos),
    home_momentum: safeNum(homeMomentum, 0),
    away_momentum: safeNum(awayMomentum, 0),
    momentum_gap: safeNum(homeMomentum, 0) - safeNum(awayMomentum, 0),
  };
}

// ── Team profile features ─────────────────────────────────────────────────────

/**
 * Extract prediction-relevant features from an aggregated team profile.
 * Returns null fields if profile is unavailable.
 */
function extractProfileFeatures(profile) {
  if (!profile) {
    return {
      hasProfile: false,
      avgShotsFor: null,
      avgShotsOnTargetFor: null,
      avgDangerousAttacksFor: null,
      avgCornersFor: null,
      avgPossession: null,
      avgOpponentShotsAllowed: null,
      avgOpponentShotsOnTargetAllowed: null,
      avgOpponentCornersAllowed: null,
      profileWinRate: null,
      profileBttsRate: null,
      profileCleanSheetRate: null,
      profileFailedToScoreRate: null,
      profileOver25Rate: null,
      profileOver15Rate: null,
      homeWinRate: null,
      awayWinRate: null,
      statsMatchesAvailable: 0,
    };
  }

  return {
    hasProfile: true,
    avgShotsFor: safeNum(profile.avgShotsFor, null),
    avgShotsOnTargetFor: safeNum(profile.avgShotsOnTargetFor, null),
    avgDangerousAttacksFor: safeNum(profile.avgDangerousAttacksFor, null),
    avgCornersFor: safeNum(profile.avgCornersFor, null),
    avgPossession: safeNum(profile.avgPossession, null),
    avgOpponentShotsAllowed: safeNum(profile.avgOpponentShotsAllowed, null),
    avgOpponentShotsOnTargetAllowed: safeNum(profile.avgOpponentShotsOnTargetAllowed, null),
    avgOpponentCornersAllowed: safeNum(profile.avgOpponentCornersAllowed, null),
    profileWinRate: safeNum(profile.winRate, null),
    profileBttsRate: safeNum(profile.bttsRate, null),
    profileCleanSheetRate: safeNum(profile.cleanSheetRate, null),
    profileFailedToScoreRate: safeNum(profile.failedToScoreRate, null),
    profileOver25Rate: safeNum(profile.over25Rate, null),
    profileOver15Rate: safeNum(profile.over15Rate, null),
    homeWinRate: safeNum(profile.homeWinRate, null),
    awayWinRate: safeNum(profile.awayWinRate, null),
    statsMatchesAvailable: safeNum(profile.statsMatchesAvailable, 0),
  };
}

/**
 * Compute shot/attack quality ratio (shots on target / shots).
 * Higher = more clinical attack.
 */
function shotQuality(avgShots, avgShotsOnTarget) {
  if (!avgShots || !avgShotsOnTarget || avgShots === 0) return null;
  return parseFloat(Math.min(1, avgShotsOnTarget / avgShots).toFixed(3));
}

/**
 * Lineup modifier: adjust confidence flags based on lineup info.
 */
function extractLineupModifiers(lineupModifier) {
  if (!lineupModifier) {
    return {
      hasLineup: false,
      homeLineupComplete: null,
      awayLineupComplete: null,
      homeAttackerCount: null,
      awayAttackerCount: null,
    };
  }
  return {
    hasLineup: true,
    homeLineupComplete: lineupModifier.homeLineupConfirmed || false,
    awayLineupComplete: lineupModifier.awayLineupConfirmed || false,
    homeAttackerCount: lineupModifier.homeAttackers || null,
    awayAttackerCount: lineupModifier.awayAttackers || null,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build the full feature vector for a fixture.
 *
 * @param {string} fixtureId
 * @param {string} homeTeamName
 * @param {string} awayTeamName
 * @param {object|null} odds
 * @returns {object} full feature vector
 */
export async function buildFeatureVector(fixtureId, homeTeamName, awayTeamName, odds = null) {
  const [h2hRaw, homeFormRaw, awayFormRaw, meta] = await Promise.all([
    getMatches(fixtureId, 'h2h'),
    getMatches(fixtureId, 'home_form'),
    getMatches(fixtureId, 'away_form'),
    getFixtureMeta(fixtureId),
  ]);

  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const standingsMap = buildStandingsMap(standings);

  const tableContext = buildTableContext(
    homeTeamName, awayTeamName, standings,
    meta?.homeMomentum, meta?.awayMomentum
  );

  // ── Core form features ─────────────────────────────────────────────────────
  const homeFormFeatures = computeFormFeatures(homeFormRaw, homeTeamName, standingsMap);
  const awayFormFeatures = computeFormFeatures(awayFormRaw, awayTeamName, standingsMap);

  // ── Venue split features ───────────────────────────────────────────────────
  const splitFeatures = computeSplitFeatures(homeFormFeatures, awayFormFeatures);

  // ── H2H features ───────────────────────────────────────────────────────────
  const h2hFeatures = computeH2HFeatures(h2hRaw, homeTeamName, awayTeamName);

  // ── Team strength ──────────────────────────────────────────────────────────
  const teamStrength = computeTeamStrength(homeFormFeatures, awayFormFeatures, tableContext, standings);

  // ── Context features ───────────────────────────────────────────────────────
  const contextFeatures = computeContextFeatures(tableContext, standings);

  // ── Volatility features ────────────────────────────────────────────────────
  const volatilityFeatures = computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures);

  // ── Market features ────────────────────────────────────────────────────────
  const marketFeatures = computeMarketFeatures(odds);

  // ── Team profile features (new) ────────────────────────────────────────────
  const homeProfile = meta?.homeProfile || meta?.homeStats || null;
  const awayProfile = meta?.awayProfile || meta?.awayStats || null;
  const homeProfileFeatures = extractProfileFeatures(homeProfile);
  const awayProfileFeatures = extractProfileFeatures(awayProfile);

  // Shot quality ratios
  const homeShotQuality = shotQuality(homeProfileFeatures.avgShotsFor, homeProfileFeatures.avgShotsOnTargetFor);
  const awayShotQuality = shotQuality(awayProfileFeatures.avgShotsFor, awayProfileFeatures.avgShotsOnTargetFor);

  // Dominance signal: possession + dangerous attack differential
  const possessionDiff =
    homeProfileFeatures.avgPossession != null && awayProfileFeatures.avgPossession != null
      ? homeProfileFeatures.avgPossession - awayProfileFeatures.avgPossession
      : null;

  const attackPressDiff =
    homeProfileFeatures.avgDangerousAttacksFor != null && awayProfileFeatures.avgDangerousAttacksFor != null
      ? homeProfileFeatures.avgDangerousAttacksFor - awayProfileFeatures.avgDangerousAttacksFor
      : null;

  // ── Lineup modifiers (new) ─────────────────────────────────────────────────
  const lineupModifier = meta?.lineupModifier || null;
  const lineupFeatures = extractLineupModifiers(lineupModifier);

  // ── Data completeness from enrichment ─────────────────────────────────────
  const completeness = meta?.completeness || null;

  // Clean internal _teamGoals before returning
  delete homeFormFeatures._teamGoals;
  delete awayFormFeatures._teamGoals;

  return {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,

    // Core feature groups (existing)
    homeFormFeatures,
    awayFormFeatures,
    splitFeatures,
    h2hFeatures,
    teamStrength,
    tableContext,
    contextFeatures,
    volatilityFeatures,
    marketFeatures,

    // New: team profiles from historical stats
    homeProfileFeatures,
    awayProfileFeatures,

    // New: derived signals from profiles
    homeShotQuality,
    awayShotQuality,
    possessionDiff,
    attackPressDiff,

    // New: lineup modifiers
    lineupFeatures,

    // New: data completeness from enrichment layer
    enrichmentCompleteness: completeness,
  };
}
