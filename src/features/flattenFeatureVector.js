import { safeNum, clamp } from "../utils/math.js";

function flattenFeatureVector(fv) {
  const ts = fv.teamStrength || {};
  const hf = fv.homeFormFeatures || {};
  const af = fv.awayFormFeatures || {};
  const hMemory = fv.homeLastMatchMemory || {};
  const aMemory = fv.awayLastMatchMemory || {};
  const hLast = hMemory.lastMatch || {};
  const aLast = aMemory.lastMatch || {};
  const sf = fv.splitFeatures || {};
  const h2h = fv.h2hFeatures || {};
  const vf = fv.volatilityFeatures || {};
  const cf = fv.contextFeatures || {};
  const tc = fv.tableContext || {};
  const inf = fv.injuryFeatures || {};
  const blf = fv.bsdLineupFeatures || {};
  const bsdIntel = fv.bsdIntelligenceFeatures || {};
  const ec = fv.eventContext || {};
  const referee = fv.refereeData || {};
  const deepPlayerIntel = fv.deepPlayerIntel || {};
  const deepPlayerSummary = deepPlayerIntel.summary || {};
  const refereeVolatility = fv.refereeVolatility || {};
  const metadataInsights = fv.metadataInsights || {};
  const bsdHomeFormStats = fv.bsdHomeFormStats || {};
  const bsdAwayFormStats = fv.bsdAwayFormStats || {};
  const lc = fv.leagueContext || {};

  const homeBaseRating = safeNum(ts.homeBaseRating, 1.2);
  const awayBaseRating = safeNum(ts.awayBaseRating, 1.2);
  const homeAttackRating = safeNum(ts.homeAttackRating, 0.7);
  const awayAttackRating = safeNum(ts.awayAttackRating, 0.7);
  const homeDefenseRating = safeNum(ts.homeDefenseRating, 0.9);
  const awayDefenseRating = safeNum(ts.awayDefenseRating, 0.9);

  const homeAvgConceded = safeNum(hf.avg_conceded, 1.1);
  const awayAvgConceded = safeNum(af.avg_conceded, 1.1);
  const homeAvgScored = safeNum(hf.avg_scored, 1.2);
  const awayAvgScored = safeNum(af.avg_scored, 1.0);

  const homeDefensiveWeakness = clamp(homeAvgConceded / 2.5, 0, 1);
  const awayDefensiveWeakness = clamp(awayAvgConceded / 2.5, 0, 1);
  const homeAttackRating01 = clamp(homeAttackRating / 2.0, 0, 1);
  const awayAttackRating01 = clamp(awayAttackRating / 2.0, 0, 1);

  const homeWeightedPts = safeNum(hf.weighted_points_per_match, 1.2);
  const awayWeightedPts = safeNum(af.weighted_points_per_match, 1.0);
  const homePointsLast5 = safeNum(hf.pointsLast5 ?? hf.points_last5, homeWeightedPts * 5);
  const awayPointsLast5 = safeNum(af.pointsLast5 ?? af.points_last5, awayWeightedPts * 5);

  const homeFailedToScoreRate = 1 - safeNum(hf.scored_over_0_5_rate, 0.7);
  const awayFailedToScoreRate = 1 - safeNum(af.scored_over_0_5_rate, 0.65);

  const h2hBttsRate = h2h.btts_rate != null ? safeNum(h2h.btts_rate) : null;
  const h2hAvgGoals = h2h.avg_total_goals != null ? safeNum(h2h.avg_total_goals) : null;
  const h2hOver25Rate = h2h.over_2_5_rate != null ? safeNum(h2h.over_2_5_rate) : null;

  const homeBttsRate = safeNum(hf.btts_rate, 0.45);
  const awayBttsRate = safeNum(af.btts_rate, 0.45);
  const combinedBttsRate = (homeBttsRate + awayBttsRate) / 2;

  const weatherText = String(ec.weather?.condition || ec.weather || '').toLowerCase();
  const pitchText = String(ec.pitch_condition || '').toLowerCase();
  const hasBadWeather = /rain|storm|snow|wind|heavy|poor/.test(weatherText);
  const hasBadPitch = /poor|heavy|wet|bad|mud|rough/.test(pitchText);
  const yellowCards = safeNum(referee.yellowCards ?? referee.yellow_cards ?? referee.avg_yellow_cards, null);
  const redCards = safeNum(referee.redCards ?? referee.red_cards ?? referee.avg_red_cards, null);
  const deepStrictness = safeNum(refereeVolatility.strictness, null);
  const deepChaos = safeNum(refereeVolatility.chaos, null);
  const xgPerMinute = Array.isArray(fv.xgPerMinute) ? fv.xgPerMinute : [];

  return {
    fixtureId: fv.fixtureId,
    leagueId: fv.leagueId || null,
    tournamentName: fv.tournamentName || '',
    categoryName: fv.categoryName || '',
    homeTeam: fv.homeTeam,
    awayTeam: fv.awayTeam,
    homeBaseRating,
    awayBaseRating,
    homeAttackRating,
    awayAttackRating,
    homeDefenseRating,
    awayDefenseRating,
    homeStrengthGap: homeBaseRating - awayBaseRating,
    awayStrengthGap: awayBaseRating - homeBaseRating,
    homeDefensiveWeakness,
    awayDefensiveWeakness,
    homeAttackRating01,
    awayAttackRating01,
    homeAvgScored,
    homeAvgConceded,
    awayAvgScored,
    awayAvgConceded,
    homeAvgXgFor: safeNum(hf.avg_xg_for, safeNum(bsdHomeFormStats.avg_xg, null)),
    homeAvgXgAgainst: safeNum(hf.avg_xg_against, safeNum(bsdHomeFormStats.avg_xg_conceded, null)),
    awayAvgXgFor: safeNum(af.avg_xg_for, safeNum(bsdAwayFormStats.avg_xg, null)),
    awayAvgXgAgainst: safeNum(af.avg_xg_against, safeNum(bsdAwayFormStats.avg_xg_conceded, null)),
    actualHomeXg: safeNum(fv.actualHomeXg, null),
    actualAwayXg: safeNum(fv.actualAwayXg, null),
    xgPerMinuteCount: xgPerMinute.length,
    hasXgTimeline: xgPerMinute.length > 0,
    homeWinRate: safeNum(hf.win_rate, 0.4),
    awayWinRate: safeNum(af.win_rate, 0.35),
    homeMissingXgImpact: safeNum(inf.homeMissingXgImpact, 0),
    awayMissingXgImpact: safeNum(inf.awayMissingXgImpact, 0),
    homePredictedStrength: safeNum(blf.homePredictedStrength, 1.0),
    awayPredictedStrength: safeNum(blf.awayPredictedStrength, 1.0),
    homeWeightedPts,
    awayWeightedPts,
    homePointsLast5,
    awayPointsLast5,
    homeBttsRate,
    awayBttsRate,
    combinedBttsRate,
    homeFailedToScoreRate,
    awayFailedToScoreRate,
    homeOver25Rate: safeNum(hf.over_2_5_rate, 0.4),
    awayOver25Rate: safeNum(af.over_2_5_rate, 0.4),
    homeLastMatchMemoryAvailable: hMemory.available === true,
    awayLastMatchMemoryAvailable: aMemory.available === true,
    homeLastMatchLabel: hMemory.label || 'unknown',
    awayLastMatchLabel: aMemory.label || 'unknown',
    homeLastMatchAttackSignal: safeNum(hMemory.attackSignal, 0),
    awayLastMatchAttackSignal: safeNum(aMemory.attackSignal, 0),
    homeLastMatchDefenseSignal: safeNum(hMemory.defenseSignal, 0),
    awayLastMatchDefenseSignal: safeNum(aMemory.defenseSignal, 0),
    homeLastMatchVolatilitySignal: safeNum(hMemory.volatilitySignal, 0),
    awayLastMatchVolatilitySignal: safeNum(aMemory.volatilitySignal, 0),
    homeLastMatchReliability: safeNum(hMemory.reliability, 0),
    awayLastMatchReliability: safeNum(aMemory.reliability, 0),
    homeLastMatchCodes: hMemory.codes || [],
    awayLastMatchCodes: aMemory.codes || [],
    homeLastGoalsFor: safeNum(hLast.scored, null),
    homeLastGoalsAgainst: safeNum(hLast.conceded, null),
    awayLastGoalsFor: safeNum(aLast.scored, null),
    awayLastGoalsAgainst: safeNum(aLast.conceded, null),
    homeLastXgFor: safeNum(hLast.xgFor, null),
    homeLastXgAgainst: safeNum(hLast.xgAgainst, null),
    awayLastXgFor: safeNum(aLast.xgFor, null),
    awayLastXgAgainst: safeNum(aLast.xgAgainst, null),
    homeHomeGoalsFor: sf.homeHomeGoalsFor != null ? safeNum(sf.homeHomeGoalsFor) : null,
    homeHomeGoalsAgainst: sf.homeHomeGoalsAgainst != null ? safeNum(sf.homeHomeGoalsAgainst) : null,
    homeHomeWinRate: sf.homeHomeWinRate != null ? safeNum(sf.homeHomeWinRate) : null,
    awayAwayGoalsFor: sf.awayAwayGoalsFor != null ? safeNum(sf.awayAwayGoalsFor) : null,
    awayAwayGoalsAgainst: sf.awayAwayGoalsAgainst != null ? safeNum(sf.awayAwayGoalsAgainst) : null,
    awayAwayWinRate: sf.awayAwayWinRate != null ? safeNum(sf.awayAwayWinRate) : null,
    h2hBttsRate,
    h2hAvgGoals,
    h2hOver25Rate,
    h2hMatchesAvailable: safeNum(h2h.matches_available, 0),
    homeFormVariance: safeNum(vf.homeFormVariance, 0),
    awayFormVariance: safeNum(vf.awayFormVariance, 0),
    upsetRiskScore: safeNum(vf.upsetRiskScore, 0.5),
    dataCompletenessScore: safeNum(vf.dataCompletenessScore, 0.5),
    matchChaosScore: safeNum(vf.matchChaosScore, 0.5),
    homeMotivationScore: safeNum(cf.homeMotivationScore, 0.5),
    awayMotivationScore: safeNum(cf.awayMotivationScore, 0.5),
    rotationRiskHome: safeNum(cf.rotationRiskHome, 0),
    rotationRiskAway: safeNum(cf.rotationRiskAway, 0),
    cupDistractionHome: safeNum(cf.cupDistractionHome, 0),
    cupDistractionAway: safeNum(cf.cupDistractionAway, 0),
    restDiffDays: safeNum(cf.restDiffDays, 0),
    seasonStage: cf.seasonStage || 'mid',
    seasonProgress: safeNum(cf.seasonProgress, 0.5),
    homeAlreadySecure: cf.homeAlreadySecure === true,
    awayAlreadySecure: cf.awayAlreadySecure === true,
    homeFatigue: safeNum(cf.homeFatigue, 0),
    awayFatigue: safeNum(cf.awayFatigue, 0),
    homeDaysSinceLastMatch: cf.homeDaysSinceLastMatch != null ? safeNum(cf.homeDaysSinceLastMatch, null) : null,
    awayDaysSinceLastMatch: cf.awayDaysSinceLastMatch != null ? safeNum(cf.awayDaysSinceLastMatch, null) : null,
    homePosition: safeNum(tc.home_position, 10),
    awayPosition: safeNum(tc.away_position, 10),
    pointsGap: safeNum(tc.points_gap, 0),
    positionGap: safeNum(tc.position_gap, 0),
    homeContext: tc.home_context || 'midtable',
    awayContext: tc.away_context || 'midtable',
    homeAvgShotsFor: safeNum(fv.homeProfileFeatures?.avgShotsFor, safeNum(bsdHomeFormStats.avg_shots, null)),
    awayAvgShotsFor: safeNum(fv.awayProfileFeatures?.avgShotsFor, safeNum(bsdAwayFormStats.avg_shots, null)),
    homeAvgShotsOnTargetFor: safeNum(fv.homeProfileFeatures?.avgShotsOnTargetFor, safeNum(bsdHomeFormStats.avg_shots_on_target, null)),
    awayAvgShotsOnTargetFor: safeNum(fv.awayProfileFeatures?.avgShotsOnTargetFor, safeNum(bsdAwayFormStats.avg_shots_on_target, null)),
    homeAvgDangerousAttacksFor: safeNum(fv.homeProfileFeatures?.avgDangerousAttacksFor, null),
    awayAvgDangerousAttacksFor: safeNum(fv.awayProfileFeatures?.avgDangerousAttacksFor, null),
    homeAvgCornersFor: safeNum(fv.homeProfileFeatures?.avgCornersFor, null),
    awayAvgCornersFor: safeNum(fv.awayProfileFeatures?.avgCornersFor, null),
    homeAvgPossession: safeNum(fv.homeProfileFeatures?.avgPossession, null),
    awayAvgPossession: safeNum(fv.awayProfileFeatures?.avgPossession, null),
    homeShotQuality: safeNum(fv.homeShotQuality, null),
    awayShotQuality: safeNum(fv.awayShotQuality, null),
    possessionDiff: safeNum(fv.possessionDiff, null),
    attackPressDiff: safeNum(fv.attackPressDiff, null),
    homeProfileBttsRate: safeNum(fv.homeProfileFeatures?.profileBttsRate, null),
    awayProfileBttsRate: safeNum(fv.awayProfileFeatures?.profileBttsRate, null),
    homeProfileCleanSheetRate: safeNum(fv.homeProfileFeatures?.profileCleanSheetRate, null),
    awayProfileCleanSheetRate: safeNum(fv.awayProfileFeatures?.profileCleanSheetRate, null),
    homeProfileOver25Rate: safeNum(fv.homeProfileFeatures?.profileOver25Rate, null),
    awayProfileOver25Rate: safeNum(fv.awayProfileFeatures?.profileOver25Rate, null),
    hasHomeStatProfile: fv.homeProfileFeatures?.hasProfile === true || !!bsdHomeFormStats.matches_played,
    hasAwayStatProfile: fv.awayProfileFeatures?.hasProfile === true || !!bsdAwayFormStats.matches_played,
    homeOpponentShotsOnTargetAllowed: safeNum(fv.homeProfileFeatures?.avgOpponentShotsOnTargetAllowed, null),
    awayOpponentShotsOnTargetAllowed: safeNum(fv.awayProfileFeatures?.avgOpponentShotsOnTargetAllowed, null),
    homeStatsMatchCount: safeNum(fv.homeProfileFeatures?.statsMatchesAvailable, safeNum(bsdHomeFormStats.matches_played, 0)),
    awayStatsMatchCount: safeNum(fv.awayProfileFeatures?.statsMatchesAvailable, safeNum(bsdAwayFormStats.matches_played, 0)),
    hasLineupData: fv.lineupFeatures?.hasLineup === true,
    homeLineupComplete: fv.lineupFeatures?.homeLineupComplete || false,
    awayLineupComplete: fv.lineupFeatures?.awayLineupComplete || false,
    homeAttackers: safeNum(fv.lineupFeatures?.homeAttackers, null),
    awayAttackers: safeNum(fv.lineupFeatures?.awayAttackers, null),
    enrichmentCompleteness: fv.enrichmentCompleteness?.score ?? null,
    enrichmentTier: fv.enrichmentCompleteness?.tier ?? null,
    homeMatchesAvailable: safeNum(hf.matches_available, 0),
    awayMatchesAvailable: safeNum(af.matches_available, 0),
    predictability_score: fv.predictability_score ?? 0.5,
    hasXgTable: bsdIntel.hasXgTable === true,
    homeXgForPerGame: safeNum(bsdIntel.homeXgForPerGame, null),
    homeXgAgainstPerGame: safeNum(bsdIntel.homeXgAgainstPerGame, null),
    awayXgForPerGame: safeNum(bsdIntel.awayXgForPerGame, null),
    awayXgAgainstPerGame: safeNum(bsdIntel.awayXgAgainstPerGame, null),
    homeXgTableStrength: safeNum(bsdIntel.homeXgTableStrength, null),
    awayXgTableStrength: safeNum(bsdIntel.awayXgTableStrength, null),
    xgTableGap: safeNum(bsdIntel.xgTableGap, 0),
    homeTableLuck: safeNum(bsdIntel.homeTableLuck, null),
    awayTableLuck: safeNum(bsdIntel.awayTableLuck, null),
    homeGdVsXgd: safeNum(bsdIntel.homeGdVsXgd, null),
    awayGdVsXgd: safeNum(bsdIntel.awayGdVsXgd, null),
    hasManagerIntel: bsdIntel.hasManagerIntel === true,
    homeManagerAttacking: safeNum(bsdIntel.homeManagerIntel?.attacking, null),
    awayManagerAttacking: safeNum(bsdIntel.awayManagerIntel?.attacking, null),
    homeManagerDefensive: safeNum(bsdIntel.homeManagerIntel?.defensive, null),
    awayManagerDefensive: safeNum(bsdIntel.awayManagerIntel?.defensive, null),
    managerAttackGap: safeNum(bsdIntel.managerAttackGap, 0),
    managerDefenceGap: safeNum(bsdIntel.managerDefenceGap, 0),
    combinedManagerOverBias: safeNum(bsdIntel.combinedManagerOverBias, 0),
    combinedManagerUnderBias: safeNum(bsdIntel.combinedManagerUnderBias, 0),
    hasPlayerStats: bsdIntel.hasPlayerStats === true,
    playerStatsCount: safeNum(bsdIntel.playerStatsCount, 0),
    homePlayerXgXa: safeNum(bsdIntel.homePlayerXgXa, 0),
    awayPlayerXgXa: safeNum(bsdIntel.awayPlayerXgXa, 0),
    playerImpactGap: safeNum(bsdIntel.playerImpactGap, 0),
    homeAvgPlayerRating: safeNum(bsdIntel.homeAvgPlayerRating, null),
    awayAvgPlayerRating: safeNum(bsdIntel.awayAvgPlayerRating, null),
    hasDeepPlayerIntel: !!deepPlayerSummary,
    homeCorePlayerScore: safeNum(deepPlayerSummary.homeCorePlayerScore, 0),
    awayCorePlayerScore: safeNum(deepPlayerSummary.awayCorePlayerScore, 0),
    corePlayerGap: safeNum(deepPlayerSummary.corePlayerGap, 0),
    homeCoreAvgRating: safeNum(deepPlayerSummary.homeCoreAvgRating, null),
    awayCoreAvgRating: safeNum(deepPlayerSummary.awayCoreAvgRating, null),
    refereeVolatilityStrictness: deepStrictness,
    refereeVolatilityChaos: deepChaos,
    refereeCardsWarning: refereeVolatility.cardsWarning === true,
    refereeRedCardWarning: refereeVolatility.redCardWarning === true,
    metadataFactCount: (metadataInsights.facts || []).length,
    metadataReasonCodes: metadataInsights.reasonCodes || [],
    hasMetadataPreview: !!metadataInsights.preview,
    advancedOdds: fv.advancedOdds || null,
    oddsComparison: fv.oddsComparison || null,
    polymarketOdds: fv.polymarketOdds || null,
    homeManager: fv.homeManager || null,
    awayManager: fv.awayManager || null,
    bsdPrediction: fv.bsdPrediction || null,
    bestOdds: fv.bestOdds || null,
    eventContext: fv.eventContext || null,
    refereeData: fv.refereeData || null,
    refereeVolatility: fv.refereeVolatility || null,
    venue: fv.venue || null,
    metadata: fv.metadata || null,
    metadataInsights: fv.metadataInsights || null,
    playerStats: fv.playerStats || [],
    deepPlayerIntel: fv.deepPlayerIntel || null,
    xgPerMinute: fv.xgPerMinute || [],
    isNeutralGround: fv.eventContext?.is_neutral_ground === true,
    isLocalDerby: fv.eventContext?.is_local_derby === true,
    travelDistanceKm: safeNum(fv.eventContext?.travel_distance_km, 0),
    hasBadWeather,
    hasBadPitch,
    refereeYellowCards: yellowCards,
    refereeRedCards: redCards,
    refereeStrictness: deepStrictness != null ? deepStrictness : clamp(((yellowCards ?? 4) / 6) + ((redCards ?? 0.2) * 0.7), 0, 1),

       // ── League-specific context (replaces hardcoded global averages) ────────
    leagueAvgGoalsPerTeam:  safeNum(lc.leagueAvgGoalsPerTeam, 1.35),
    leagueAvgGoalsPerGame:  safeNum(lc.leagueAvgGoalsPerGame, 2.70),
    leagueBttsRate:         safeNum(lc.leagueBttsRate, 0.46),
    leagueCleanSheetRate:   safeNum(lc.leagueCleanSheetRate, 0.28),
    leagueOver25Rate:       safeNum(lc.leagueOver25Rate, 0.50),
    leagueOver35Rate:       safeNum(lc.leagueOver35Rate, 0.30),
    leagueScoreSuccessRate: safeNum(lc.leagueScoreSuccessRate, 0.70),
    leagueContextSource:    lc._source || 'global_defaults',
    h2hOver35Rate:          safeNum(h2h.over_3_5_rate, null),

    // ── Implied odds from bookmaker (CRITICAL — previously missing) ──────
    impliedHomeProb:       safeNum(fv.impliedHomeProb, null),
    impliedAwayProb:       safeNum(fv.impliedAwayProb, null),
    impliedOver25:         safeNum(fv.impliedOver25, null),
    impliedOver15:         safeNum(fv.impliedOver15, null),
    impliedBttsYes:        safeNum(fv.impliedBttsYes, null),
    fixtureDate:           fv.fixtureDate || null,
  };
}

export { flattenFeatureVector };
