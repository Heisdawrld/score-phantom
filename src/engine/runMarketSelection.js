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

/**
 * Stage 3 — Market selection pipeline (gate-first architecture).
 *
 * New flow (as recommended):
 *   1. assessMatchPredictability   — upfront gate: does this match deserve a pick?
 *   2. buildMarketCandidates       — generate all possible markets
 *   3. computeImpliedProbabilities — add bookmaker edge to candidates
 *   4. scoreMarketCandidates       — score each candidate
 *   5. pruneWeakCandidates         — eliminate low-quality candidates before ranking
 *   6. rankMarkets                 — sort survivors by finalScore
 *   7. computeLayer2Override       — detect strong probability shift
 *   8. selectBestPickOrAbstain     — pick the winner or abstain with reason
 *
 * The engine now says: "First decide if this match deserves ANY pick. Then rank markets."
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

  // ── Stage 3b: Build + score candidates ─────────────────────────────────────
  const candidates         = buildMarketCandidates(calibratedProbs, odds);
  const candidatesWithEdge = computeImpliedProbabilities(candidates, odds);
  const recentMarkets      = await getRecentMarkets(fixtureId, 24);

  // Fetch accuracy cache (non-blocking — null = neutral, engine unaffected)
  const accuracyCache = await getAccuracyCache().catch(() => null);

  const scored = scoreMarketCandidates(candidatesWithEdge, script, features, recentMarkets, accuracyCache);

  // ── Stage 3c: Prune weak candidates (new — before ranking) ─────────────────
  const pruned = pruneWeakCandidates(scored);

  // ── Stage 3d: Rank survivors ────────────────────────────────────────────────
  const ranked = rankMarkets(pruned);

  // ── Stage 3e: Layer 2 override detection ───────────────────────────────────
  const { override: layer2Override, topProbKey } = computeLayer2Override({ rankedCandidates: ranked, shiftMap, features });

  // ── Stage 3f: Select best pick or abstain ──────────────────────────────────
  const { bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied, abstainCode } =
    selectBestPickOrAbstain(ranked, script, features, { layer2Override, layer2ShiftMarket: maxShiftMarket, layer2ShiftPp: maxShift });

  return { bestPick, backupPicks, noSafePick, noSafePickReason, abstainCode: abstainCode || null, rankedCandidates: ranked, layer2Override, layer2OverrideApplied: layer2OverrideApplied ?? false, maxShift, maxShiftMarket, topProbKey };
}
