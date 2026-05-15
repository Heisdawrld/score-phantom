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
import { buildMatchNarrative } from './buildMatchNarrative.js';
import { computeContextModifiers, applyContextModifiers } from './contextModifiers.js';
import { checkMarketEscalation, applyEscalationBonuses } from '../markets/marketEscalation.js';
import { buildReasonChain } from './buildReasonChain.js';

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
 * v4: Intelligent Analyst — adds narrative building, context modifiers,
 *     escalation/de-escalation, reason chains
 *
 * Flow:
 *   1. assessMatchPredictability   — upfront gate / market-specific restrictions
 *   2. buildMatchNarrative         — construct analyst narrative (Phase 2A)
 *   3. buildMarketCandidates       — generate all possible markets
 *   4. applyMarketRestrictions     — remove markets blocked by context gates
 *   5. applyContextModifiers       — adjust probabilities with analyst context (Phase 2C)
 *   6. computeImpliedProbabilities — add bookmaker edge to candidates
 *   7. scoreMarketCandidates       — score each candidate (with EV, volatility signal)
 *   8. pruneWeakCandidates         — eliminate low-quality candidates (with odds gate)
 *   9. applyEscalationBonuses      — boost higher-tier markets when narrative supports (Phase 5C)
 *  10. rankMarkets                 — sort survivors by headline quality
 *  11. computeLayer2Override       — detect strong probability shift
 *  12. checkMarketEscalation       — check if best pick should escalate (Phase 5A)
 *  13. selectBestPickOrAbstain     — pick the winner or abstain with reason
 *  14. buildReasonChain            — construct analyst reasoning (Phase 6)
 */
export async function runMarketSelection({ calibratedProbs, odds, script, features, fixtureId, shiftMap, maxShift, maxShiftMarket }) {
  // ── Stage 3a: Predictability gate ──────────────────────────────────────────
  const assessment = assessMatchPredictability(features, script, calibratedProbs);
  if (!assessment.predictable) {
    console.log('[runMarketSelection] ABSTAIN (gate) — ' + assessment.code + ': ' + assessment.reason);

    // Build narrative and reason chain even for abstentions
    const narrative = buildMatchNarrative(features, script, calibratedProbs);
    const reasonChain = buildReasonChain({
      bestPick: null, noSafePick: true, noSafePickReason: assessment.reason,
      abstainCode: assessment.code, narrative, featureVector: features, script, calibratedProbs,
    });

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
      narrative,
      contextMods: null,
      reasonChain,
    };
  }

  // ── Stage 3b: Build match narrative (Phase 2A) ─────────────────────────────
  const narrative = buildMatchNarrative(features, script, calibratedProbs);
  console.log('[runMarketSelection] Narrative:', narrative.qualityAssessment, '/', narrative.styleProfile, '/', narrative.scriptAssessment, '/ goal:', narrative.goalExpectation, '/ confidence:', narrative.narrativeConfidence);

  // ── Stage 3c: Apply context modifiers (Phase 2C) ──────────────────────────
  const contextMods = computeContextModifiers(features, narrative);
  const adjustedProbs = applyContextModifiers(calibratedProbs, contextMods);
  if (contextMods.modifiers.length > 0) {
    console.log('[runMarketSelection] Context modifiers:', contextMods.modifiers.map(m => m.name + '(' + m.effect + ')').join(', '));
  }

  // ── Stage 3d: Build candidates (with adjusted probs) ───────────────────────
  const allCandidates = buildMarketCandidates(adjustedProbs, odds);

  // ── Stage 3e: Apply market-specific restrictions from predictability gate ──
  const restrictionResult = applyMarketRestrictions(allCandidates, assessment.restrictions || {});

  // Also apply narrative-blocked markets (Phase 2B)
  const narrativeBlocked = narrative.blockedMarkets || [];
  let candidatesAfterRestrictions = restrictionResult.candidates;
  if (narrativeBlocked.length > 0 && narrative.narrativeConfidence !== 'low') {
    const before = candidatesAfterRestrictions.length;
    candidatesAfterRestrictions = candidatesAfterRestrictions.filter(c => !narrativeBlocked.includes(c.marketKey));
    const removed = before - candidatesAfterRestrictions.length;
    if (removed > 0) {
      console.log('[runMarketSelection] Narrative blocked ' + removed + ' markets: ' + narrativeBlocked.join(', '));
    }
  }

  const candidatesWithEdge = computeImpliedProbabilities(candidatesAfterRestrictions, odds, features);
  const recentMarkets      = await getRecentMarkets(fixtureId, 24);

  // Fetch accuracy cache (non-blocking — null = neutral, engine unaffected)
  const accuracyCache = await getAccuracyCache().catch(() => null);

  // ── Stage 3f: Score candidates (Phase 1C EV, Phase 3A volatility signal) ──
  const scored = scoreMarketCandidates(candidatesWithEdge, script, features, recentMarkets, accuracyCache, narrative);

  // ── Stage 3g: Prune weak candidates (Phase 1A odds gate, Phase 1B O1.5 guard) ──
  const pruned = pruneWeakCandidates(scored, {
    scriptPrimary: script?.primary,
    primaryScript: script?.primary,
    accuracyCache,
    featureVector: features,
    narrative, // Phase 2B: pass narrative for blocked market filtering
  });

  // ── Stage 3h: Apply escalation bonuses (Phase 5C) ──────────────────────────
  const withEscalationBonuses = applyEscalationBonuses(pruned, narrative);

  // ── Stage 3i: Rank survivors ───────────────────────────────────────────────
  const ranked = rankMarkets(withEscalationBonuses);

  // ── Stage 3j: Layer 2 override detection ───────────────────────────────────
  const { override: layer2Override, topProbKey } = computeLayer2Override({ rankedCandidates: ranked, shiftMap, features });

  // ── Stage 3k: Select best pick or abstain ──────────────────────────────────
  let { bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied, abstainCode } =
    selectBestPickOrAbstain(ranked, script, features, { layer2Override, layer2ShiftMarket: maxShiftMarket, layer2ShiftPp: maxShift });

  // ── Stage 3l: Check market escalation (Phase 5A) ──────────────────────────
  // If the best pick is at low odds with high probability, consider escalating
  if (bestPick && !noSafePick && ranked.length > 1) {
    const escalation = checkMarketEscalation(bestPick, ranked, narrative);
    if (escalation.shouldEscalate && escalation.escalatedTo) {
      console.log('[runMarketSelection] ESCALATION: ' + escalation.reason);
      bestPick = escalation.escalatedTo;
    }
  }

  // ── Stage 3m: Build reason chain (Phase 6) ────────────────────────────────
  const reasonChain = buildReasonChain({
    bestPick, noSafePick, noSafePickReason, abstainCode,
    narrative, featureVector: features, script, calibratedProbs: adjustedProbs,
  });

  return {
    bestPick,
    backupPicks,
    noSafePick,
    noSafePickReason,
    abstainCode: abstainCode || null,
    rankedCandidates: ranked,
    layer2Override,
    layer2OverrideApplied: layer2OverrideApplied ?? false,
    maxShift,
    maxShiftMarket,
    topProbKey,
    narrative,
    contextMods,
    reasonChain,
  };
}
