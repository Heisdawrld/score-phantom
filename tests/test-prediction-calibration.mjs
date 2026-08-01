import test from 'node:test';
import assert from 'node:assert/strict';

import { calibrateProbabilities } from '../src/probabilities/calibrateProbabilities.js';
import { estimateExpectedGoals } from '../src/probabilities/estimateExpectedGoals.js';
import {
  anchorExpectedGoalsToMarket,
  poissonOver25,
  solveTotalLambdaFromOver25,
} from '../src/probabilities/marketXgAnchor.js';
import { computeLeagueContext } from '../src/features/computeLeagueContext.js';
import { getPredictionEligibility } from '../src/services/predictionEligibility.js';
import { runProbabilityPipeline } from '../src/engine/runProbabilityPipeline.js';

test('Over 2.5 probability and total-lambda conversion are numerical inverses', () => {
  for (const lambda of [1.4, 2.2, 2.7, 3.5, 4.6]) {
    const restored = solveTotalLambdaFromOver25(poissonOver25(lambda));
    assert.ok(Math.abs(restored - lambda) < 1e-7, `${lambda} restored as ${restored}`);
  }
});

test('thin friendly data is anchored more strongly than rich league data', () => {
  const common = {
    impliedOver25: 0.50,
    impliedHomeProb: 0.45,
    impliedAwayProb: 0.30,
    homeMatchesAvailable: 10,
    awayMatchesAvailable: 10,
  };
  const thin = anchorExpectedGoalsToMarket(3.6, 2.4, {
    ...common,
    dataCompletenessScore: 0.45,
    leagueContextSource: 'profiles_only',
    leagueContextReliability: 0.40,
    tournamentName: 'Club Friendlies',
  });
  const rich = anchorExpectedGoalsToMarket(3.6, 2.4, {
    ...common,
    dataCompletenessScore: 0.95,
    leagueContextSource: 'standings+profiles',
    leagueContextReliability: 0.95,
    tournamentName: 'Premier League',
  });
  assert.ok(thin.metadata.totalWeight > rich.metadata.totalWeight);
  assert.ok(thin.homeXg + thin.awayXg < rich.homeXg + rich.awayXg);
});

test('1X2 anchoring moves the xG share toward a strong favourite', () => {
  const result = anchorExpectedGoalsToMarket(1.5, 1.5, {
    impliedHomeProb: 0.72,
    impliedAwayProb: 0.10,
    dataCompletenessScore: 0.60,
    homeMatchesAvailable: 6,
    awayMatchesAvailable: 6,
    leagueContextSource: 'profiles_only',
  });
  assert.ok(result.homeXg / (result.homeXg + result.awayXg) > 0.60);
  assert.ok(result.metadata.sideWeight > 0);
});

test('extreme friendly inputs cannot create a six or seven xG expectation', () => {
  const xg = estimateExpectedGoals({
    homeAvgScored: 4.5,
    awayAvgScored: 3.8,
    homeAvgConceded: 3.2,
    awayAvgConceded: 3.5,
    homeMatchesAvailable: 10,
    awayMatchesAvailable: 10,
    leagueAvgGoalsPerTeam: 1.55,
    leagueAvgGoalsPerGame: 3.10,
    leagueOver25Rate: 0.72,
    leagueOver35Rate: 0.48,
    dataCompletenessScore: 0.55,
    leagueContextSource: 'profiles_only',
    leagueContextReliability: 0.42,
    tournamentName: 'Club Friendlies',
    impliedOver25: 0.51,
    impliedHomeProb: 0.50,
    impliedAwayProb: 0.25,
  }, { primary: 'open_end_to_end' });

  assert.ok(xg.totalExpectedGoals <= 4.25, `total xG was ${xg.totalExpectedGoals}`);
  assert.ok(xg.marketAnchor?.applied);
  assert.ok(xg.homeExpectedGoals > xg.awayExpectedGoals);
});

test('profile-only league context is shrunk toward the global prior', () => {
  const profile = {
    matchesAnalyzed: 10,
    bttsRate: 0.80,
    over25Rate: 0.85,
    over35Rate: 0.65,
    cleanSheetRate: 0.10,
  };
  const context = computeLeagueContext([], profile, profile);
  assert.equal(context._source, 'profiles_only');
  assert.ok(context.leagueOver25Rate < 0.70, `O2.5 rate was ${context.leagueOver25Rate}`);
  assert.ok(context.leagueAvgGoalsPerGame < 3.25, `GPG was ${context.leagueAvgGoalsPerGame}`);
  assert.ok(context._reliability < 0.70);
});

test('thin-data probability calibration respects extreme bookmaker disagreement', () => {
  const raw = {
    homeWin: 0.22,
    draw: 0.18,
    awayWin: 0.60,
    over15: 0.97,
    under15: 0.03,
    over25: 0.93,
    under25: 0.07,
    over35: 0.75,
    under35: 0.25,
    bttsYes: 0.88,
    bttsNo: 0.12,
  };
  const market = {
    impliedHomeProb: 0.70,
    impliedAwayProb: 0.10,
    impliedOver25: 0.51,
    impliedOver15: 0.72,
    impliedBttsYes: 0.52,
  };
  const calibrated = calibrateProbabilities(raw, { primary: '' }, null, market, {
    dataCompletenessScore: 0.45,
    homeMatchesAvailable: 4,
    awayMatchesAvailable: 4,
    leagueContextSource: 'profiles_only',
    leagueContextReliability: 0.40,
    tournamentName: 'Club Friendlies',
  });

  assert.ok(calibrated.over25 < 0.72, `O2.5 remained ${calibrated.over25}`);
  assert.ok(calibrated.homeWin > 0.50, `home win remained ${calibrated.homeWin}`);
  assert.ok(Math.abs(calibrated.homeWin + calibrated.draw + calibrated.awayWin - 1) < 0.01);
  assert.ok(Math.abs(calibrated.over25 + calibrated.under25 - 1) < 0.001);
});

test('prediction builds close at kickoff even when provider status is stale', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  const before = getPredictionEligibility({
    match_status: 'NS',
    match_date: '2026-08-01T12:01:00.000Z',
  }, now);
  const after = getPredictionEligibility({
    match_status: 'NS',
    match_date: '2026-08-01T11:59:00.000Z',
  }, now);
  assert.equal(before.canBuild, true);
  assert.equal(after.canBuild, false);
  assert.equal(after.reason, 'KICKOFF_REACHED');
});

test('live and final statuses close prediction builds regardless of kickoff value', () => {
  const future = '2026-08-02T12:00:00.000Z';
  for (const status of ['1H', 'HT', '2H', 'LIVE', 'FT', 'AET', 'PEN', 'CANC']) {
    const result = getPredictionEligibility({ match_status: status, match_date: future }, 0);
    assert.equal(result.canBuild, false, `${status} should be locked`);
    assert.equal(result.reason, 'MATCH_ALREADY_STARTED');
  }
});

test('missing or invalid kickoff data fails closed', () => {
  for (const match_date of [null, '', 'not-a-date']) {
    const result = getPredictionEligibility({ match_status: 'NS', match_date }, Date.now());
    assert.equal(result.canBuild, false);
    assert.equal(result.reason, 'INVALID_KICKOFF');
  }
});

test('final market calibration cannot be undone by an extreme ensemble member', () => {
  const features = {
    homeAvgScored: 1.45,
    homeAvgConceded: 1.20,
    awayAvgScored: 1.25,
    awayAvgConceded: 1.35,
    homeMatchesAvailable: 6,
    awayMatchesAvailable: 6,
    leagueAvgGoalsPerTeam: 1.35,
    leagueAvgGoalsPerGame: 2.70,
    leagueOver25Rate: 0.50,
    leagueOver35Rate: 0.30,
    dataCompletenessScore: 0.55,
    leagueContextSource: 'profiles_only',
    leagueContextReliability: 0.45,
    impliedOver25: 0.50,
    impliedHomeProb: 0.46,
    impliedAwayProb: 0.29,
    impliedBttsYes: 0.50,
    bsdPrediction: {
      homeWinProb: 0.10,
      drawProb: 0.10,
      awayWinProb: 0.80,
      over15Prob: 0.99,
      over25Prob: 0.99,
      over35Prob: 0.95,
      bttsYesProb: 0.95,
      modelConfidence: 0.90,
    },
  };
  const result = runProbabilityPipeline(features, { primary: '', secondary: null }, null);
  assert.ok(result.ensembleMeta.active);
  assert.ok(result.calibratedProbs.over25 < 0.70, `O2.5 was ${result.calibratedProbs.over25}`);
  assert.ok(result.calibratedProbs.over35 <= result.calibratedProbs.over25);
});
