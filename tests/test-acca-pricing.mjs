import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePickOdds } from '../src/engine/accaPricing.js';

test('ACCA pricing prefers the exact captured price for the selected market', () => {
  assert.equal(
    resolvePickOdds({
      best_pick_market: 'dnb_home',
      captured_pick_odds: 1.48,
      odds_home: 1.72,
    }),
    1.48,
  );
});

test('DNB never borrows the 1X2 home or away price', () => {
  assert.equal(
    resolvePickOdds({
      best_pick_market: 'dnb_home',
      odds_home: 1.72,
    }),
    null,
  );
  assert.equal(
    resolvePickOdds({
      best_pick_market: 'dnb_away',
      odds_away: 2.10,
    }),
    null,
  );
});

test('double chance requires its own market price and is never synthesized', () => {
  assert.equal(
    resolvePickOdds({
      best_pick_market: 'double_chance_home',
      odds_home: 1.70,
      odds_draw: 3.20,
    }),
    null,
  );
  assert.equal(
    resolvePickOdds({
      best_pick_market: 'double_chance_home',
      odds_dc_home_draw: 1.36,
      odds_home: 1.70,
      odds_draw: 3.20,
    }),
    1.36,
  );
});
