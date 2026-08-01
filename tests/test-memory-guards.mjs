import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStoredFixtureMeta,
  compactStandings,
  FIXTURE_META_LIMITS,
} from '../src/enrichment/fixtureMeta.js';

test('oversized aggregate standings are rejected', () => {
  const rows = Array.from({ length: 2193 }, (_, index) => ({
    team: `Team ${index + 1}`,
    position: index + 1,
  }));

  assert.deepEqual(compactStandings(rows), []);
});

test('stored fixture metadata is bounded and does not duplicate aliases', () => {
  const refreshedAt = '2026-08-01T12:00:00.000Z';
  const data = {
    standings: Array.from({ length: 2193 }, (_, index) => ({ team: `Team ${index}` })),
    homeForm: Array.from({ length: 30 }, (_, index) => ({ id: index })),
    awayForm: Array.from({ length: 30 }, (_, index) => ({ id: index })),
    h2h: Array.from({ length: 20 }, (_, index) => ({ id: index })),
    matchEvents: Array.from({ length: 500 }, (_, index) => ({ id: index })),
    shotmap: Array.from({ length: 500 }, (_, index) => ({ id: index })),
    lineups: { home: { players: [{ name: 'A' }] }, away: { players: [{ name: 'B' }] } },
    injuries: { home: [], away: [] },
  };

  const meta = buildStoredFixtureMeta(data, refreshedAt);

  assert.equal(meta.dataFreshness.refreshedAt, refreshedAt);
  assert.equal(meta.standings.length, 0);
  assert.equal(meta.homeForm.length, FIXTURE_META_LIMITS.form);
  assert.equal(meta.awayForm.length, FIXTURE_META_LIMITS.form);
  assert.equal(meta.h2h.length, FIXTURE_META_LIMITS.h2h);
  assert.equal(meta.matchEvents.length, FIXTURE_META_LIMITS.events);
  assert.equal(meta.shotmap.length, FIXTURE_META_LIMITS.events);
  assert.equal(meta.lineups, data.lineups);
  assert.equal(meta.injuries, data.injuries);
  assert.equal(Object.hasOwn(meta, 'predicted_lineup'), false);
  assert.equal(Object.hasOwn(meta, 'unavailable_players'), false);
});

test('BSD requests for the same cache key share one in-flight response', async () => {
  process.env.BSD_API_KEY = 'memory-guard-test-key';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });

  globalThis.fetch = async () => {
    fetchCalls += 1;
    await gate;
    return new Response(JSON.stringify({ results: [{ id: 1 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const { bsdFetch, getBsdCacheStats } = await import(`../src/services/bsd.js?memory-guard=${Date.now()}`);
    const first = bsdFetch('/memory-guard/', { fixture: 1 }, { retries: 0 });
    const second = bsdFetch('/memory-guard/', { fixture: 1 }, { retries: 0 });
    releaseFetch();

    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a, b);
    assert.equal(fetchCalls, 1);
    assert.equal(getBsdCacheStats().inFlight, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BSD response streaming aborts before an oversized body is parsed', async () => {
  process.env.BSD_API_KEY = 'memory-guard-test-key';
  process.env.BSD_RESPONSE_MAX_BYTES = String(1024 * 1024);
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    const chunk = new Uint8Array(600 * 1024).fill(65);
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    }), { status: 200 });
  };
  console.error = () => {};

  try {
    const { bsdFetch } = await import(`../src/services/bsd.js?response-guard=${Date.now()}`);
    const result = await bsdFetch('/oversized-memory-guard/', {}, { retries: 0 });
    assert.equal(result, null);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    delete process.env.BSD_RESPONSE_MAX_BYTES;
  }
});
