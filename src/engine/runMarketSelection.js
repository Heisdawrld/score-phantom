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
import { checkMarketEscalation, checkCrossMarketEscalation, applyEscalationBonuses } from '../markets/marketEscalation.js';
import { buildReasonChain } from './buildReasonChain.js';
import { safeNum } from '../utils/math.js';

// ── Cheap pre-filter: eliminate obviously-dead candidates before expensive scoring ──
// The scoring pipeline (scoreMarketCandidates) runs ~15 components per candidate
// including Smart Risk Reward, Market Efficiency, Kelly Criterion, accuracy cache
// lookups, etc. Candidates with very low probability will be pruned anyway, so
// we skip scoring them entirely.
//
// The Smart Risk Exception in pruneWeakCandidates allows survival up to 0.08
// below the market floor. The lowest floor is 0.55 (over_25/under_25), so
// the minimum survivable probability is 0.47. We set the pre-filter at 0.40
// to be safely below that threshold while catching obviously-dead candidates.
// Markets NOT in the floor table use the default floor of 0.60.
const PRE_FILTER_MIN_PROB = {
  home_win: 0.44, away_win: 0.44, draw: 0.48,
  over_25: 0.43, under_25: 0.43, over_15: 0.48,
  over_35: 0.48, under_35: 0.60,
  btts_yes: 0.52, btts_no: 0.56,
  double_chance_home: 0.56, double_chance_away: 0.56,
  dnb_home: 0.48, dnb_away: 0.48,
};
const PRE_FILTER_DEFAULT = 0.48; // default floor (0.60) - 0.08 exception margin - buffer

function preFilterCandidates(candidates) {
  const kept = [];
  const removed = [];
  for (const c of candidates || []) {
    const prob = safeNum(c.modelProbability, 0);
    const minProb = PRE_FILTER_MIN_PROB[c.marketKey] ?? PRE_FILTER_DEFAULT;
    if (prob < minProb) {
      removed.push(c.marketKey + '(' + (prob * 100).toFixed(1) + '%<' + (minProb * 100).toFixed(0) + '%)');
    } else {
      kept.push(c);
    }
  }
  if (removed.length > 0) {
    console.log('[runMarketSelection] Pre-filter removed ' + removed.length + ' low-prob candidates: ' + removed.join(', '));
  }
  return kept;
}

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

  // ── Stage 3e.5: Cheap pre-filter — remove obviously-dead candidates ────────
  // This runs BEFORE computeImpliedProbabilities and scoreMarketCandidates,
  // saving expensive computation on candidates that would be pruned anyway.
  const candidatesAfterPreFilter = preFilterCandidates(candidatesAfterRestrictions);

  const candidatesWithEdge = computeImpliedProbabilities(candidatesAfterPreFilter, odds, features);
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
    // Same-category escalation (e.g., Over 1.5 → Over 2.5)
    const escalation = checkMarketEscalation(bestPick, ranked, narrative);
    if (escalation.shouldEscalate && escalation.escalatedTo) {
      console.log('[runMarketSelection] ESCALATION: ' + escalation.reason);
      bestPick = escalation.escalatedTo;
    }

    // v5: Cross-market escalation (e.g., Home Win → Over 2.5 when Home Win has poor value)
    // An experienced bettor thinks: "Home Win is too risky at these odds, but both
    // teams attack → Over 2.5 is the smarter play."
    const crossEscalation = checkCrossMarketEscalation(bestPick, ranked, narrative, script);
    if (crossEscalation.shouldEscalate && crossEscalation.escalatedTo) {
      console.log('[runMarketSelection] CROSS-ESCALATION: ' + crossEscalation.reason);
      bestPick = crossEscalation.escalatedTo;
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
