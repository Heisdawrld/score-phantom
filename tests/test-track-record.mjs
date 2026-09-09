import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createFixtureApp } from './helpers/trackRecordFixture.mjs';

async function withApi(t) {
  const { app, sqlite } = createFixtureApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); sqlite.close(); });
  return async path => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/track-record${path}`);
    assert.equal(response.status, 200);
    return response.json();
  };
}

test('headline and every ROI breakdown exclude unpriced, unknown-profit, zero-stake and void turnover', async t => {
  const get = await withApi(t);
  const data = await get('/stats');
  assert.equal(data.overall.roiPicks, 2);
  assert.equal(data.overall.totalStaked, 3);
  assert.equal(data.overall.totalProfit, 1);
  assert.equal(data.overall.roi, 1 / 3);
  assert.equal(data.overall.total, 5);
  for (const key of ['byMarket', 'byConfidence', 'byOddsBand', 'bySharp', 'monthly']) {
    assert.equal(data[key].length, 1, key);
    assert.equal(data[key][0].roiPicks, 2, key);
    assert.equal(data[key][0].staked, 3, key);
    assert.equal(data[key][0].profit, 1, key);
    assert.equal(data[key][0].roi, 1 / 3, key);
  }
});

test('unpriced cohort returns unavailable economics, not break-even', async t => {
  const get = await withApi(t);
  const data = await get('/stats?engineVersion=4.0.0');
  assert.equal(data.overall.total, 1);
  assert.equal(data.overall.roi, null);
  assert.equal(data.overall.totalProfit, null);
  assert.equal(data.byMarket[0].roi, null);
  assert.equal(data.byMarket[0].avgOdds, null);
  assert.equal(data.bySharp[0].roiPicks, 0);
});

test('version filters scope calibration and recent outcomes and preserve available versions', async t => {
  const get = await withApi(t);
  const stats = await get('/stats?engineVersion=5.5.0');
  assert.equal(stats.overall.total, 4);
  assert.equal(stats.calibration[0].total, 4);
  assert.deepEqual(stats.engineVersions, ['5.5.0', '4.0.0']);
  const recent = await get('/recent?engineVersion=4.0.0');
  assert.deepEqual(recent.results.map(row => row.fixture_id), ['unpriced']);
  const empty = await get('/stats?engineVersion=not-yet-published');
  assert.equal(empty.overall.roi, null);
  assert.equal(empty.overall.total, 0);
});

test('public recent results exclude pending, backtest and retroactive predictions', async t => {
  const get = await withApi(t);
  const recent = await get('/recent');
  assert.equal(recent.results.length, 6);
  assert.ok(recent.results.every(row => !['pending', 'backtest', 'retroactive'].includes(row.fixture_id)));
});

test('version input is bound as data and negative limits cannot fetch all rows', async t => {
  const get = await withApi(t);
  const malicious = await get(`/stats?engineVersion=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(malicious.overall.total, 0);
  const recent = await get('/recent?limit=-1');
  assert.equal(recent.results.length, 1);
});
