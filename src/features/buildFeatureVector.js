
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
import { computeLastMatchMemory } from './computeLastMatchMemory.js';
import { computeSplitFeatures } from './computeSplitFeatures.js';
import { computeH2HFeatures } from './computeH2HFeatures.js';
import { computeTeamStrength } from './computeTeamStrength.js';
import { computeContextFeatures } from './computeContextFeatures.js';
import { computeVolatilityFeatures } from './computeVolatilityFeatures.js';
import { computeMarketFeatures } from './computeMarketFeatures.js';
import { computeBsdIntelligenceFeatures } from './computeBsdIntelligenceFeatures.js';
import { computeLeagueContext } from './computeLeagueContext.js';
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
  const homeLastMatchMemory = computeLastMatchMemory(homeFormRaw, homeTeamName);
  const awayLastMatchMemory = computeLastMatchMemory(awayFormRaw, awayTeamName);
  const splitFeatures = computeSplitFeatures(homeFormFeatures, awayFormFeatures);
  const h2hFeatures = computeH2HFeatures(h2hRaw, homeTeamName, awayTeamName);
  const teamStrength = computeTeamStrength(homeFormFeatures, awayFormFeatures, tableContext, standings);
  // Get fixture date from multiple sources — needed for rest day / fatigue / season stage computation
  const fixtureDate = meta?.eventContext?.fixture_date || meta?.fixture_date || meta?.matchDate || null;
  const contextFeatures = computeContextFeatures(tableContext, standings, {
    homeFormRaw,
    awayFormRaw,
    fixtureDate,
  });
  const volatilityFeatures = computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures);
  const marketFeatures = computeMarketFeatures(odds);

  const homeProfile = meta?.homeProfile || meta?.homeStats || null;
  const awayProfile = meta?.awayProfile || meta?.awayStats || null;
  const homeProfileFeatures = extractProfileFeatures(homeProfile);
  const awayProfileFeatures = extractProfileFeatures(awayProfile);

  const lineupModifier = meta?.lineupModifier || null;
  const lineupFeatures = extractLineupModifiers(lineupModifier);

  const advancedOdds = meta?.odds_data || null;
  const oddsComparison = meta?.odds_comparison || null;
  const polymarketOdds = meta?.polymarket_odds || null;
  const homeManager = meta?.home_manager || null;
  const awayManager = meta?.away_manager || null;
  const bsdPrediction = meta?.bsd_prediction || null;
  const bestOdds = meta?.best_odds || null;

  const eventContext = meta?.eventContext || null;
  const refereeData = meta?.refereeData || null;
  const venue = meta?.venue || null;
  const metadata = meta?.metadata || null;
  const metadataInsights = meta?.metadataInsights || null;
  const refereeVolatility = meta?.refereeVolatility || null;
  const deepPlayerIntel = meta?.deepPlayerIntel || null;
  const playerStats = Array.isArray(meta?.playerStats) ? meta.playerStats : [];
  const xgPerMinute = Array.isArray(meta?.xg_per_minute) ? meta.xg_per_minute : [];
  const bsdHomeFormStats = meta?.bsd_home_form_stats || null;
  const bsdAwayFormStats = meta?.bsd_away_form_stats || null;
  const actualHomeXg = safeNum(meta?.actualHomeXg, null);
  const actualAwayXg = safeNum(meta?.actualAwayXg, null);

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

  // League-specific context: replaces hardcoded global averages with real league stats
  const leagueContext = computeLeagueContext(standings, homeProfile, awayProfile);
  if (leagueContext._source !== 'global_defaults') {
    console.log(`[LeagueContext] ${fixtureContext?.tournament_name || 'unknown'}: avgGPG=${leagueContext.leagueAvgGoalsPerGame} BTTS=${(leagueContext.leagueBttsRate*100).toFixed(0)}% O2.5=${(leagueContext.leagueOver25Rate*100).toFixed(0)}% O3.5=${(leagueContext.leagueOver35Rate*100).toFixed(0)}% source=${leagueContext._source}`);
  }

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
  let impliedOver15 = null;
  let impliedBttsYes = null;

  // Primary: from the fixture odds parameter
  if (odds) {
    const margin = odds.home && odds.draw && odds.away
      ? (1/odds.home + 1/odds.draw + 1/odds.away) : 1;
    if (odds.home) impliedHomeProb = parseFloat(((1 / odds.home) / margin).toFixed(4));
    if (odds.away) impliedAwayProb = parseFloat(((1 / odds.away) / margin).toFixed(4));
    if (odds.over_2_5) impliedOver25 = parseFloat((1 / odds.over_2_5).toFixed(4));
    if (odds.over_1_5) impliedOver15 = parseFloat((1 / odds.over_1_5).toFixed(4));
    if (odds.btts_yes) impliedBttsYes = parseFloat((1 / odds.btts_yes).toFixed(4));
  }

  // Fallback: from enrichment advancedOdds (BSD fetchEventOdds)
  // This is CRITICAL — the fixture odds parameter often lacks 1X2 data,
  // but the enrichment pipeline fetches full odds via fetchEventOdds.
  if (advancedOdds) {
    const ao = advancedOdds.odds || advancedOdds;
    if (impliedHomeProb == null || impliedAwayProb == null) {
      const h = safeNum(ao.home_win || ao.home, null);
      const d = safeNum(ao.draw, null);
      const a = safeNum(ao.away_win || ao.away, null);
      if (h && d && a) {
        const margin = 1/h + 1/d + 1/a;
        if (impliedHomeProb == null) impliedHomeProb = parseFloat(((1/h)/margin).toFixed(4));
        if (impliedAwayProb == null) impliedAwayProb = parseFloat(((1/a)/margin).toFixed(4));
      }
    }
    if (impliedOver25 == null) {
      const o25 = safeNum(ao.over_25 || ao.over_25_goals, null);
      if (o25) impliedOver25 = parseFloat((1/o25).toFixed(4));
    }
    if (impliedOver15 == null) {
      const o15 = safeNum(ao.over_15 || ao.over_15_goals, null);
      if (o15) impliedOver15 = parseFloat((1/o15).toFixed(4));
    }
    if (impliedBttsYes == null) {
      const btts = safeNum(ao.btts_yes, null);
      if (btts) impliedBttsYes = parseFloat((1/btts).toFixed(4));
    }
  }

  // Fallback: from basicOdds (extractOddsFromEvent)
  if ((impliedHomeProb == null || impliedAwayProb == null) && bestOdds) {
    const bo = bestOdds.odds || bestOdds;
    const h = safeNum(bo.home || bo.home_win, null);
    const d = safeNum(bo.draw, null);
    const a = safeNum(bo.away || bo.away_win, null);
    if (h && d && a) {
      const margin = 1/h + 1/d + 1/a;
      if (impliedHomeProb == null) impliedHomeProb = parseFloat(((1/h)/margin).toFixed(4));
      if (impliedAwayProb == null) impliedAwayProb = parseFloat(((1/a)/margin).toFixed(4));
    }
  }

  if (impliedHomeProb != null || impliedOver25 != null) {
    console.log(`[odds] Implied probs: home=${impliedHomeProb != null ? (impliedHomeProb*100).toFixed(1)+'%' : 'N/A'} away=${impliedAwayProb != null ? (impliedAwayProb*100).toFixed(1)+'%' : 'N/A'} O2.5=${impliedOver25 != null ? (impliedOver25*100).toFixed(1)+'%' : 'N/A'} O1.5=${impliedOver15 != null ? (impliedOver15*100).toFixed(1)+'%' : 'N/A'} BTTS=${impliedBttsYes != null ? (impliedBttsYes*100).toFixed(1)+'%' : 'N/A'}`);
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
    homeLastMatchMemory,
    awayLastMatchMemory,
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
    leagueContext,
    injuryFeatures,
    bsdLineupFeatures,
    enrichmentCompleteness: completeness,
    impliedHomeProb,
    impliedAwayProb,
    impliedOver25,
    impliedOver15,
    impliedBttsYes,
    fixtureDate,
    actualHomeXg,
    actualAwayXg,
    xgPerMinute,
    bsdHomeFormStats,
    bsdAwayFormStats,
    advancedOdds,
    oddsComparison,
    polymarketOdds,
    homeManager,
    awayManager,
    bsdPrediction,
    bestOdds,
    eventContext,
    refereeData,
    refereeVolatility,
    venue,
    metadata,
    metadataInsights,
    playerStats,
    deepPlayerIntel,
  };
}
