import assert from 'node:assert/strict';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { selectBestPickOrAbstain } from '../engine/selectBestPickOrAbstain.js';
import { buildMarketLadder, buildPhantomVerdictPayload } from '../engine/buildPhantomVerdict.js';
import { adaptResponseFormat } from '../api/responseAdapter.js';

const rawProbs = {
  homeWin: 0.42,
  draw: 0.29,
  awayWin: 0.29,
  over15: 0.72,
  under15: 0.28,
  over25: 0.48,
  under25: 0.52,
  over35: 0.24,
  under35: 0.76,
  bttsYes: 0.51,
  bttsNo: 0.49,
};
const impliedOdds = {
  impliedHomeProb: 0.50,
  impliedAwayProb: 0.24,
  impliedOver25: 0.54,
  impliedOver15: 0.78,
  impliedBttsYes: 0.56,
};
const polymarketNoise = {
  odds: {
    '1x2': { home: 0.12, draw: 0.08, away: 0.80 },
    btts: { yes: 0.12, no: 0.88 },
  },
};

const withNoise = calibrateProbabilities(rawProbs, { primary: 'balanced' }, polymarketNoise, impliedOdds);
const withoutNoise = calibrateProbabilities(rawProbs, { primary: 'balanced' }, null, impliedOdds);
assert.deepEqual(withNoise, withoutNoise);

const thinRanked = [
  { marketKey: 'home_win', selection: 'home', modelProbability: 0.66, finalScore: 0.47, edge: 0.015, tacticalFitScore: 0.31, bookmakerOdds: 1.72, impliedProbability: 0.56 },
  { marketKey: 'over_25', selection: 'over_25', modelProbability: 0.64, finalScore: 0.462, edge: 0.014, tacticalFitScore: 0.29, bookmakerOdds: 1.87, impliedProbability: 0.53 },
  { marketKey: 'btts_yes', selection: 'yes', modelProbability: 0.63, finalScore: 0.458, edge: 0.013, tacticalFitScore: 0.27, bookmakerOdds: 1.95, impliedProbability: 0.52 },
];
const thinResult = selectBestPickOrAbstain(thinRanked, { volatilityScore: 0.69 }, {
  dataCompletenessScore: 0.41,
  matchChaosScore: 0.63,
  lineupCertaintyScore: 0.50,
});
assert.equal(thinResult.noSafePick, true);
assert.equal(thinResult.abstainCode, 'THIN_THESIS');

const bestPick = {
  marketKey: 'btts_no',
  selection: 'no',
  modelProbability: 0.61,
  finalScore: 0.59,
  headlineQualityScore: 0.612,
  tacticalFitScore: 0.41,
  bookmakerOdds: 1.8,
  impliedProbability: 0.53,
  edge: 0.08,
  ev: 0.098,
  advisor_status: 'BET',
  valueTier: 'VALUE',
  bestPriceBookmakerName: 'Bet365',
  lineupCertaintyScore: 0.84,
  homeKeyAbsenceReasons: ['Main Striker (attacking outlet, injured)'],
  awayKeyAbsenceReasons: ['Chief Creator (squad loss, doubtful)'],
};
const rankedCandidates = [
  bestPick,
  {
    marketKey: 'under_25',
    selection: 'under_25',
    modelProbability: 0.58,
    finalScore: 0.56,
    headlineQualityScore: 0.581,
    tacticalFitScore: 0.4,
    bookmakerOdds: 1.84,
    impliedProbability: 0.54,
    edge: 0.04,
    ev: 0.067,
    advisor_status: 'ACCA',
    valueTier: 'ACCUMULATOR',
    lineupCertaintyScore: 0.84,
  },
  {
    marketKey: 'home_win',
    selection: 'home',
    modelProbability: 0.57,
    finalScore: 0.53,
    headlineQualityScore: 0.55,
    tacticalFitScore: 0.39,
    bookmakerOdds: 1.92,
    impliedProbability: 0.51,
    edge: 0.06,
    ev: 0.094,
    advisor_status: 'ACCA',
    valueTier: 'VALUE',
    lineupCertaintyScore: 0.84,
  },
];
const features = {
  homeTeam: 'Home FC',
  awayTeam: 'Away FC',
  dataCompletenessScore: 0.72,
  lineupCertaintyScore: 0.84,
  matchChaosScore: 0.32,
};
const narrative = {
  scriptAssessment: 'low_event',
  qualityAssessment: 'home_clearly_better',
};
const reasonChain = {
  shortReasons: [
    'Tight/defensive match expected',
    'BTTS rate 39% supports a no-goals-both-ways angle',
  ],
  analystSummary: 'Both Teams NOT to Score fits the low-event script and best price-adjusted angle.',
};

const marketLadder = buildMarketLadder({ rankedCandidates, bestPick, features, narrative, limit: 4 });
assert.equal(marketLadder.length, 3);
assert.equal(marketLadder[0].pickLabel, 'Both Teams NOT to Score');

const verdict = buildPhantomVerdictPayload({
  bestPick,
  noSafePick: false,
  features,
  narrative,
  reasonChain,
  script: { volatilityScore: 0.31 },
  marketLadder,
});
assert.equal(verdict.status, 'BET');
assert.ok(verdict.headline.includes('ladder'));
assert.ok(verdict.thesis.includes('low-event'));
assert.ok(verdict.support.length >= 2);

const adapted = adaptResponseFormat({
  fixtureId: 'fixture_phase3_validation',
  script: { primary: 'tight_low_event', volatilityScore: 0.31 },
  expectedGoals: { home: 1.12, away: 0.76, total: 1.88 },
  calibratedProbs: {
    homeWin: 0.47,
    draw: 0.28,
    awayWin: 0.25,
    over15: 0.61,
    under15: 0.39,
    over25: 0.34,
    under25: 0.66,
    over35: 0.18,
    under35: 0.82,
    bttsYes: 0.39,
    bttsNo: 0.61,
  },
  bestPick,
  backupPicks: rankedCandidates.slice(1),
  noSafePick: false,
  noSafePickReason: null,
  reasonCodes: [],
  rankedMarkets: rankedCandidates,
  marketLadder,
  phantomVerdict: verdict,
  correctScoreProbs: [],
  features,
  reasonChain,
  narrative,
}, 'Home FC', 'Away FC');

assert.equal(adapted.predictions.recommendation.verdict.status, 'BET');
assert.equal(adapted.predictions.market_ladder[0].pick, 'Both Teams NOT to Score');
assert.equal(adapted.predictions.market_ladder[1].marketFamilyLabel, 'Goals');

console.log('ok');
