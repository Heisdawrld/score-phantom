import assert from 'node:assert/strict';
import { didHeadlinePickMateriallyChange, computePickMaterialSignature } from '../storage/predictionPicksMaterialChange.js';

assert.equal(didHeadlinePickMateriallyChange(null, { market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }), true);
assert.equal(didHeadlinePickMateriallyChange({ market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }, { market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }), false);
assert.equal(didHeadlinePickMateriallyChange({ market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }, { market_key: 'away_win', selection: 'Away Win', bookmaker_odds: 2.2 }), true);
assert.equal(didHeadlinePickMateriallyChange({ market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }, { market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.75 }), true);
assert.equal(computePickMaterialSignature({ market_key: 'home_win', selection: 'Home Win', bookmaker_odds: 1.8 }), 'home_win|Home Win|1.8');
assert.equal(computePickMaterialSignature({ market_key: 'home_win', selection: 'Home Win', bookmaker_odds: null }), 'home_win|Home Win|null');

console.log('ok');
