import { clamp } from '../utils/math.js';

const LEAGUE_AVG_GOALS_SCORED   = 1.25;
const LEAGUE_AVG_GOALS_CONCEDED = 1.25;
const LEAGUE_BTTS_RATE          = 0.46;
const LEAGUE_CLEAN_SHEET_RATE   = 0.28;
const LEAGUE_SCORE_SUCCESS_RATE = 0.70;

function boostContrib(value, baseline, scale, maxEffect) {
  if (value == null || baseline === 0) return 0;
  const relDiff = (value - baseline) / baseline;
  return clamp(relDiff * scale, -maxEffect, maxEffect);
}

function qualityScale(completenessScore, matchesAvailable) {
  if ((matchesAvailable ?? 0) < 3) return 0;
  let base;
  if (completenessScore == null)       base = 0.5;
  else if (completenessScore >= 0.55)  base = 1.0;
  else if (completenessScore >= 0.35)  base = 0.7;
  else                                 base = 0.4;
  if ((matchesAvailable ?? 0) < 5) base *= 0.65;
  return base;
}

function memoryScale(reliability, dataCompletenessScore) {
  const r = clamp(Number(reliability || 0), 0, 1);
  const d = clamp(Number(dataCompletenessScore ?? 0.5), 0.35, 1);
  return clamp(r * d, 0, 0.85);
}

export function computeFormDerivedBoosts(fv) {
  const {
    homeAvgScored,
    awayAvgScored,
    homeAvgConceded,
    awayAvgConceded,
    homeFailedToScoreRate,
    awayFailedToScoreRate,
    homeBttsRate,
    awayBttsRate,
    homeProfileBttsRate,
    awayProfileBttsRate,
    homeProfileCleanSheetRate,
    awayProfileCleanSheetRate,
    homeMatchesAvailable,
    awayMatchesAvailable,
    homeAvgXgFor,
    awayAvgXgFor,
    homeAttackers,
    awayAttackers,
    dataCompletenessScore,
    homeLastMatchAttackSignal,
    awayLastMatchAttackSignal,
    homeLastMatchDefenseSignal,
    awayLastMatchDefenseSignal,
    homeLastMatchVolatilitySignal,
    awayLastMatchVolatilitySignal,
    homeLastMatchReliability,
    awayLastMatchReliability,
    homeLastMatchLabel,
    awayLastMatchLabel,
  } = fv;

  const homeQScale = qualityScale(dataCompletenessScore, homeMatchesAvailable);
  const awayQScale = qualityScale(dataCompletenessScore, awayMatchesAvailable);

  const homeGoalsScoredBoost = boostContrib(homeAvgScored, LEAGUE_AVG_GOALS_SCORED, 0.35, 0.12);
  const homeScoreSuccessRate = homeFailedToScoreRate != null ? 1 - homeFailedToScoreRate : null;
  const homeConsistencyBoost = boostContrib(homeScoreSuccessRate, LEAGUE_SCORE_SUCCESS_RATE, 0.28, 0.08);
  const homeBttsSignal = boostContrib(homeProfileBttsRate ?? homeBttsRate, LEAGUE_BTTS_RATE, 0.22, 0.07);
  const homeLuckDiff = homeAvgXgFor != null && homeAvgScored != null ? homeAvgScored - homeAvgXgFor : 0;
  const homeLuckRegression = boostContrib(homeLuckDiff, 1.0, -0.40, 0.10);

  let homeAttackBoost = 0;
  if (homeQScale > 0) {
    homeAttackBoost = clamp(homeGoalsScoredBoost + homeConsistencyBoost + homeBttsSignal + homeLuckRegression, -0.20, 0.20) * homeQScale;
  }

  const awayGoalsScoredBoost = boostContrib(awayAvgScored, LEAGUE_AVG_GOALS_SCORED, 0.35, 0.12);
  const awayScoreSuccessRate = awayFailedToScoreRate != null ? 1 - awayFailedToScoreRate : null;
  const awayConsistencyBoost = boostContrib(awayScoreSuccessRate, LEAGUE_SCORE_SUCCESS_RATE, 0.28, 0.08);
  const awayBttsSignal = boostContrib(awayProfileBttsRate ?? awayBttsRate, LEAGUE_BTTS_RATE, 0.22, 0.07);
  const awayLuckDiff = awayAvgXgFor != null && awayAvgScored != null ? awayAvgScored - awayAvgXgFor : 0;
  const awayLuckRegression = boostContrib(awayLuckDiff, 1.0, -0.40, 0.10);

  let awayAttackBoost = 0;
  if (awayQScale > 0) {
    awayAttackBoost = clamp(awayGoalsScoredBoost + awayConsistencyBoost + awayBttsSignal + awayLuckRegression, -0.20, 0.20) * awayQScale;
  }

  let homeDefLeaky = 0;
  if (homeQScale > 0) {
    const homeLeakyRaw = boostContrib(homeAvgConceded, LEAGUE_AVG_GOALS_CONCEDED, 0.30, 0.10);
    const homeCsSignal = boostContrib(homeProfileCleanSheetRate, LEAGUE_CLEAN_SHEET_RATE, -0.25, 0.07);
    homeDefLeaky = clamp(homeLeakyRaw + homeCsSignal, -0.15, 0.15) * homeQScale;
  }

  let awayDefLeaky = 0;
  if (awayQScale > 0) {
    const awayLeakyRaw = boostContrib(awayAvgConceded, LEAGUE_AVG_GOALS_CONCEDED, 0.30, 0.10);
    const awayCsSignal = boostContrib(awayProfileCleanSheetRate, LEAGUE_CLEAN_SHEET_RATE, -0.25, 0.07);
    awayDefLeaky = clamp(awayLeakyRaw + awayCsSignal, -0.15, 0.15) * awayQScale;
  }

  const homeMemScale = memoryScale(homeLastMatchReliability, dataCompletenessScore);
  const awayMemScale = memoryScale(awayLastMatchReliability, dataCompletenessScore);
  const homeMemoryAttackBoost = clamp(Number(homeLastMatchAttackSignal || 0) * homeMemScale, -0.06, 0.06);
  const awayMemoryAttackBoost = clamp(Number(awayLastMatchAttackSignal || 0) * awayMemScale, -0.06, 0.06);
  const homeMemoryDefLeak = clamp(Number(homeLastMatchDefenseSignal || 0) * homeMemScale, -0.06, 0.06);
  const awayMemoryDefLeak = clamp(Number(awayLastMatchDefenseSignal || 0) * awayMemScale, -0.06, 0.06);
  const memoryVolatility = clamp((Number(homeLastMatchVolatilitySignal || 0) * homeMemScale) + (Number(awayLastMatchVolatilitySignal || 0) * awayMemScale), 0, 0.08);

  const homeLineupPenalty = homeAttackers != null && homeAttackers < 2 ? -0.05 : 0;
  const awayLineupPenalty = awayAttackers != null && awayAttackers < 2 ? -0.05 : 0;

  const homeXgBoost = clamp(homeAttackBoost + awayDefLeaky + homeMemoryAttackBoost + awayMemoryDefLeak + homeLineupPenalty, -0.20, 0.20);
  const awayXgBoost = clamp(awayAttackBoost + homeDefLeaky + awayMemoryAttackBoost + homeMemoryDefLeak + awayLineupPenalty, -0.20, 0.20);

  return {
    homeXgBoost,
    awayXgBoost,
    qScale: Math.max(homeQScale, awayQScale, homeMemScale, awayMemScale),
    memoryVolatility,
    _debug: {
      homeAttackBoost: +homeAttackBoost.toFixed(4),
      awayAttackBoost: +awayAttackBoost.toFixed(4),
      homeDefLeaky: +homeDefLeaky.toFixed(4),
      awayDefLeaky: +awayDefLeaky.toFixed(4),
      homeGoalsScoredBoost:+homeGoalsScoredBoost.toFixed(4),
      awayGoalsScoredBoost:+awayGoalsScoredBoost.toFixed(4),
      homeConsistencyBoost:+homeConsistencyBoost.toFixed(4),
      awayConsistencyBoost:+awayConsistencyBoost.toFixed(4),
      homeBttsSignal:+homeBttsSignal.toFixed(4),
      awayBttsSignal:+awayBttsSignal.toFixed(4),
      homeLuckRegression:+homeLuckRegression.toFixed(4),
      awayLuckRegression:+awayLuckRegression.toFixed(4),
      homeMemoryAttackBoost:+homeMemoryAttackBoost.toFixed(4),
      awayMemoryAttackBoost:+awayMemoryAttackBoost.toFixed(4),
      homeMemoryDefLeak:+homeMemoryDefLeak.toFixed(4),
      awayMemoryDefLeak:+awayMemoryDefLeak.toFixed(4),
      memoryVolatility:+memoryVolatility.toFixed(4),
      homeLastMatchLabel: homeLastMatchLabel || 'unknown',
      awayLastMatchLabel: awayLastMatchLabel || 'unknown',
      homeLineupPenalty:+homeLineupPenalty.toFixed(4),
      awayLineupPenalty:+awayLineupPenalty.toFixed(4),
      homeQScale,
      awayQScale,
      homeMemScale:+homeMemScale.toFixed(4),
      awayMemScale:+awayMemScale.toFixed(4),
      dataSource: 'form-derived+last-match-memory',
    },
  };
}
