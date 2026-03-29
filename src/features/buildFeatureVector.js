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
      profileWinRate: null,
      profileBttsRate: null,
      profileCleanSheetRate: null,
      profileFailedToScoreRate: null,
      profileOver25Rate: null,
      profileOver15Rate: null,
      homeWinRate: null,
      awayWinRate: null,
    };
  }

  return {
    hasProfile: true,
    profileWinRate: safeNum(profile.winRate, null),
    profileBttsRate: safeNum(profile.bttsRate, null),
    profileCleanSheetRate: safeNum(profile.cleanSheetRate, null),
    profileFailedToScoreRate: safeNum(profile.failedToScoreRate, null),
    profileOver25Rate: safeNum(profile.over25Rate, null),
    profileOver15Rate: safeNum(profile.over15Rate, null),
    homeWinRate: safeNum(profile.homeWinRate, null),
    awayWinRate: safeNum(profile.awayWinRate, null),
  };
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

  // ── Team profile features (form-derived) ───────────────────────────────────
  const homeProfile = meta?.homeProfile || meta?.homeStats || null;
  const awayProfile = meta?.awayProfile || meta?.awayStats || null;
  const homeProfileFeatures = extractProfileFeatures(homeProfile);
  const awayProfileFeatures = extractProfileFeatures(awayProfile);

  // ── Lineup modifiers ───────────────────────────────────────────────────────
  const lineupModifier = meta?.lineupModifier || null;
  const lineupFeatures = extractLineupModifiers(lineupModifier);

  // ── Data completeness from enrichment ─────────────────────────────────────
  const completeness = meta?.completeness || null;

  // Clean internal _teamGoals before returning
  delete homeFormFeatures._teamGoals;
  delete awayFormFeatures._teamGoals;

  // ── Bookmaker implied probabilities (Layer 3 signal) ─────────────────────
  // Convert decimal odds to implied probabilities for xG anchoring
  let impliedHomeProb = null;
  let impliedAwayProb = null;
  let impliedOver25   = null;
  if (odds) {
    const margin = odds.home && odds.draw && odds.away
      ? (1/odds.home + 1/odds.draw + 1/odds.away) : 1;
    if (odds.home) impliedHomeProb = parseFloat(((1 / odds.home) / margin).toFixed(4));
    if (odds.away) impliedAwayProb = parseFloat(((1 / odds.away) / margin).toFixed(4));
    if (odds.over_2_5) impliedOver25 = parseFloat((1 / odds.over_2_5).toFixed(4));
  }

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

    // Team profiles from form-derived data
    homeProfileFeatures,
    awayProfileFeatures,

    // Lineup modifiers
    lineupFeatures,

    // Data completeness from enrichment layer
    enrichmentCompleteness: completeness,

    // Layer 3: bookmaker-implied probabilities (when odds available)
    impliedHomeProb,
    impliedAwayProb,
    impliedOver25,
  };
}
