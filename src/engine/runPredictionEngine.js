import { safeNum, clamp } from '../utils/math.js';
import { normalizeFixture } from '../data/normalizeFixture.js';
import { buildFeatureVector } from '../features/buildFeatureVector.js';
import { classifyMatchScript } from '../scripts/classifyMatchScript.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { buildMarketCandidates } from '../markets/buildMarketCandidates.js';
import { computeImpliedProbabilities } from '../markets/computeImpliedProbabilities.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { applyMarketFilters } from '../markets/applyMarketFilters.js';
import { rankMarkets } from '../markets/rankMarkets.js';
import { selectBestPick } from './selectBestPick.js';
import { buildConfidenceProfile } from './buildConfidenceProfile.js';
import { buildReasonCodes } from './buildReasonCodes.js';
import { savePrediction } from '../storage/savePrediction.js';

/**
 * Flatten the nested feature vector from buildFeatureVector into a flat
 * object used by all downstream engine modules.
 */
function flattenFeatureVector(fv) {
  const ts = fv.teamStrength || {};
  const hf = fv.homeFormFeatures || {};
  const af = fv.awayFormFeatures || {};
  const sf = fv.splitFeatures || {};
  const h2h = fv.h2hFeatures || {};
  const vf = fv.volatilityFeatures || {};
  const cf = fv.contextFeatures || {};
  const tc = fv.tableContext || {};

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

  // Defensive weakness 0-1 scale
  const homeDefensiveWeakness = clamp(homeAvgConceded / 2.5, 0, 1);
  const awayDefensiveWeakness = clamp(awayAvgConceded / 2.5, 0, 1);

  // Attack rating 0-1 normalized (raw can be 0-3)
  const homeAttackRating01 = clamp(homeAttackRating / 2.0, 0, 1);
  const awayAttackRating01 = clamp(awayAttackRating / 2.0, 0, 1);

  // Weighted points
  const homeWeightedPts = safeNum(hf.weighted_points_per_match, 1.2);
  const awayWeightedPts = safeNum(af.weighted_points_per_match, 1.0);

  // Last 5 points (approximate)
  const homePointsLast5 = safeNum(hf.points_last5, homeWeightedPts * 5);
  const awayPointsLast5 = safeNum(af.points_last5, awayWeightedPts * 5);

  // Failed to score rate
  const homeFailedToScoreRate = 1 - safeNum(hf.scored_over_0_5_rate, 0.7);
  const awayFailedToScoreRate = 1 - safeNum(af.scored_over_0_5_rate, 0.65);

  // H2H
  const h2hBttsRate = h2h.btts_rate != null ? safeNum(h2h.btts_rate) : null;
  const h2hAvgGoals = h2h.avg_total_goals != null ? safeNum(h2h.avg_total_goals) : null;
  const h2hOver25Rate = h2h.over_2_5_rate != null ? safeNum(h2h.over_2_5_rate) : null;

  // BTTS rates
  const homeBttsRate = safeNum(hf.btts_rate, 0.45);
  const awayBttsRate = safeNum(af.btts_rate, 0.45);
  const combinedBttsRate = (homeBttsRate + awayBttsRate) / 2;

  return {
    fixtureId: fv.fixtureId,
    homeTeam: fv.homeTeam,
    awayTeam: fv.awayTeam,

    // Team strength
    homeBaseRating,
    awayBaseRating,
    homeAttackRating,
    awayAttackRating,
    homeDefenseRating,
    awayDefenseRating,
    homeStrengthGap: homeBaseRating - awayBaseRating,
    awayStrengthGap: awayBaseRating - homeBaseRating,

    // Derived weakness/attack 0-1
    homeDefensiveWeakness,
    awayDefensiveWeakness,
    homeAttackRating01,
    awayAttackRating01,

    // Form averages (raw goals)
    homeAvgScored,
    homeAvgConceded,
    awayAvgScored,
    awayAvgConceded,

    homeWinRate: safeNum(hf.win_rate, 0.4),
    awayWinRate: safeNum(af.win_rate, 0.35),

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

    // Split/venue stats
    homeHomeGoalsFor: sf.homeHomeGoalsFor != null ? safeNum(sf.homeHomeGoalsFor) : null,
    homeHomeGoalsAgainst: sf.homeHomeGoalsAgainst != null ? safeNum(sf.homeHomeGoalsAgainst) : null,
    homeHomeWinRate: sf.homeHomeWinRate != null ? safeNum(sf.homeHomeWinRate) : null,
    awayAwayGoalsFor: sf.awayAwayGoalsFor != null ? safeNum(sf.awayAwayGoalsFor) : null,
    awayAwayGoalsAgainst: sf.awayAwayGoalsAgainst != null ? safeNum(sf.awayAwayGoalsAgainst) : null,
    awayAwayWinRate: sf.awayAwayWinRate != null ? safeNum(sf.awayAwayWinRate) : null,

    // H2H
    h2hBttsRate,
    h2hAvgGoals,
    h2hOver25Rate,
    h2hMatchesAvailable: safeNum(h2h.matches_available, 0),

    // Volatility
    homeFormVariance: safeNum(vf.homeFormVariance, 0),
    awayFormVariance: safeNum(vf.awayFormVariance, 0),
    upsetRiskScore: safeNum(vf.upsetRiskScore, 0.5),
    dataCompletenessScore: safeNum(vf.dataCompletenessScore, 0.5),
    matchChaosScore: safeNum(vf.matchChaosScore, 0.5),

    // Context
    homeMotivationScore: safeNum(cf.homeMotivationScore, 0.5),
    awayMotivationScore: safeNum(cf.awayMotivationScore, 0.5),
    rotationRiskHome: safeNum(cf.rotationRiskHome, 0),
    rotationRiskAway: safeNum(cf.rotationRiskAway, 0),

    // Table context
    homePosition: safeNum(tc.home_position, 10),
    awayPosition: safeNum(tc.away_position, 10),
    pointsGap: safeNum(tc.points_gap, 0),
    positionGap: safeNum(tc.position_gap, 0),
    homeContext: tc.home_context || 'midtable',
    awayContext: tc.away_context || 'midtable',
  };
}

/**
 * Main prediction engine orchestrator.
 *
 * @param {string} fixtureId
 * @param {object} rawData - data bundle from ensureFixtureData
 * @param {object} recentMarkets - { [marketKey]: count } of recently used markets
 * @returns {object} full prediction result
 */
export async function runPredictionEngine(fixtureId, rawData, recentMarkets = {}) {
  try {
    // Step 1: Normalize fixture
    const normalized = normalizeFixture(rawData);
    const homeTeamName = normalized.homeTeamName || rawData?.fixture?.home_team_name || '';
    const awayTeamName = normalized.awayTeamName || rawData?.fixture?.away_team_name || '';
    const odds = normalized.odds;

    // Step 2: Build feature vector (DB-backed)
    const rawFeatures = await buildFeatureVector(fixtureId, homeTeamName, awayTeamName, odds);

    // Flatten nested feature vector to flat structure
    const features = flattenFeatureVector(rawFeatures);

    // Step 3: Classify match script
    const script = classifyMatchScript(features);

    // Step 4: Estimate expected goals
    const xg = estimateExpectedGoals(features, script);

    // Step 5: Build score matrix
    const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);

    // Step 6: Derive raw market probabilities
    const rawProbs = deriveMarketProbabilities(scoreMatrix);

    // Step 7: Calibrate probabilities
    const calibratedProbs = calibrateProbabilities(rawProbs, script);

    // Step 8: Build market candidates
    const candidates = buildMarketCandidates(calibratedProbs, odds);

    // Step 9: Compute implied probabilities + edge from bookmaker odds
    const candidatesWithEdge = computeImpliedProbabilities(candidates, odds);

    // Step 10: Score candidates
    const scoredCandidates = scoreMarketCandidates(candidatesWithEdge, script, features, recentMarkets);

    // Step 11: Filter weak candidates
    const filteredCandidates = applyMarketFilters(scoredCandidates);

    // Step 12: Rank candidates
    const rankedCandidates = rankMarkets(filteredCandidates);

    // Step 13: Select best pick
    const { bestPick, backupPicks, noSafePick, noSafePickReason } = selectBestPick(
      rankedCandidates,
      script,
      features
    );

    // Step 14: Build confidence profile
    const confidence = buildConfidenceProfile(bestPick, features);

    // Step 15: Build reason codes
    const reasonCodes = buildReasonCodes(features, script);

    const result = {
      fixtureId,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      script: {
        primary: script.primary,
        secondary: script.secondary,
        confidence: script.confidence,
        homeControlScore: script.homeControlScore,
        awayControlScore: script.awayControlScore,
        eventLevelScore: script.eventLevelScore,
        volatilityScore: script.volatilityScore,
      },
      expectedGoals: {
        home: xg.homeExpectedGoals,
        away: xg.awayExpectedGoals,
        total: xg.totalExpectedGoals,
      },
      bestPick,
      backupPicks,
      noSafePick,
      noSafePickReason: noSafePickReason || null,
      confidence,
      reasonCodes,
      rankedMarkets: rankedCandidates,
      updatedAt: new Date().toISOString(),
    };

    // Step 16: Save prediction
    await savePrediction(result).catch(err =>
      console.error('[runPredictionEngine] Save failed:', err.message)
    );

    return result;
  } catch (err) {
    console.error('[runPredictionEngine] Error:', err.message, err.stack);
    // Return a safe fallback so callers don't crash
    return {
      fixtureId,
      error: err.message,
      noSafePick: true,
      noSafePickReason: 'Engine error: ' + err.message,
      script: { primary: 'chaotic_unreliable', confidence: 0 },
      expectedGoals: { home: 1.2, away: 1.0, total: 2.2 },
      bestPick: null,
      backupPicks: [],
      confidence: { model: 'low', value: 'low', volatility: 'high' },
      reasonCodes: [],
      rankedMarkets: [],
      updatedAt: new Date().toISOString(),
    };
  }
}
