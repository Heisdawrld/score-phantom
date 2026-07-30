import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrediction } from '../src/services/predictionSettlement.js';
import { computeProfitUnits } from '../src/storage/profitUnits.js';

test('match-total goals settle from the full-time total', () => {
  assert.equal(evaluatePrediction('over_25', 'Over 2.5 Goals', 2, 1), 'win');
  assert.equal(evaluatePrediction('under_25', 'Under 2.5 Goals', 2, 1), 'loss');
});

test('team goals settle from that team only, never the match total', () => {
  assert.equal(
    evaluatePrediction('home_over_15', 'Home Over 1.5 Goals', 0, 2, 'Home', 'Away'),
    'loss',
  );
  assert.equal(
    evaluatePrediction('away_over_15', 'Away Over 1.5 Goals', 2, 0, 'Home', 'Away'),
    'loss',
  );
  assert.equal(
    evaluatePrediction('home_under_15', 'Home Under 1.5 Goals', 1, 3, 'Home', 'Away'),
    'win',
  );
});

test('win-either-half requires half-time evidence', () => {
  assert.equal(
    evaluatePrediction('win_either_half_home', 'Home Win Either Half', 2, 1, 'Home', 'Away'),
    'void',
  );
  assert.equal(
    evaluatePrediction(
      'win_either_half_home',
      'Home Win Either Half',
      2,
      1,
      'Home',
      'Away',
      { homeHalfTimeScore: 1, awayHalfTimeScore: 0 },
    ),
    'win',
  );
  assert.equal(
    evaluatePrediction(
      'win_either_half_home',
      'Home Win Either Half',
      0,
      2,
      'Home',
      'Away',
      { homeHalfTimeScore: 0, awayHalfTimeScore: 1 },
    ),
    'loss',
  );
});

test('Asian handicap applies the signed line to the selected side', () => {
  assert.equal(evaluatePrediction('ah_home_neg1_5', 'Asian Handicap Home -1.5', 3, 1), 'win');
  assert.equal(evaluatePrediction('ah_home_neg1_5', 'Asian Handicap Home -1.5', 2, 1), 'loss');
  assert.equal(evaluatePrediction('ah_away_1', 'Asian Handicap Away +1', 2, 1), 'void');
  assert.equal(evaluatePrediction('ah_away_1_5', 'Asian Handicap Away +1.5', 2, 1), 'win');
  assert.equal(evaluatePrediction('ah_home_neg1_5', 'Home handicap', 3, 1), 'win');
});

test('DNB, double chance and BTTS settle correctly', () => {
  assert.equal(evaluatePrediction('dnb_home', 'Home Win (DNB)', 1, 1), 'void');
  assert.equal(evaluatePrediction('double_chance_home', 'Double Chance 1X', 1, 1), 'win');
  assert.equal(evaluatePrediction('double_chance_away', 'Double Chance X2', 2, 1), 'loss');
  assert.equal(evaluatePrediction('btts_yes', 'BTTS Yes', 2, 1), 'win');
  assert.equal(evaluatePrediction('btts_no', 'BTTS No', 2, 0), 'win');
});

test('event-stat markets are never guessed from the football score', () => {
  assert.equal(evaluatePrediction('total_corners_over', 'Total Corners Over', 4, 2), 'void');
  assert.equal(evaluatePrediction('red_card_yes', 'Red Card Yes', 4, 2), 'void');
});

test('ROI is calculated only from a captured bookmaker price', () => {
  assert.equal(computeProfitUnits('win', 2, 2), 2);
  assert.equal(computeProfitUnits('loss', 2, 2), -2);
  assert.equal(computeProfitUnits('win', null, 1), null);
  assert.equal(computeProfitUnits('loss', null, 1), null);
  assert.equal(computeProfitUnits('void', null, 1), 0);
});
