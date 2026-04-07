import { safeNum, clamp } from '../utils/math.js';

export function computeContextFeatures(tableContext, standings = [], restData = {}) {
  const tc = tableContext || {};
  const totalTeams = standings.length || 20;
  const homePos = safeNum(tc.home_position, 10);
  const awayPos = safeNum(tc.away_position, 10);
  const homeCtx = tc.home_context || 'midtable';
  const awayCtx = tc.away_context || 'midtable';

  function motivationScore(ctx, position) {
    if (ctx === 'relegation') return 0.9;
    if (ctx === 'title') return 0.85;
    if (ctx === 'ucl') return 0.75;
    if (ctx === 'danger') return 0.8;
    if (ctx === 'europe') return 0.65;
    return 0.5;
  }

  // Rest day differential - MUST be declared before motivationScore usage
  const restDiffDays = restData.restDiffDays != null ? restData.restDiffDays : 0;
  const homeRestDays = restData.homeRestDays != null ? restData.homeRestDays : null;
  const awayRestDays = restData.awayRestDays != null ? restData.awayRestDays : null;
  const homeRestBonus = restDiffDays > 4 ? 0.05 : restDiffDays < -4 ? -0.04 : 0;
  const awayRestBonus = restDiffDays < -4 ? 0.05 : restDiffDays > 4 ? -0.04 : 0;

  const homeMotivationScore = Math.min(1, motivationScore(homeCtx, homePos) + homeRestBonus);
  const awayMotivationScore = Math.min(1, motivationScore(awayCtx, awayPos) + awayRestBonus);

  const titleRacePressure = (homeCtx === 'title' || awayCtx === 'title') ? 0.8 : 0;
  const relegationPressure = (homeCtx === 'relegation' || awayCtx === 'relegation') ? 0.8 : 0;

  const rotationRiskHome = 0;
  const rotationRiskAway = 0;
  const cupDistractionHome = 0;
  const cupDistractionAway = 0;

  return {
    homeMotivationScore: parseFloat(homeMotivationScore.toFixed(2)),
    awayMotivationScore: parseFloat(awayMotivationScore.toFixed(2)),
    titleRacePressure: parseFloat(titleRacePressure.toFixed(2)),
    relegationPressure: parseFloat(relegationPressure.toFixed(2)),
    rotationRiskHome,
    rotationRiskAway,
    cupDistractionHome,
    cupDistractionAway,
    restDiffDays,
  };
}
