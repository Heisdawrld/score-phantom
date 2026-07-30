import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRecommendation,
  findSafetyFallback,
} from '../src/engine/recommendationPolicy.js';

const strongContext = {
  features: {
    dataCompletenessScore: 0.82,
    matchChaosScore: 0.24,
    upsetRiskScore: 0.28,
    lineupCertaintyScore: 0.80,
  },
  script: { volatilityScore: 0.24 },
  confidence: { model: 'HIGH' },
  valueTier: {
    tier: 'STRONG',
    tierDescription: 'High confidence with fair odds',
  },
  challengeRecommendation: 'PASS',
};

function candidate(overrides = {}) {
  return {
    marketKey: 'home_win',
    selection: 'Home Win',
    modelProbability: 0.68,
    bookmakerOdds: 1.75,
    edge: 0.10,
    finalScore: 0.62,
    tacticalFitScore: 0.72,
    ...overrides,
  };
}

test('unpriced model direction can only be WATCH, never BET', () => {
  const decision = evaluateRecommendation(
    candidate({
      bookmakerOdds: null,
      impliedProbability: null,
      edge: null,
      modelOnly: true,
    }),
    {
      ...strongContext,
      valueTier: {
        tier: 'UNPRICED',
        tierDescription: 'No bookmaker odds available',
      },
    },
  );

  assert.equal(decision.status, 'WATCH');
  assert.equal(decision.reasonCode, 'WAIT_FOR_PRICE');
  assert.equal(decision.metrics.hasCapturedPrice, false);
});

test('negative expected value is a SKIP even when the direction looks plausible', () => {
  const decision = evaluateRecommendation(
    candidate({
      modelProbability: 0.55,
      bookmakerOdds: 1.50,
      edge: -0.11,
    }),
    {
      ...strongContext,
      valueTier: {
        tier: 'NEGATIVE_EV',
        tierDescription: 'The price is negative expected value',
      },
    },
  );

  assert.equal(decision.status, 'SKIP');
  assert.equal(decision.reasonCode, 'NEGATIVE_EV');
});

test('captured positive value with strong evidence becomes BET', () => {
  const decision = evaluateRecommendation(candidate(), strongContext);

  assert.equal(decision.status, 'BET');
  assert.ok(['STANDARD', 'HIGH'].includes(decision.convictionTier));
  assert.ok(decision.metrics.ev > decision.requiredEv);
});

test('high match risk forces an aggressive market to safety', () => {
  const decision = evaluateRecommendation(
    candidate({
      marketKey: 'away_win',
      modelProbability: 0.68,
      bookmakerOdds: 1.90,
      edge: 0.12,
    }),
    {
      ...strongContext,
      features: {
        ...strongContext.features,
        matchChaosScore: 0.78,
        upsetRiskScore: 0.82,
      },
      script: { volatilityScore: 0.80 },
    },
  );

  assert.equal(decision.status, 'SKIP');
  assert.equal(decision.reasonCode, 'HIGH_MATCH_RISK');
});

test('only an exceptional, fully supported signal reaches MAX conviction', () => {
  const decision = evaluateRecommendation(
    candidate({
      modelProbability: 0.76,
      bookmakerOdds: 1.70,
      edge: 0.17,
      finalScore: 0.72,
      tacticalFitScore: 0.86,
    }),
    strongContext,
  );

  assert.equal(decision.status, 'BET');
  assert.equal(decision.convictionTier, 'MAX');
  assert.equal(decision.reasonCode, 'MAX_CONVICTION');
});

test('safety fallback prefers a qualified lower-risk BET over a weak original angle', () => {
  const original = candidate({
    marketKey: 'home_win',
    modelProbability: 0.65,
    bookmakerOdds: 1.55,
    edge: 0.005,
    finalScore: 0.56,
  });
  const safeBet = candidate({
    marketKey: 'over_15',
    selection: 'Over 1.5 Goals',
    modelProbability: 0.76,
    bookmakerOdds: 1.45,
    edge: 0.07,
    finalScore: 0.65,
  });
  const riskyAlternative = candidate({
    marketKey: 'away_win',
    selection: 'Away Win',
    modelProbability: 0.70,
    bookmakerOdds: 2.10,
    edge: 0.22,
    finalScore: 0.66,
  });

  const fallback = findSafetyFallback(
    original,
    [original, riskyAlternative, safeBet],
    strongContext,
  );

  assert.ok(fallback);
  assert.equal(fallback.candidate.marketKey, 'over_15');
  assert.equal(fallback.decision.status, 'BET');
});
