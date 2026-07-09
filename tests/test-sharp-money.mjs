import assert from 'assert';
import { computeSharpMoneySignal, aggregateSharpMoneySignals } from '../src/probabilities/sharpMoneySignal.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ PASS ${name}`); }
  catch (err) { failed++; console.log(`✗ FAIL ${name}\n        ${err.message}`); }
}

console.log('\n── Sharp Money Signal ─────────────────────────────────────────');

test('Returns neutral when no odds comparison data', () => {
  const sig = computeSharpMoneySignal(null, { marketKey: 'home_win' });
  assert.strictEqual(sig.alignment, 'neutral');
  assert.strictEqual(sig.signal, 0);
});

test('Returns neutral when pick is null', () => {
  const sig = computeSharpMoneySignal({ movementSummary: { perOutcome: {} } }, null);
  assert.strictEqual(sig.alignment, 'neutral');
});

test('Returns neutral for unsupported market keys', () => {
  const sig = computeSharpMoneySignal({ movementSummary: { perOutcome: {} } }, { marketKey: 'some_exotic_market' });
  assert.strictEqual(sig.alignment, 'neutral');
  assert.strictEqual(sig.details.reason, 'no_outcome_mapping');
});

test('Pinnacle SHORTENING on home_win → strong confirms signal', () => {
  const oddsComp = {
    movementSummary: {
      perOutcome: {
        'match_result:HOME': {
          shortening: 1, drifting: 0, pinnacle: 'SHORTENING', netSignal: 1, bestOdds: 2.10, bestBookmaker: 'pinnacle',
        },
      },
    },
  };
  const sig = computeSharpMoneySignal(oddsComp, { marketKey: 'home_win' });
  assert.strictEqual(sig.alignment, 'confirms');
  assert.strictEqual(sig.strength, 'strong');
  assert.ok(sig.signal > 0);
});

test('Pinnacle DRIFTING on home_win → strong contradicts signal', () => {
  const oddsComp = {
    movementSummary: {
      perOutcome: {
        'match_result:HOME': { shortening: 0, drifting: 1, pinnacle: 'DRIFTING', netSignal: -1 },
      },
    },
  };
  const sig = computeSharpMoneySignal(oddsComp, { marketKey: 'home_win' });
  assert.strictEqual(sig.alignment, 'contradicts');
  assert.strictEqual(sig.strength, 'strong');
  assert.ok(sig.signal < 0);
});

test('3+ books shortening without Pinnacle → medium confirms', () => {
  const oddsComp = {
    movementSummary: {
      perOutcome: {
        'over_under:over_25': { shortening: 4, drifting: 1, pinnacle: null, netSignal: 3 },
      },
    },
  };
  const sig = computeSharpMoneySignal(oddsComp, { marketKey: 'over_25' });
  assert.strictEqual(sig.alignment, 'confirms');
  assert.strictEqual(sig.strength, 'medium');
});

test('2 books shortening vs 0 drifting → weak confirms', () => {
  const oddsComp = {
    movementSummary: {
      perOutcome: {
        'btts:yes': { shortening: 2, drifting: 0, pinnacle: null, netSignal: 2 },
      },
    },
  };
  const sig = computeSharpMoneySignal(oddsComp, { marketKey: 'btts_yes' });
  assert.strictEqual(sig.alignment, 'confirms');
  assert.strictEqual(sig.strength, 'weak');
});

test('aggregateSharpMoneySignals caps overall signal', () => {
  const oddsComp = {
    movementSummary: {
      perOutcome: {
        'match_result:HOME': { shortening: 5, drifting: 0, pinnacle: 'SHORTENING', netSignal: 5 },
        'over_under:over_25': { shortening: 5, drifting: 0, pinnacle: 'SHORTENING', netSignal: 5 },
        'btts:yes': { shortening: 5, drifting: 0, pinnacle: 'SHORTENING', netSignal: 5 },
      },
    },
  };
  const picks = [
    { marketKey: 'home_win', selection: 'home' },
    { marketKey: 'over_25', selection: 'over' },
    { marketKey: 'btts_yes', selection: 'yes' },
  ];
  const agg = aggregateSharpMoneySignals(oddsComp, picks);
  assert.ok(agg.overallSignal <= 0.05, `overall ${agg.overallSignal} should be capped at 0.05`);
  assert.strictEqual(agg.confirmations, 3);
});

test('aggregateSharpMoneySignals handles empty picks', () => {
  const agg = aggregateSharpMoneySignals({ movementSummary: { perOutcome: {} } }, []);
  assert.strictEqual(agg.overallSignal, 0);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
