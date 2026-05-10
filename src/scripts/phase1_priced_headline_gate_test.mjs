import assert from 'node:assert/strict';
import { selectBestPickOrAbstain } from '../engine/selectBestPickOrAbstain.js';

const ranked = [
  { marketKey: 'home_over_15', selection: 'Home Over 1.5 Goals', modelProbability: 0.8, finalScore: 0.9, impliedProbability: null, edge: null, bookmakerOdds: null, tacticalFitScore: 0.5 },
  { marketKey: 'home_win', selection: 'Home Win', modelProbability: 0.65, finalScore: 0.7, impliedProbability: 0.55, edge: 0.10, bookmakerOdds: 1.82, tacticalFitScore: 0.5 },
];

const r = selectBestPickOrAbstain(ranked, {}, {}, {});
assert.equal(r.noSafePick, false);
assert.equal(r.bestPick.marketKey, 'home_win');

const r2 = selectBestPickOrAbstain([{ marketKey: 'home_over_15', modelProbability: 0.8, finalScore: 0.9 }], {}, {}, {});
assert.equal(r2.noSafePick, true);
assert.equal(r2.abstainCode, 'NO_PRICED_MARKETS');

console.log('ok');
