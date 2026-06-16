import assert from 'node:assert/strict';
import { buildLineupIntelligence } from '../utils/lineupIntelligence.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { adaptResponseFormat } from '../api/responseAdapter.js';

function makePlayers(prefix) {
  return Array.from({ length: 11 }, (_, idx) => ({
    id: `${prefix}-${idx + 1}`,
    name: `${prefix} Player ${idx + 1}`,
    position: idx === 0 ? 'GK' : idx < 5 ? 'CB' : idx < 8 ? 'CM' : 'ST',
  }));
}

const rawLineups = {
  lineups: {
    home: {
      confirmed: true,
      confidence: 92,
      formation: '4-3-3',
      players: makePlayers('Home'),
    },
    away: {
      predicted: true,
      confidence: 68,
      formation: '4-2-3-1',
      players: makePlayers('Away'),
    },
  },
  unavailable_players: {
    home: [
      {
        name: 'Main Striker',
        position: 'ST',
        status: 'injured',
        ai_score: 91,
        stats: { xg: 1.8, assists: 0.4, minutes: 780 },
      },
    ],
    away: [],
  },
};

const lineupIntel = buildLineupIntelligence(rawLineups);
assert.equal(lineupIntel.bothConfirmed, false);
assert.equal(lineupIntel.home.status, 'confirmed');
assert.equal(lineupIntel.away.status, 'predicted');
assert.ok(lineupIntel.home.attackAbsenceScore > 0.45);
assert.ok(lineupIntel.home.keyAbsenceReasons[0].includes('Main Striker'));

const candidate = {
  marketKey: 'home_win',
  selection: 'HOME',
  modelProbability: 0.61,
  impliedProbability: 0.53,
  edge: 0.08,
  bookmakerOdds: 1.92,
  finalScore: 0.58,
};

const baseFeatureVector = {
  dataCompletenessScore: 0.72,
  matchChaosScore: 0.28,
  upsetRiskScore: 0.31,
  homePointsLast5: 11,
  awayPointsLast5: 5,
  homeAttackAbsenceScore: 0,
  awayAttackAbsenceScore: 0,
  homeDefenseAbsenceScore: 0,
  awayDefenseAbsenceScore: 0,
  homeGoalkeeperAbsenceScore: 0,
  awayGoalkeeperAbsenceScore: 0,
  homeLineupConfidence: 0.92,
  awayLineupConfidence: 0.92,
  lineupCertaintyScore: 0.92,
  homeLineupStatus: 'confirmed',
  awayLineupStatus: 'confirmed',
  homeKeyAbsenceReasons: [],
  awayKeyAbsenceReasons: [],
  leagueId: null,
  tournamentName: 'Test League',
};

const cleanScore = scoreMarketCandidates([candidate], { primary: 'dominant_home_pressure' }, baseFeatureVector, {}, null, null)[0];
const damagedScore = scoreMarketCandidates([
  {
    ...candidate,
    lineupIntelligence: lineupIntel,
  },
], { primary: 'dominant_home_pressure' }, {
  ...baseFeatureVector,
  homeAttackAbsenceScore: lineupIntel.home.attackAbsenceScore,
  homeLineupConfidence: lineupIntel.home.confidence,
  awayLineupConfidence: lineupIntel.away.confidence,
  lineupCertaintyScore: lineupIntel.certaintyScore,
  homeLineupStatus: lineupIntel.home.status,
  awayLineupStatus: lineupIntel.away.status,
  homeKeyAbsenceReasons: lineupIntel.home.keyAbsenceReasons,
  awayKeyAbsenceReasons: lineupIntel.away.keyAbsenceReasons,
  lineupIntelligence: lineupIntel,
}, {}, null, null)[0];

assert.ok(damagedScore.finalScore < cleanScore.finalScore);
assert.equal(damagedScore.homeLineupStatus, 'confirmed');

const adapted = adaptResponseFormat({
  fixtureId: 'fixture-test',
  script: { primary: 'dominant_home_pressure', volatilityScore: 0.25 },
  expectedGoals: { home: 1.6, away: 0.8, total: 2.4 },
  calibratedProbs: { homeWin: 0.57, draw: 0.24, awayWin: 0.19 },
  bestPick: {
    ...damagedScore,
    advisor_status: 'ACCA',
    lineupIntelligence: lineupIntel,
  },
  features: {
    dataCompletenessScore: 0.72,
    enrichmentTier: 'good',
    lineupCertaintyScore: lineupIntel.certaintyScore,
    homeLineupConfidence: lineupIntel.home.confidence,
    awayLineupConfidence: lineupIntel.away.confidence,
    homeLineupStatus: lineupIntel.home.status,
    awayLineupStatus: lineupIntel.away.status,
    homeKeyAbsenceReasons: lineupIntel.home.keyAbsenceReasons,
    awayKeyAbsenceReasons: lineupIntel.away.keyAbsenceReasons,
    homeMatchesAvailable: 5,
    awayMatchesAvailable: 5,
  },
}, 'Home FC', 'Away FC');

assert.equal(adapted.predictions.recommendation.lineupIntelligence.home.status, 'confirmed');
assert.ok(adapted.predictions.recommendation.lineupIntelligence.home.keyAbsenceReasons[0].includes('Main Striker'));

console.log('ok');
