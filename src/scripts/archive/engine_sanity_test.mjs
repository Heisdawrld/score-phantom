/**
 * engine_sanity_test.mjs
 * Quick sanity checks for the 5 fixed engine components.
 * Run: node src/scripts/engine_sanity_test.mjs
 */

import { buildReasonCodes } from '../engine/buildReasonCodes.js';
import { buildAcca } from '../engine/buildAcca.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { selectBestPickOrAbstain } from '../engine/selectBestPickOrAbstain.js';

let passed = 0;
let failed = 0;

function assert(label, condition, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${details ? ' — ' + details : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Reason codes don't contradict the pick
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST 1: Reason Codes Match Pick ─────────────────────────────');

const highScoringFeatures = {
  homeBaseRating: 1.8, awayBaseRating: 1.3,
  homeAvgScored: 2.1, awayAvgScored: 1.5,
  homeBttsRate: 0.72, awayBttsRate: 0.68,
  homeOver25Rate: 0.70, awayOver25Rate: 0.65,
  h2hAvgGoals: 3.1, h2hMatchesAvailable: 5,
  homePointsLast5: 10, awayPointsLast5: 6,
  matchChaosScore: 0.3, upsetRiskScore: 0.2, dataCompletenessScore: 0.75,
};

const script_dominant = { primary: 'dominant_home_pressure', confidence: 0.75 };
const script_open     = { primary: 'open_end_to_end', confidence: 0.75 };

// Under_25 pick on high-scoring features — contradicting codes should be gone
const reasonsUnder = buildReasonCodes(highScoringFeatures, script_dominant, 'under_25');
console.log('  Reasons for under_25 on high-scoring match:', reasonsUnder);
assert(
  'No "home_scoring_rate_strong" in reasons for under_25 pick',
  !reasonsUnder.includes('home_scoring_rate_strong'),
  `Got: ${JSON.stringify(reasonsUnder)}`
);
assert(
  'No "both_teams_high_scoring_tendency" in reasons for under_25 pick',
  !reasonsUnder.includes('both_teams_high_scoring_tendency'),
  `Got: ${JSON.stringify(reasonsUnder)}`
);
assert(
  'No "btts_profile_high" in reasons for under_25 pick',
  !reasonsUnder.includes('btts_profile_high'),
  `Got: ${JSON.stringify(reasonsUnder)}`
);

// home_win pick should show home advantage codes
const reasonsHomeWin = buildReasonCodes(highScoringFeatures, script_dominant, 'home_win');
console.log('  Reasons for home_win:', reasonsHomeWin);
assert(
  '"projected_home_control" or "home_strength_gap_high" present for home_win',
  reasonsHomeWin.includes('projected_home_control') || reasonsHomeWin.includes('home_strength_gap_high'),
  `Got: ${JSON.stringify(reasonsHomeWin)}`
);

// btts_yes on open game — contradicting codes should be gone
const bttsFeatures = { ...highScoringFeatures, homeBttsRate: 0.35, awayBttsRate: 0.30 };
const reasonsBttsYes = buildReasonCodes(bttsFeatures, script_open, 'btts_yes');
console.log('  Reasons for btts_yes:', reasonsBttsYes);
assert(
  'No "btts_profile_low" in reasons for btts_yes pick',
  !reasonsBttsYes.includes('btts_profile_low'),
  `Got: ${JSON.stringify(reasonsBttsYes)}`
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: ACCA Under cap
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST 2: ACCA Under Cap ───────────────────────────────────────');

// Build fake rows — all unders, all should be SAFE eligible
function makeRow(id, market, prob = 0.75) {
  return {
    fixture_id: id,
    home_team: `Home${id}`, away_team: `Away${id}`,
    match_date: '2026-04-13',
    tournament_name: `League ${id}`, // different leagues to avoid league cap
    best_pick_market: market,
    best_pick_selection: market,
    best_pick_probability: prob,
    best_pick_score: 0.8,
    confidence_volatility: 'low',
    confidence_model: 'high',
    no_safe_pick: 0,
    enrichment_status: 'deep',
    data_quality: 'excellent',
    script_primary: 'tight_low_event',
  };
}

const underRows = [
  makeRow(1, 'under_25', 0.78),
  makeRow(2, 'under_25', 0.77),
  makeRow(3, 'under_25', 0.76),
  makeRow(4, 'under_35', 0.82),
  makeRow(5, 'home_win',  0.72), // one result pick
];

const safeAcca = buildAcca(underRows, 'safe');
console.log('  SAFE ACCA with 4 under rows + 1 home_win:');
console.log('  Picks:', safeAcca.picks?.map(p => p.market) ?? safeAcca.message);

const underPickCount = (safeAcca.picks || []).filter(p =>
  ['under_25','under_35','home_under_15','away_under_15'].includes(p.market)
).length;

assert(
  'SAFE ACCA has max 1 Under pick',
  underPickCount <= 1,
  `Got ${underPickCount} Under picks`
);

// Value mode — max 2 unders
const valueAcca = buildAcca(underRows, 'value');
const underPickCountV = (valueAcca.picks || []).filter(p =>
  ['under_25','under_35','home_under_15','away_under_15'].includes(p.market)
).length;
assert(
  'VALUE ACCA has max 2 Under picks',
  underPickCountV <= 2,
  `Got ${underPickCountV} Under picks`
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Tactical fit — under_25 on dominant_home gets > 0.4
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST 3: Tactical Fit ─────────────────────────────────────────');

const candidates = [
  { marketKey: 'under_25',  modelProbability: 0.70, edge: 0.06 },
  { marketKey: 'home_win',  modelProbability: 0.65, edge: 0.04 },
  { marketKey: 'btts_no',   modelProbability: 0.65, edge: null },
  { marketKey: 'dnb_home',  modelProbability: 0.72, edge: 0.07 },
  { marketKey: 'over_25',   modelProbability: 0.62, edge: 0.03 },
];

const fv = { dataCompletenessScore: 0.8, matchChaosScore: 0.25,
             homePointsLast5: 11, awayPointsLast5: 5 };
const scriptDom = { primary: 'dominant_home_pressure' };

const scored = scoreMarketCandidates(candidates, scriptDom, fv, {});
const under25Scored  = scored.find(c => c.marketKey === 'under_25');
const homeWinScored  = scored.find(c => c.marketKey === 'home_win');
const bttsnScored    = scored.find(c => c.marketKey === 'btts_no');
const dnbHomeScored  = scored.find(c => c.marketKey === 'dnb_home');

console.log('  Tactical fits → under_25:', under25Scored?.tacticalFitScore,
  '| home_win:', homeWinScored?.tacticalFitScore,
  '| btts_no:', bttsnScored?.tacticalFitScore,
  '| dnb_home:', dnbHomeScored?.tacticalFitScore);

assert(
  'under_25 tactical fit > 0.4 on dominant_home',
  (under25Scored?.tacticalFitScore ?? 0) > 0.4,
  `Got: ${under25Scored?.tacticalFitScore}`
);
assert(
  'home_win tactical fit > 0.85 on dominant_home',
  (homeWinScored?.tacticalFitScore ?? 0) >= 0.85,
  `Got: ${homeWinScored?.tacticalFitScore}`
);
assert(
  'dnb_home tactical fit > 0.75 on dominant_home',
  (dnbHomeScored?.tacticalFitScore ?? 0) >= 0.75,
  `Got: ${dnbHomeScored?.tacticalFitScore}`
);

// Open game — under should get very low fit
const scriptOpen = { primary: 'open_end_to_end' };
const scoredOpen = scoreMarketCandidates(candidates, scriptOpen, fv, {});
const under25Open = scoredOpen.find(c => c.marketKey === 'under_25');
console.log('  under_25 tactical fit on open_end_to_end:', under25Open?.tacticalFitScore);
assert(
  'under_25 tactical fit < 0.3 on open_end_to_end',
  (under25Open?.tacticalFitScore ?? 1) < 0.3,
  `Got: ${under25Open?.tacticalFitScore}`
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Abstain not triggered when both top picks are strong (>= 0.68)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST 4: Abstain Gate — Strong Dual Pick Rescue ───────────────');

const rankedTwoStrong = [
  { marketKey: 'home_win', modelProbability: 0.72, finalScore: 0.611, tacticalFitScore: 0.92, edge: 0.08, selection: 'home_win' },
  { marketKey: 'dnb_home', modelProbability: 0.69, finalScore: 0.608, tacticalFitScore: 0.85, edge: 0.06, selection: 'dnb_home' },
  { marketKey: 'over_25',  modelProbability: 0.60, finalScore: 0.500, tacticalFitScore: 0.30, edge: null,  selection: 'over_25' },
];

const featuresBasic = { matchChaosScore: 0.3, upsetRiskScore: 0.25, enrichmentTier: 'good', enrichmentCompleteness: 0.8 };
const scriptBasic   = { primary: 'dominant_home_pressure', confidence: 0.7, volatilityScore: 0.25 };

const result = selectBestPickOrAbstain(rankedTwoStrong, scriptBasic, featuresBasic, { layer2Override: false });
console.log('  Result with two near-tied strong picks:', result.noSafePick ? `ABSTAIN (${result.abstainCode})` : `PICK: ${result.bestPick?.marketKey}`);
assert(
  'Should NOT abstain when both top picks >= 0.68',
  !result.noSafePick,
  `Got abstainCode: ${result.abstainCode}`
);
assert(
  'Best pick should be home_win (top of ranked)',
  result.bestPick?.marketKey === 'home_win',
  `Got: ${result.bestPick?.marketKey}`
);

// Low probability — should still abstain
const rankedWeakTop = [
  { marketKey: 'home_win', modelProbability: 0.60, finalScore: 0.55, tacticalFitScore: 0.6, edge: 0.04, selection: 'home_win' },
  { marketKey: 'dnb_home', modelProbability: 0.59, finalScore: 0.548, tacticalFitScore: 0.5, edge: 0.02, selection: 'dnb_home' },
];
const resultWeak = selectBestPickOrAbstain(rankedWeakTop, scriptBasic, featuresBasic, { layer2Override: false });
assert(
  'Should abstain when best pick prob < 0.62 (floor gate)',
  resultWeak.noSafePick,
  `Got noSafePick=${resultWeak.noSafePick}`
);

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(55)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(55)}`);
if (failed > 0) process.exit(1);
