import test from 'node:test';
import assert from 'node:assert/strict';
import { isBelowProbabilityFloor } from '../src/engine/probabilityThresholds.js';

test('display-equal probability is not rejected by floating-point noise', () => {
  assert.equal(isBelowProbabilityFloor(0.7199, 0.72), false);
});

test('a materially lower probability still fails the floor', () => {
  assert.equal(isBelowProbabilityFloor(0.7194, 0.72), true);
});
