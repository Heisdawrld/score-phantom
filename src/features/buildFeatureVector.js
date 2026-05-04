
function fuzzyTeamMatch(a, b) {
  if (!a || !b) return false;
  const na = String(a).toLowerCase().trim();
  const nb = String(b).toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/)[0];
  const wb = nb.split(/\s+/)[0];
  if (wa.length >= 4 && (wa === wb || wa.includes(wb) || wb.includes(wa))) return true;
  return false;
}
/**
 * buildFeatureVector.js
 *
 * Assembles all prediction features for a fixture.
 * Combines historical form, team profiles, standings, lineup modifiers,
 * odds, and league identity for calibration.
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
import { computeBsdIntelligenceFeatures } from './computeBsdIntelligenceFeatures.js';
import { resolveFixtureMeta } from './resolveFixtureMeta.js';

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

async function getFixtureContext(fixtureId) {
  try {
    const result = await db.execute({
      sql: 'SELECT tournament_id, tournament_name, category_name, home_team_id, away_team_id FROM fixtures WHERE id = ? LIMIT 1',
      args: [fixtureId],
    });
    return result.rows?.[0] || {};
  } catch {
    return {};
  }
}

function buildStandingsMap(standings = []) {
  const map = new Map();
  for (const row of standings) {
    if (row?.team) map.set(row.team, row);
  }
  return map;
}

function buildTableContext(homeTeamName, awayTeamName, standings, homeMomentum, awayMomentum) {
  const homeRow = standings.find((r) => fuzzyTeamMatch(r.team, homeTeamName));
  const awayRow = standings.find((r) => fuzzyTeamMatch(r.team, awayTeamName));
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
      statsMatchesAvailable: 0,
      avgPossession: null,
      avgShotsFor: null,
      avgShotsOnTargetFor: null,
      avgDangerousAttacksFor: null,
      avgCornersFor: null,
      avgOpponentShotsOnTargetAllowed: null,
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
    statsMatchesAvailable: safeNum(profile.matchesAnalyzed, 0),
    avgPossession: safeNum(profile.avgPossession ?? profile.possession ?? null, null),
    avgShotsFor: safeNum(profile.avgShotsFor ?? profile.avgShots ?? null, null),
    avgShotsOnTargetFor: safeNum(profile.avgShotsOnTargetFor ?? profile.avgShotsOnTarget ?? null, null),
    avgDangerousAttacksFor: safeNum(profile.avgDangerousAttacksFor ?? profile.avgDangerousAttacks ?? null, null),
    avgCornersFor: safeNum(profile.avgCornersFor ?? profile.avgCorners ?? null, null),
    avgOpponentShotsOnTargetAllowed: safeNum(profile.avgOpponentShotsOnTargetAllowed ?? profile.avgShotsOnTargetAgainst ?? null, null),
  };
}

function extractLineupModifiers(lineupModifier) {
  if (!lineupModifier) {
    return {
      hasLineup: false,
      homeLineupComplete: null,
      awayLineupComplete: null,
      homeAttackers: null,
      awayAttackers: null,
      homeHasKeeper: null,
      awayHasKeeper: null,
    };
  }
  return {
    hasLineup: true,
    homeLineupComplete: lineupModifier.homeLineupConfirmed || false,
    awayLineupComplete: lineupModifier.awayLineupConfirmed || false,
    homeAttackers: lineupModifier.homeAttackers || null,
    awayAttackers: lineupModifier.awayAttackers || null,
    homeHasKeeper: lineupModifier.homeHasKeeper ?? true,
    awayHasKeeper: lineupModifier.awayHasKeeper ?? true,
  };
}

export async function buildFeatureVector(fixtureId, homeTeamName, awayTeamName, odds = null, metaOverride = null) {
  const [h2hRaw, homeFormRaw, awayFormRaw, dbMeta, fixtureContext] = await Promise.all([
    getMatches(fixtureId, 'h2h'),
    getMatches(fixtureId, 'home_form'),
    getMatches(fixtureId, 'away_form'),
    getFixtureMeta(fixtureId),
    getFixtureContext(fixtureId),
  ]);

  const meta = resolveFixtureMeta(metaOverride, dbMeta);

  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const standingsMap = buildStandingsMap(standings);

  const tableContext = buildTableContext(
    homeTeamName, awayTeamName, standings,
    meta?.homeMomentum, meta?.awayMomentum
  );

  const homeFormFeatures = computeFormFeatures(homeFormRaw, homeTeamName, standingsMap);
  const awayFormFeatures = computeFormFeatures(awayFormRaw, awayTeamName, standingsMap);
  const splitFeatures = computeSplitFeatures(homeFormFeatures, awayFormFeatures);
  const h2hFeatures = computeH2HFeatures(h2hRaw, homeTeamName, awayTeamName);
  const teamStrength = computeTeamStrength(homeFormFeatures, awayFormFeatures, tableContext, standings);
  const contextFeatures = computeContextFeatures(tableContext, standings);
  const volatilityFeatures = computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures);
  const marketFeatures = computeMarketFeatures(odds);

  const homeProfile = meta?.homeProfile || meta?.homeStats || null;
  const awayProfile = meta?.awayProfile || meta?.awayStats || null;
  const homeProfileFeatures = extractProfileFeatures(homeProfile);
  const awayProfileFeatures = extractProfileFeatures(awayProfile);

  const lineupModifier = meta?.lineupModifier || null;
  const lineupFeatures = extractLineupModifiers(lineupModifier);

  const advancedOdds = meta?.odds_data || null;
  const polymarketOdds = meta?.polymarket_odds || null;
  const homeManager = meta?.home_manager || null;
  const awayManager = meta?.away_manager || null;
  const bsdPrediction = meta?.bsd_prediction || null;
  const bestOdds = meta?.best_odds || null;

  const eventContext = meta?.eventContext || null;
  const refereeData = meta?.refereeData || null;
  const venue = meta?.venue || null;
  const metadata = meta?.metadata || null;
  const playerStats = Array.isArray(meta?.playerStats) ? meta.playerStats : [];

  const bsdIntelligenceFeatures = computeBsdIntelligenceFeatures({
    standings,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeTeamId: fixtureContext?.home_team_id,
    awayTeamId: fixtureContext?.away_team_id,
    homeManager,
    awayManager,
    playerStats,
  });

  const missingPlayers = meta?.unavailable_players || meta?.injuries || null;
  const predictedLineups = meta?.predicted_lineup || meta?.lineups || null;

  const injuryFeatures = {
    homeKeyMissing: 0,
    awayKeyMissing: 0,
    homeMissingCount: 0,
    awayMissingCount: 0,
    missingPlayersDetails: missingPlayers
  };

  if (missingPlayers) {
    const homeMissing = missingPlayers.home || [];
    const awayMissing = missingPlayers.away || [];
    injuryFeatures.homeMissingCount = missingPlayers.homeMissingCount ?? homeMissing.length;
    injuryFeatures.awayMissingCount = missingPlayers.awayMissingCount ?? awayMissing.length;

    const isKeyPlayer = (p) => {
      const reason = (p.reason || '').toLowerCase();
      const status = (p.status || '').toLowerCase();
      return reason.includes('key') || reason.includes('starter') || status === 'suspended' || p.rating >= 7.0;
    };

    injuryFeatures.homeKeyMissing = homeMissing.filter(isKeyPlayer).length;
    injuryFeatures.awayKeyMissing = awayMissing.filter(isKeyPlayer).length;
    if (injuryFeatures.homeKeyMissing === 0 && injuryFeatures.homeMissingCount >= 4) injuryFeatures.homeKeyMissing = 1;
    if (injuryFeatures.awayKeyMissing === 0 && injuryFeatures.awayMissingCount >= 4) injuryFeatures.awayKeyMissing = 1;
  }

  const bsdLineupFeatures = {
    hasPredictedLineups: !!predictedLineups,
    homePredictedStrength: 1.0,
    awayPredictedStrength: 1.0
  };

  if (predictedLineups) {
    if (injuryFeatures.homeKeyMissing > 0) bsdLineupFeatures.homePredictedStrength = 0.9;
    if (injuryFeatures.awayKeyMissing > 0) bsdLineupFeatures.awayPredictedStrength = 0.9;
  }

  const completeness = meta?.completeness || null;

  delete homeFormFeatures._teamGoals;
  delete awayFormFeatures._teamGoals;

  let impliedHomeProb = null;
  let impliedAwayProb = null;
  let impliedOver25 = null;
  if (odds) {
    const margin = odds.home && odds.draw && odds.away
      ? (1/odds.home + 1/odds.draw + 1/odds.away) : 1;
    if (odds.home) impliedHomeProb = parseFloat(((1 / odds.home) / margin).toFixed(4));
    if (odds.away) impliedAwayProb = parseFloat(((1 / odds.away) / margin).toFixed(4));
    if (odds.over_2_5) impliedOver25 = parseFloat((1 / odds.over_2_5).toFixed(4));
  }

  return {
    fixtureId,
    leagueId: fixtureContext?.tournament_id || null,
    tournamentName: fixtureContext?.tournament_name || '',
    categoryName: fixtureContext?.category_name || '',
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeFormFeatures,
    awayFormFeatures,
    splitFeatures,
    h2hFeatures,
    teamStrength,
    tableContext,
    contextFeatures,
    volatilityFeatures,
    marketFeatures,
    homeProfileFeatures,
    awayProfileFeatures,
    lineupFeatures,
    bsdIntelligenceFeatures,
    injuryFeatures,
    bsdLineupFeatures,
    enrichmentCompleteness: completeness,
    impliedHomeProb,
    impliedAwayProb,
    impliedOver25,
    advancedOdds,
    polymarketOdds,
    homeManager,
    awayManager,
    bsdPrediction,
    bestOdds,
    eventContext,
    refereeData,
    venue,
    metadata,
    playerStats,
  };
}
