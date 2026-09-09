import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPredictionPresentation } from '../src/api/predictionPresentation.js';

test('missing data and rejected prices have distinct explanations', () => {
  const data = buildPredictionPresentation({ abstainCode: 'LOW_DATA' });
  const prices = buildPredictionPresentation({ abstainCode: 'PRICED_MARKETS_FILTERED' });
  assert.match(data.explanation, /not enough recent match evidence/);
  assert.match(prices.explanation, /prices were available/);
  assert.notEqual(data.title, prices.title);
});
test('watchlist without price never reads as a betting recommendation', () => {
  const result = buildPredictionPresentation({ bestPick: { advisor_reason: 'WAIT_FOR_PRICE' } });
  assert.match(result.explanation, /watchlist idea/);
  assert.match(result.explanation, /price is needed/);
});
test('timestamps require a known timezone and are never invented for old caches', () => {
  for (const updatedAt of [undefined, '', 'invalid', '2026-09-09 10:00:00']) {
    assert.equal(buildPredictionPresentation({ updatedAt }).generatedAt, null);
  }
  assert.equal(buildPredictionPresentation({ updatedAt: '2026-09-09T10:00:00+01:00' }).generatedAt, '2026-09-09T09:00:00.000Z');
  assert.equal(buildPredictionPresentation({ abstainCode: 'FUTURE_REASON' }).explanation, null);
});
