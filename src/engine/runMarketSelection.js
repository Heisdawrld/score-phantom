import { buildMarketCandidates } from '../markets/buildMarketCandidates.js';
import { computeImpliedProbabilities } from '../markets/computeImpliedProbabilities.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { rankMarkets } from '../markets/rankMarkets.js';
import { computeLayer2Override } from '../markets/computeLayer2Override.js';
import { getRecentMarkets } from '../storage/marketTracking.js';
import { assessMatchPredictability } from './assessMatchPredictability.js';
import { pruneWeakCandidates } from './pruneWeakCandidates.js';
import { selectBestPickOrAbstain } from './selectBestPickOrAbstain.js';
import { getAccuracyCache } from '../storage/accuracyCache.js';

function applyMarketRestrictions(candidates, restrictions = {}) {
  const blockSet = new Set((restrictions.blockMarketKeys || []).map((k) => String(k).toLowerCase()));
  if (!blockSet.size) return { candidates, removed: [] };

  const kept = [];
  const removed = [];
  for (const c of candidates || []) {
    const key = String(c.marketKey || '').toLowerCase();
    if (blockSet.has(key)) removed.push(key);
    else kept.push(c);
  }
  return { candidates: kept, removed };
}

/**
 * Stage 3 — Market selection pipeline (gate-first architecture).
 *
 * Flow:
 *   1. assessMatchPredictability   — upfront gate / market-specific restrictions
 *   2. buildMarketCandidates       — generate all possible markets
 *   3. applyMarketRestrictions     — remove markets blocked by context gates
 *   4. computeImpliedProbabilities — add bookmaker edge to candidates
 *   5. scoreMarketCandidates       — score each candidate
 *   6. pruneWeakCandidates         — eliminate low-quality candidates before ranking
 *   7. rankMarkets                 — sort survivors by headline quality
 *   8. computeLayer2Override       — detect strong probability shift
 *   9. selectBestPickOrAbstain     — pick the winner or abstain with reason
 */
export async function runMarketSelection({ calibratedProbs, odds, script, features, fixtureId, shiftMap, maxShift, maxShiftMarket }) {
  // ── Stage 3a: Predictability gate ──────────────────────────────────────────
  const assessment = assessMatchPredictability(features, script, calibratedProbs);
  if (!assessment.predictable) {
    console.log('[runMarketSelection] ABSTAIN (gate) — ' + assessment.code + ': ' + assessment.reason);
    return {
      bestPick: null,
      backupPicks: [],
      noSafePick: true,
      noSafePickReason: assessment.reason,
      abstainCode: assessment.code,
      rankedCandidates: [],
      layer2Override: false,
      layer2OverrideApplied: false,
      maxShift,
      maxShiftMarket,
      topProbKey: null,
    };
  }

  // ── Stage 3b: Build candidates ─────────────────────────────────────────────
  const allCandidates = buildMarketCandidates(calibratedProbs, odds);

  // ── Stage 3c: Apply market-specific restrictions from predictability gate ──
  const restrictionResult = applyMarketRestrictions(allCandidates, assessment.restrictions || {});
  if (restrictionResult.removed.length > 0) {
    console.log('[runMarketSelection] Market restrictions applied: removed ' + [...new Set(restrictionResult.removed)].join(', '));
  }

  const candidatesWithEdge = computeImpliedProbabilities(restrictionResult.candidates, odds, features);
  const recentMarkets      = await getRecentMarkets(fixtureId, 24);

  // Fetch accuracy cache (non-blocking — null = neutral, engine unaffected)
  const accuracyCache = await getAccuracyCache().catch(() => null);

  const scored = scoreMarketCandidates(candidatesWithEdge, script, features, recentMarkets, accuracyCache);

  // ── Stage 3d: Prune weak candidates (before ranking) ───────────────────────
  const pruned = pruneWeakCandidates(scored, {
    scriptPrimary: script?.primary,
    primaryScript: script?.primary,
    accuracyCache,
    featureVector: features, // pass features so comfort pick guard can access leagueOver35Rate
  });

  // ── Stage 3e: Rank survivors ───────────────────────────────────────────────
  const ranked = rankMarkets(pruned);

  // ── Stage 3f: Layer 2 override detection ───────────────────────────────────
  const { override: layer2Override, topProbKey } = computeLayer2Override({ rankedCandidates: ranked, shiftMap, features });

  // ── Stage 3g: Select best pick or abstain ──────────────────────────────────
  const { bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied, abstainCode } =
    selectBestPickOrAbstain(ranked, script, features, { layer2Override, layer2ShiftMarket: maxShiftMarket, layer2ShiftPp: maxShift });

  return { bestPick, backupPicks, noSafePick, noSafePickReason, abstainCode: abstainCode || null, rankedCandidates: ranked, layer2Override, layer2OverrideApplied: layer2OverrideApplied ?? false, maxShift, maxShiftMarket, topProbKey };
}
