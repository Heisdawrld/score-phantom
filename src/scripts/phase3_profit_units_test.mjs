import assert from 'node:assert/strict';
import { computeProfitUnits } from '../storage/profitUnits.js';

assert.equal(computeProfitUnits('win', 2.0, 1), 1);
assert.equal(computeProfitUnits('loss', 2.0, 1), -1);
assert.equal(computeProfitUnits('void', 2.0, 1), 0);
assert.equal(computeProfitUnits('win', 1.5, 1), 0.5);
assert.equal(computeProfitUnits('win', null, 1), null);
assert.equal(computeProfitUnits('win', 1.0, 1), null);

console.log('ok');
