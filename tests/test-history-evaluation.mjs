import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePredictionHistory } from '../src/engine/evaluatePredictionHistory.js';
const cutoff = '2026-09-07T00:00:00Z';
const row = { fixture_id: '1', pick_fixture_id: '1', pick_id: 1, engine_version: '5.5.0', pick_version: '5.5.0', prediction_source: 'ws_live', is_retroactive: 0, outcome: 'win', pick_source: 'pre_match', generated_at: '2026-09-07T12:00:00Z', kickoff_at: '2026-09-08T12:00:00Z', model_probability: 0.6, bookmaker_odds: 2, stake_units: 0 };
test('both live settlement paths count but zero stake has no ROI', () => {
  const report = evaluatePredictionHistory([row, { ...row, fixture_id: '2', pick_fixture_id: '2', pick_id: 2, prediction_source: 'live', outcome: 'loss' }], { cutoff });
  const g = report.versions[0];
  assert.equal(g.n, 2); assert.equal(g.winRate, 0.5);
  assert.ok(Math.abs(g.brierScore - 0.26) < 1e-12);
  assert.equal(g.yield, null); assert.equal(g.profitUnits, null);
});
test('rejects hindsight, pre-cutoff, version mismatch and duplicate records', () => {
  const report = evaluatePredictionHistory([row, row, { ...row, generated_at: row.kickoff_at }, { ...row, generated_at: '2026-09-06T12:00:00Z' }, { ...row, pick_version: '5.4.0' }, { ...row, prediction_source: 'backtest' }], { cutoff });
  assert.equal(report.versions[0].n, 1);
  assert.deepEqual(report.rejected, { duplicate_fixture: 1, unverified_pre_match: 1, before_cutoff: 1, snapshot_mismatch: 1, unverified_source: 1 });
});
test('missing probabilities are not converted to zero and captured stake determines yield', () => {
  const report = evaluatePredictionHistory([{ ...row, model_probability: null }, { ...row, stake_units: 2, bookmaker_odds: 1.5 }], { cutoff });
  assert.equal(report.rejected.invalid_probability, 1);
  assert.equal(report.versions[0].profitUnits, 1); assert.equal(report.versions[0].yield, 0.5);
});
