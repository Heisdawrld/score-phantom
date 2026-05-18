import assert from 'node:assert/strict';
import { buildPriceIntelligenceFromComparison, buildPriceIntelligenceFromOddsPayload } from '../utils/priceIntelligence.js';
import { computeImpliedProbabilities } from '../markets/computeImpliedProbabilities.js';
import { adaptResponseFormat } from '../api/responseAdapter.js';
import { extractBestPickFromPredictionJson } from '../utils/predictionJson.js';

const comparison = {
  markets: {
    '1x2': {
      HOME: {
        bet365: 1.85,
        pinnacle: { decimal_odds: 1.91, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
      DRAW: {
        bet365: 3.42,
        pinnacle: { decimal_odds: 3.55, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
      AWAY: {
        bet365: 4.2,
        pinnacle: { decimal_odds: 4.36, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
    },
    over_under_25: {
      over: {
        bet365: 1.86,
        pinnacle: { decimal_odds: 1.95, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
      under: {
        bet365: 1.92,
        pinnacle: { decimal_odds: 1.99, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
    },
    btts: {
      yes: {
        bet365: 1.74,
        pinnacle: { decimal_odds: 1.8, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
      no: {
        bet365: 2.02,
        pinnacle: { decimal_odds: 2.1, bookmaker_slug: 'pinnacle', bookmaker_name: 'Pinnacle' },
      },
    },
  },
};

const priceIntel = buildPriceIntelligenceFromComparison(comparison);
assert.equal(priceIntel.source, 'bsd_comparison');
assert.equal(priceIntel.home_win, 1.91);
assert.equal(priceIntel.over_25, 1.95);
assert.equal(priceIntel.markets.home_win.bookmakerSlug, 'pinnacle');
assert.equal(priceIntel.markets.home_win.quoteCount, 2);
assert.ok(priceIntel.markets.home_win.priceQualityScore > 0.4);
assert.ok(priceIntel.summary.quoteCount >= 6);

const fallbackIntel = buildPriceIntelligenceFromOddsPayload({
  home_win: 1.82,
  draw: 3.4,
  away_win: 4.1,
  over_25: 1.9,
  under_25: 1.95,
  btts_yes: 1.78,
});
assert.equal(fallbackIntel.source, 'bsd_consensus');
assert.equal(fallbackIntel.home_win, 1.82);

const [pricedHome] = computeImpliedProbabilities(
  [{ marketKey: 'home_win', selection: 'Home Win', modelProbability: 0.59, finalScore: 0.66, tacticalFitScore: 0.71 }],
  { home: 1.74 },
  { priceIntelligence: priceIntel, priceQualityScore: priceIntel.summary.priceQualityScore, priceDisagreementScore: priceIntel.summary.disagreementScore },
);

assert.equal(pricedHome.bookmakerOdds, 1.91);
assert.equal(pricedHome.bestPriceBookmakerSlug, 'pinnacle');
assert.ok(pricedHome.edge > 0.06);
assert.ok(pricedHome.priceQualityScore > 0.4);

const adapted = adaptResponseFormat({
  fixtureId: 'fixture_1',
  script: { primary: 'balanced_high_event', volatilityScore: 0.38 },
  expectedGoals: { home: 1.5, away: 1.0, total: 2.5 },
  calibratedProbs: {
    homeWin: 0.59,
    draw: 0.24,
    awayWin: 0.17,
    over15: 0.76,
    under15: 0.24,
    over25: 0.54,
    under25: 0.46,
    over35: 0.29,
    under35: 0.71,
    bttsYes: 0.52,
    bttsNo: 0.48,
  },
  bestPick: {
    ...pricedHome,
    valueTier: 'VALUE',
    valueTierLabel: 'Value',
    ev: 0.1269,
    isAccaEligible: true,
  },
  backupPicks: [],
  allCandidates: [],
  noSafePick: false,
  reasonCodes: [],
  features: { dataCompletenessScore: 0.74 },
  confidence: { model: 'HIGH' },
}, 'Home FC', 'Away FC');

assert.equal(adapted.predictions.recommendation.priceIntelligence.bestPrice, 1.91);
assert.equal(adapted.predictions.recommendation.priceIntelligence.bookmakerSlug, 'pinnacle');
assert.ok(adapted.predictions.recommendation.priceIntelligence.priceQualityScore > 0.4);

const extractedBestPick = extractBestPickFromPredictionJson(JSON.stringify({
  prediction: { fixture: { id: 'fixture_1' } },
  engineResult: { bestPick: { marketKey: 'home_win', selection: 'Home Win' } },
  engineVersion: '3.3.0',
}));
assert.equal(extractedBestPick.marketKey, 'home_win');

console.log('ok');
