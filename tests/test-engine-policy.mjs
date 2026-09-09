import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyValueTier } from '../src/markets/valueTiers.js';
import { computeImpliedProbabilities } from '../src/markets/computeImpliedProbabilities.js';
import { selectBestPickOrAbstain } from '../src/engine/selectBestPickOrAbstain.js';
import { calibrateFromHistory } from '../src/probabilities/calibrateFromHistory.js';
import { getMarketProbability } from '../src/probabilities/getMarketProbability.js';

test('STRONG value tier is reachable before broader tiers', () => {
  const result = classifyValueTier({
    marketKey: 'home_win',
    modelProbability: 0.70,
    bookmakerOdds: 1.80,
    impliedProbability: 0.54,
    edge: 0.16,
  });
  assert.equal(result.tier, 'STRONG');
});

test('candidate edge uses vig-free implied probabilities when a full market exists', () => {
  const candidates = [
    { marketKey: 'home_win', modelProbability: 0.55 },
    { marketKey: 'draw', modelProbability: 0.25 },
    { marketKey: 'away_win', modelProbability: 0.20 },
    { marketKey: 'over_25', modelProbability: 0.58 },
    { marketKey: 'under_25', modelProbability: 0.42 },
  ];
  const priced = computeImpliedProbabilities(candidates, {
    home: 1.91,
    draw: 3.60,
    away: 4.20,
    over_25: 1.95,
    under_25: 1.95,
  });

  const oneXtwoFairSum = priced
    .filter((candidate) => ['home_win', 'draw', 'away_win'].includes(candidate.marketKey))
    .reduce((sum, candidate) => sum + candidate.impliedProbability, 0);
  assert.ok(Math.abs(oneXtwoFairSum - 1) < 0.001);
  assert.equal(priced.find((candidate) => candidate.marketKey === 'over_25').impliedProbability, 0.5);
  assert.equal(priced.find((candidate) => candidate.marketKey === 'over_25').rawImpliedProbability, 0.5128);
});

test('priced markets outside the headline registry cannot become the main pick', () => {
  const unsupported = {
    marketKey: 'home_over_15',
    selection: 'Home Over 1.5 Goals',
    modelProbability: 0.80,
    finalScore: 0.80,
    tacticalFitScore: 0.90,
    impliedProbability: 0.60,
    bookmakerOdds: 1.70,
    edge: 0.20,
  };
  const result = selectBestPickOrAbstain(
    [unsupported],
    { volatilityScore: 0.20 },
    { dataCompletenessScore: 0.90, matchChaosScore: 0.20 },
  );
  assert.equal(result.noSafePick, true);
  assert.equal(result.abstainCode, 'NO_HEADLINE_ELIGIBLE_MARKETS');
});

test('approved priced markets still pass the final headline gate', () => {
  const approved = {
    marketKey: 'home_win',
    selection: 'Home Win',
    modelProbability: 0.72,
    finalScore: 0.70,
    tacticalFitScore: 0.90,
    impliedProbability: 0.55,
    bookmakerOdds: 1.82,
    edge: 0.17,
  };
  const result = selectBestPickOrAbstain(
    [approved],
    { volatilityScore: 0.20 },
    { dataCompletenessScore: 0.90, matchChaosScore: 0.20, upsetRiskScore: 0.20 },
  );
  assert.equal(result.noSafePick, false);
  assert.equal(result.bestPick.marketKey, 'home_win');
});

test('history calibration uses the matching probability band', () => {
  const cache = {
    byProbabilityBand: {
      'over_25::6': { winRate: 0.52, weightedWinRate: 0.54, samples: 120 },
    },
  };
  const calibrated = calibrateFromHistory(
    { over25: 0.65, under25: 0.35 },
    cache,
  );
  assert.ok(calibrated.over25 < 0.65);
  assert.equal(Number((calibrated.over25 + calibrated.under25).toFixed(4)), 1);
});

test('persisted market keys resolve to engine probability keys', () => {
  const probabilities = {
    homeWin: 0.50,
    draw: 0.25,
    awayWin: 0.25,
    over25: 0.61,
  };

  assert.equal(getMarketProbability(probabilities, 'home_win'), 0.50);
  assert.equal(getMarketProbability(probabilities, 'over_25'), 0.61);
  assert.equal(getMarketProbability(probabilities, 'double_chance_home'), 0.75);
  assert.equal(getMarketProbability(probabilities, 'dnb_home'), 2 / 3);
  assert.equal(getMarketProbability(probabilities, 'unknown_market'), null);
});


test('filtered priced markets are distinguished from absent odds, including empty survivors', () => {
  for (const survivors of [[], [{marketKey: 'ah_home_1_5', modelProbability: 0.67, finalScore: 0.43}]]) {
    const result = selectBestPickOrAbstain(survivors, {}, {}, {pricedCandidatesBeforeFiltering: 8});
    assert.equal(result.noSafePick, true);
    assert.equal(result.bestPick, null);
    assert.equal(result.abstainCode, 'PRICED_MARKETS_FILTERED');
    assert.match(result.noSafePickReason, /prices were available/);
  }
});

test('truly unpriced weak markets stay abstained without claiming a provider outage', () => {
  const result = selectBestPickOrAbstain([{marketKey: 'ah_home_1_5', modelProbability: 0.67}], {}, {}, {pricedCandidatesBeforeFiltering: 0});
  assert.equal(result.abstainCode, 'NO_PRICED_MARKETS');
  assert.equal(result.noSafePick, true);
});

import { buildFeatureEvidence } from '../src/engine/featureEvidence.js';
import { lookupOdds } from '../src/markets/computeImpliedProbabilities.js';
test('default form and model estimates are not presented as observed evidence', () => {
  const evidence = buildFeatureEvidence({homePointsLast5: 0, awayPointsLast5: 0}, {homeExpectedGoals: 1.2, awayExpectedGoals: 1});
  assert.equal(evidence.formUsed, false);
  assert.equal(evidence.xgUsed, false);
  assert.equal(evidence.modeledExpectedGoalsAvailable, true);
  const observed = buildFeatureEvidence({homeStatsMatchCount: 10, awayStatsMatchCount: 10, homeAvgXgFor: 0, awayAvgXgFor: 1.1});
  assert.equal(observed.formUsed, true);
  assert.equal(observed.xgUsed, true);
});
test('diagnostic odds lookup uses the same aliases as candidate pricing', () => {
  assert.equal(lookupOdds('home_win', {odds: {home: 1.9}}), 1.9);
  assert.equal(lookupOdds('over_25', {over_under: {over25: 2.1}}), 2.1);
  assert.equal(lookupOdds('away_win', {}), null);
});
