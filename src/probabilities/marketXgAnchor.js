import { clamp, safeNum } from '../utils/math.js';

/** Probability of at least three goals for a Poisson total. */
export function poissonOver25(totalLambda) {
  const lambda = clamp(safeNum(totalLambda, 2.7), 0.05, 10);
  return 1 - Math.exp(-lambda) * (1 + lambda + (lambda * lambda) / 2);
}

/** Convert a fair Over 2.5 probability into the equivalent Poisson total. */
export function solveTotalLambdaFromOver25(probability) {
  const target = clamp(safeNum(probability, 0.5), 0.03, 0.97);
  let low = 0.05;
  let high = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (poissonOver25(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function poissonPmf(k, lambda) {
  if (k === 0) return Math.exp(-lambda);
  let value = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) value *= lambda / i;
  return value;
}

function decisiveHomeProbability(totalLambda, homeShare) {
  const homeLambda = totalLambda * homeShare;
  const awayLambda = totalLambda - homeLambda;
  let homeWin = 0;
  let awayWin = 0;
  for (let h = 0; h <= 12; h++) {
    const hp = poissonPmf(h, homeLambda);
    for (let a = 0; a <= 12; a++) {
      const probability = hp * poissonPmf(a, awayLambda);
      if (h > a) homeWin += probability;
      else if (a > h) awayWin += probability;
    }
  }
  const decisive = homeWin + awayWin;
  return decisive > 0 ? homeWin / decisive : 0.5;
}

/** Find the home xG share that matches the fair decisive 1X2 split. */
export function solveHomeShareFrom1X2(totalLambda, homeProbability, awayProbability) {
  const home = safeNum(homeProbability, null);
  const away = safeNum(awayProbability, null);
  if (home == null || away == null || home <= 0 || away <= 0) return null;

  const target = clamp(home / (home + away), 0.04, 0.96);
  let low = 0.08;
  let high = 0.92;
  for (let i = 0; i < 55; i++) {
    const mid = (low + high) / 2;
    if (decisiveHomeProbability(totalLambda, mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function getXgDataReliability(fv = {}) {
  const dataScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const minimumMatches = Math.min(
    safeNum(fv.homeMatchesAvailable, 0),
    safeNum(fv.awayMatchesAvailable, 0),
  );
  const sampleScore = clamp(minimumMatches / 10, 0, 1);
  const source = String(fv.leagueContextSource || 'global_defaults').toLowerCase();
  const sourceScore = source === 'standings+profiles' ? 0.95
    : source === 'standings' ? 0.90
      : source === 'profiles_only' ? 0.52
        : 0.38;
  const contextReliability = clamp(safeNum(fv.leagueContextReliability, sourceScore), 0, 1);

  let reliability = (dataScore * 0.45) + (sampleScore * 0.20) + (contextReliability * 0.35);
  const competition = `${fv.tournamentName || ''} ${fv.categoryName || ''}`.toLowerCase();
  if (competition.includes('friendl')) reliability -= 0.12;
  return clamp(reliability, 0.15, 0.98);
}

function anchorWeight(fv, reliability, disagreement) {
  const source = String(fv.leagueContextSource || '').toLowerCase();
  const competition = `${fv.tournamentName || ''} ${fv.categoryName || ''}`.toLowerCase();
  let weight = 0.18 + ((1 - reliability) * 0.30);
  if (source === 'profiles_only' || source === 'global_defaults') weight += 0.05;
  if (competition.includes('friendl')) weight += 0.07;
  weight += clamp((disagreement - 0.55) * 0.07, 0, 0.08);
  return clamp(weight, 0.18, 0.62);
}

/**
 * Reliability-aware anchoring for the two latent goal rates. The model retains
 * an independent opinion, while thin/friendly data is pulled more strongly
 * toward de-vigged bookmaker prices.
 */
export function anchorExpectedGoalsToMarket(homeXg, awayXg, fv = {}) {
  let home = clamp(safeNum(homeXg, 1.45), 0.05, 20);
  let away = clamp(safeNum(awayXg, 1.20), 0.05, 20);
  const reliability = getXgDataReliability(fv);
  const metadata = {
    applied: false,
    reliability: parseFloat(reliability.toFixed(3)),
    totalWeight: 0,
    sideWeight: 0,
    marketTotalXg: null,
  };

  const impliedOver25 = safeNum(fv.impliedOver25, null);
  if (impliedOver25 != null && impliedOver25 >= 0.08 && impliedOver25 <= 0.92) {
    const currentTotal = home + away;
    const marketTotal = clamp(solveTotalLambdaFromOver25(impliedOver25), 0.65, 5.5);
    const weight = anchorWeight(fv, reliability, Math.abs(currentTotal - marketTotal));
    const anchoredTotal = (currentTotal * (1 - weight)) + (marketTotal * weight);
    const scale = anchoredTotal / currentTotal;
    home *= scale;
    away *= scale;
    metadata.applied = true;
    metadata.totalWeight = parseFloat(weight.toFixed(3));
    metadata.marketTotalXg = parseFloat(marketTotal.toFixed(3));
    console.log(`[xG] Fair-market total anchor: ${currentTotal.toFixed(2)}->${anchoredTotal.toFixed(2)} (market ${marketTotal.toFixed(2)}, weight ${(weight * 100).toFixed(0)}%)`);
  }

  const targetHomeShare = solveHomeShareFrom1X2(home + away, fv.impliedHomeProb, fv.impliedAwayProb);
  if (targetHomeShare != null) {
    const total = home + away;
    const currentShare = home / total;
    const baseWeight = anchorWeight(fv, reliability, Math.abs(currentShare - targetHomeShare) * 4);
    const weight = clamp(baseWeight * 1.05, 0.18, 0.60);
    const anchoredShare = clamp(
      (currentShare * (1 - weight)) + (targetHomeShare * weight),
      0.08,
      0.92,
    );
    home = total * anchoredShare;
    away = total - home;
    metadata.applied = true;
    metadata.sideWeight = parseFloat(weight.toFixed(3));
    console.log(`[xG] Fair-market side anchor: home share ${(currentShare * 100).toFixed(1)}%->${(anchoredShare * 100).toFixed(1)}% (target ${(targetHomeShare * 100).toFixed(1)}%)`);
  }

  return { homeXg: home, awayXg: away, metadata };
}
