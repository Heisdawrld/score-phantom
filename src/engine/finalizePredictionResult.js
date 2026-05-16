import { safeNum } from "../utils/math.js";
import { buildConfidenceProfile } from "./buildConfidenceProfile.js";
import { buildReasonCodes } from "./buildReasonCodes.js";
import { savePrediction } from "../storage/savePrediction.js";
import { logRecommendedMarket } from "../storage/marketTracking.js";
import { classifyValueTier } from "../markets/valueTiers.js";

/**
 * Stage 4 — Finalize prediction result.
 * Builds confidence profile, reason codes, assembles the result object,
 * persists to DB, logs market tracking. Returns the full prediction.
 *
 * v4: Intelligent Analyst — EV-aware badge, CAUTIOUS badge, ACCA-eligible flag,
 *     value tier classification, reason chain
 */
export async function finalizePredictionResult({ fixtureId, homeTeamName, awayTeamName, script, xg, calibratedProbs, features, selection, tacticalMatchup, scoreMatrix, narrative, contextMods, reasonChain }) {
  const { backupPicks, noSafePick, noSafePickReason, abstainCode, rankedCandidates, layer2Override, layer2OverrideApplied, maxShift, maxShiftMarket, topProbKey } = selection;
  let bestPick = selection.bestPick; // let — may be replaced by SKIP cascade
  let confidence = buildConfidenceProfile(bestPick, features);
  let reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);

  // ── Correct score probabilities from Poisson score matrix ───────────────
  let correctScoreProbs = [];
  if (scoreMatrix && scoreMatrix.length > 0) {
    const maxGoals = scoreMatrix.length - 1;
    const entries = [];
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = scoreMatrix[h]?.[a];
        if (prob != null && prob > 0) {
          entries.push({ score: `${h}-${a}`, home: h, away: a, probability: parseFloat(prob.toFixed(4)) });
        }
      }
    }
    correctScoreProbs = entries.sort((x, y) => y.probability - x.probability).slice(0, 10);
  }

  if (bestPick) {
    const prob = bestPick.modelProbability ?? 0;
    const impl = bestPick.impliedProbability ?? null;   // keep null — model-only picks have no implied
    const edge = bestPick.edge ?? null;                 // keep null — model-only picks have no edge
    const finalScore = bestPick.finalScore ?? 0;
    const odds = bestPick.bookmakerOdds ?? null;         // keep null — model-only picks have no odds

    // ── Displayed Confidence ──────────────────────────────────────────────
    bestPick.displayedConfidence = parseFloat((prob * 100).toFixed(1));
    const phantomScoreRaw = (prob * 0.55) + (finalScore * 0.45);
    bestPick.phantomScoreRaw = parseFloat(phantomScoreRaw.toFixed(4));

    // ── Value Tier Classification (Phase 1D) ──────────────────────────────
    const valueTier = classifyValueTier(bestPick);
    bestPick.valueTier = valueTier.tier;
    bestPick.valueTierLabel = valueTier.tierLabel;
    bestPick.valueTierDescription = valueTier.tierDescription;
    bestPick.ev = valueTier.ev;

    // ── Simplified 3-Tier Badge: BET / ACCA / SKIP ────────────────────────
    // Beginner-friendly: only 3 verdicts, each gives ONE clear message.
    //
    //   BET   = "Bet on this" — model trusts it as a single bet
    //   ACCA  = "Acca pick" — reliable but only use in accumulators, not singles
    //   SKIP  = "Don't bet" — not worth the risk (junk odds, negative EV, etc.)
    //
    // This eliminates the old CAREFUL+ACCA contradiction where "careful"
    // sounded like a warning but "ACCA" sounded like a recommendation.
    // Now every pick has exactly ONE clear message.
    //
    // Logic priority: value tier → probability → data quality
    const dataQ = features.dataCompletenessScore ?? 0.5;  // BUG FIX: use ?? not || — 0 is a valid score
    const matchChaos = safeNum(features.matchChaosScore, 0.5);
    const upsetRisk = safeNum(features.upsetRiskScore, 0.5);
    // BUG FIX: Use full predScore (data+chaos+upset) to match scoreMarketCandidates,
    // not just dataQ. Using dataQ alone could promote ACCA→BET on chaotic matches.
    const predScore = (dataQ * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);
    const isRestricted = bestPick.leagueSignal?.status === 'restricted';
    const ev = (odds != null && odds > 1.0) ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;

    let syncedAdvisorStatus;

    if (isRestricted) {
      // Restricted league = unreliable data → at best ACCA (not a single bet)
      syncedAdvisorStatus = prob >= 0.65 ? 'ACCA' : 'SKIP';
    } else if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
      // Junk odds or negative EV → don't bet
      syncedAdvisorStatus = 'SKIP';
    } else if (valueTier.tier === 'ACCUMULATOR') {
      // Solid probability at low odds → ACCA (not "careful" — this IS the recommendation)
      syncedAdvisorStatus = 'ACCA';
    } else if (valueTier.tier === 'STRONG' || valueTier.tier === 'VALUE') {
      // Strong or Value tier with decent data → BET (trusted as a single)
      syncedAdvisorStatus = (isPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
    } else if (valueTier.tier === 'SHARP') {
      // Sharp = model disagrees with market → BET if +EV (value exists), SKIP if not
      syncedAdvisorStatus = isPositiveEV ? 'BET' : 'SKIP';
    } else if (prob >= 0.72 && odds >= 1.30) {
      // High probability with decent odds → BET
      syncedAdvisorStatus = predScore < 0.20 ? 'ACCA' : 'BET';
    } else if (prob >= 0.58 && odds >= 1.30 && odds <= 1.65) {
      // ACCA-eligible probability/odds range → ACCA
      syncedAdvisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
    } else if (prob >= 0.60 && odds >= 1.25) {
      // Decent probability → ACCA (good building block, not a standalone single)
      syncedAdvisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
    } else if (prob >= 0.50 && isPositiveEV) {
      // Marginal probability but positive EV → ACCA (has some value but risky as single)
      syncedAdvisorStatus = 'ACCA';
    } else if (prob >= 0.50) {
      syncedAdvisorStatus = predScore >= 0.40 ? 'ACCA' : 'SKIP';
    } else {
      syncedAdvisorStatus = 'SKIP';
    }
    bestPick.advisor_status = syncedAdvisorStatus;

    // ── SKIP cascade — when #1 gets SKIP'd, try #2, #3, etc. ────────────
    // The engine may have found a great alternative market that the user would
    // actually want to bet on. Example: Home Win at 1.22 odds = SKIP (junk),
    // but Over 2.5 at 1.85 = ACCA (positive EV). The user should see Over 2.5,
    // not a blank screen.
    //
    // CRITICAL: The cascade must apply the SAME headline quality gates that
    // selectBestPickOrAbstain uses for the #1 pick. Just because a candidate
    // isn't technically SKIP doesn't mean the engine is sure about it.
    // A 51% pick with +0.5% EV earns ACCA on paper — but the engine isn't
    // confident. The cascade should only promote picks the engine genuinely trusts.
    if (syncedAdvisorStatus === 'SKIP' && rankedCandidates && rankedCandidates.length > 1) {
      const originalSkipPick = bestPick;
      const originalSkipReason = (() => {
        const reasons = [];
        if (isRestricted) reasons.push('Restricted league');
        if (valueTier.tier === 'JUNK') reasons.push(`Odds at ${(odds ?? 0).toFixed(2)} offer no value`);
        if (valueTier.tier === 'NEGATIVE_EV') reasons.push('Negative EV');
        return reasons.length > 0 ? reasons.join(', ') : 'Insufficient edge or value';
      })();

      // Check remaining ranked candidates for one that earns BET or ACCA
      for (let i = 0; i < rankedCandidates.length; i++) {
        const candidate = rankedCandidates[i];
        if (!candidate || candidate === originalSkipPick) continue;

        const cProb = safeNum(candidate.modelProbability, 0);
        const cOdds = safeNum(candidate.bookmakerOdds, 0);
        const cFinalScore = safeNum(candidate.finalScore, 0);
        const cPhantomScore = (cProb * 0.55) + (cFinalScore * 0.45);
        const cDataScore = safeNum(features.dataCompletenessScore, 0.5);
        const cEdge = safeNum(candidate.edge, 0);
        const cTacticalFit = safeNum(candidate.tacticalFitScore, 0);
        const cVolatilityScore = safeNum(script?.volatilityScore, 0.5);
        const cIsHighVolatility = cVolatilityScore > 0.70;
        const cChaos = safeNum(features.matchChaosScore, 0.5);

        // ── Headline Quality Gates (same as selectBestPickOrAbstain) ──────
        // These ensure the engine is genuinely sure about this pick.
        // Without these, a 51% +0.5% EV pick would get promoted as ACCA
        // even though the engine barely trusts it.

        // Gate 1: Minimum probability — must be genuinely likely
        if (cProb < 0.50) continue;

        // Gate 2: Minimum composite score — scoring components must agree
        if (cFinalScore < 0.36) continue;

        // Gate 3: Minimum phantom score — blended prob+score must be decent
        if (cPhantomScore < 0.50) continue;

        // Gate 4: Minimum data quality — can't be confident on thin data
        if (cDataScore < 0.30) continue;

        // Gate 5: Volatility/chaos extra proof — risky picks need more support
        if (cIsHighVolatility || cChaos >= 0.68) {
          if (cPhantomScore < 0.55) continue;
          if (cFinalScore < 0.42) continue;
          if (cProb < 0.65) continue;
        }

        // Gate 6: Tactical alignment — engine must see a tactical reason
        if (cTacticalFit < 0.15) continue;

        // Gate 7: Junk odds — no value in betting
        if (cOdds > 0 && cOdds < 1.25) continue;

        // Gate 8: Weak EV with odds — bookmaker disagrees strongly
        const cImpl = safeNum(candidate.impliedProbability, 0);
        if (cImpl > 0 && cEdge < 0.01 && cProb < 0.72) continue;

        // ── All quality gates passed — now compute badge ──────────────────
        const cValueTier = classifyValueTier(candidate);
        const cEv = cOdds > 1.0 ? (cProb * cOdds) - 1 : null;
        const cIsPositiveEV = cEv != null && cEv >= 0;
        const cIsRestricted = candidate.leagueSignal?.status === 'restricted';

        let candidateBadge;
        if (cIsRestricted && cProb < 0.65) {
          candidateBadge = 'SKIP';
        } else if (cValueTier.tier === 'JUNK' || cValueTier.tier === 'NEGATIVE_EV') {
          candidateBadge = 'SKIP';
        } else if (cValueTier.tier === 'ACCUMULATOR') {
          candidateBadge = 'ACCA';
        } else if (cValueTier.tier === 'STRONG' || cValueTier.tier === 'VALUE') {
          candidateBadge = (cIsPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
        } else if (cValueTier.tier === 'SHARP') {
          candidateBadge = cIsPositiveEV ? 'BET' : 'SKIP';
        } else if (cProb >= 0.72 && cOdds >= 1.30) {
          candidateBadge = predScore < 0.20 ? 'ACCA' : 'BET';
        } else if (cProb >= 0.58 && cOdds >= 1.30 && cOdds <= 1.65) {
          candidateBadge = predScore < 0.20 ? 'SKIP' : 'ACCA';
        } else if (cProb >= 0.60 && cOdds >= 1.25) {
          candidateBadge = predScore < 0.20 ? 'SKIP' : 'ACCA';
        } else if (cProb >= 0.50 && cIsPositiveEV) {
          candidateBadge = 'ACCA';
        } else if (cProb >= 0.50) {
          candidateBadge = predScore >= 0.40 ? 'ACCA' : 'SKIP';
        } else {
          candidateBadge = 'SKIP';
        }

        // Found a keeper! Promote it to bestPick
        if (candidateBadge !== 'SKIP') {
          console.log(`[finalize] SKIP cascade: ${originalSkipPick.marketKey}(${originalSkipPick.selection}) → ${candidate.marketKey}(${candidate.selection}) badge=${candidateBadge} prob=${(cProb*100).toFixed(1)}% phantom=${(cPhantomScore*100).toFixed(1)}% tactical=${cTacticalFit.toFixed(2)} odds=${cOdds.toFixed(2)} ev=${cEv != null ? (cEv*100).toFixed(1) + '%' : 'N/A'}`);

          // Compute full metadata for the promoted candidate
          const cPhantomScoreRaw = (cProb * 0.55) + (cFinalScore * 0.45);
          candidate.displayedConfidence = parseFloat((cProb * 100).toFixed(1));
          candidate.phantomScoreRaw = parseFloat(cPhantomScoreRaw.toFixed(4));
          candidate.valueTier = cValueTier.tier;
          candidate.valueTierLabel = cValueTier.tierLabel;
          candidate.valueTierDescription = cValueTier.tierDescription;
          candidate.ev = cValueTier.ev;
          candidate.advisor_status = candidateBadge;

          // Preserve the original SKIP as a skip note for transparency
          candidate.skipNote = {
            originalPick: originalSkipPick.marketKey,
            originalSelection: originalSkipPick.selection,
            originalProb: originalSkipPick.modelProbability,
            originalOdds: originalSkipPick.bookmakerOdds,
            reason: originalSkipReason,
          };

          // Replace bestPick with the promoted candidate
          // (The original SKIP pick is preserved in skipNote)
          bestPick = candidate;
          syncedAdvisorStatus = candidateBadge;

          // Rebuild confidence and reason codes for the promoted pick
          confidence = buildConfidenceProfile(bestPick, features);
          reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);

          // Recompute odds/ev/prob for downstream code
          break; // Stop after first valid alternative
        }
      }

      // If cascade didn't find anything, mark original as SKIP
      if (syncedAdvisorStatus === 'SKIP') {
        console.log(`[finalize] SKIP cascade: no quality alternative found for ${originalSkipPick.marketKey} — ${rankedCandidates.length - 1} alternatives checked, none passed headline quality gates`);
        const skipReasons = [];
        if (isRestricted) skipReasons.push('Restricted league — limited data reliability');
        if (valueTier.tier === 'JUNK') skipReasons.push(`Odds at ${(odds ?? 0).toFixed(2)} offer no value`);
        if (valueTier.tier === 'NEGATIVE_EV') skipReasons.push(`Negative expected value (${(ev != null ? (ev * 100).toFixed(1) : '?')}%) — not profitable`);
        if (dataQ < 0.20) skipReasons.push('Very low data quality — prediction unreliable');
        else if (dataQ < 0.40) skipReasons.push('Below-average data quality — confidence reduced');
        if (prob < 0.50) skipReasons.push(`Probability too low (${(prob * 100).toFixed(1)}%) for a reliable pick`);

        bestPick.isAvoidedPick = true;
        bestPick.avoidReason = skipReasons.length > 0
          ? skipReasons.join('. ')
          : `Model does not recommend this pick — insufficient edge or value`;
      }
    } else if (syncedAdvisorStatus === 'SKIP') {
      // SKIP but no rankedCandidates to cascade through
      const skipReasons = [];
      if (isRestricted) skipReasons.push('Restricted league — limited data reliability');
      if (valueTier.tier === 'JUNK') skipReasons.push(`Odds at ${(odds ?? 0).toFixed(2)} offer no value`);
      if (valueTier.tier === 'NEGATIVE_EV') skipReasons.push(`Negative expected value (${(ev != null ? (ev * 100).toFixed(1) : '?')}%) — not profitable`);
      if (dataQ < 0.20) skipReasons.push('Very low data quality — prediction unreliable');
      else if (dataQ < 0.40) skipReasons.push('Below-average data quality — confidence reduced');
      if (prob < 0.50) skipReasons.push(`Probability too low (${(prob * 100).toFixed(1)}%) for a reliable pick`);

      bestPick.isAvoidedPick = true;
      bestPick.avoidReason = skipReasons.length > 0
        ? skipReasons.join('. ')
        : `Model does not recommend this pick — insufficient edge or value`;
    }

    // ── Phase 4B: Accumulator-Eligible Flag ───────────────────────────────
    // Separate "good for singles" from "good for accumulators"
    // ACCA-eligible: solid probability (≥58%), odds in useful range (1.30-1.65),
    // positive or near-neutral EV, not chaotic
    // NOTE: Use bestPick values (may differ from local vars if cascade promoted a new pick)
    const bp = bestPick;
    const bpProb = safeNum(bp.modelProbability, 0);
    const bpOdds = safeNum(bp.bookmakerOdds, 0);
    const bpImpl = safeNum(bp.impliedProbability, 0);
    const bpEdge = safeNum(bp.edge, 0);
    const bpEv = bpOdds > 1.0 ? (bpProb * bpOdds) - 1 : null;
    const bpValueTier = bp.valueTier || classifyValueTier(bp).tier;

    const isAccaEligible = bpProb >= 0.58 &&
      (bpOdds >= 1.30 && bpOdds <= 1.65) &&
      (bpEv == null || bpEv >= -0.05) &&
      confidence.volatility !== 'high' &&
      syncedAdvisorStatus !== 'SKIP';

    bp.isAccaEligible = isAccaEligible;

    // Safe Bet = probability >= 72%, low volatility, decent odds
    bp.isSafeBet = bpProb >= 0.72 && confidence.volatility === 'low' && bpOdds >= 1.25;

    // Value Bet = positive EV with decent edge
    bp.isValueBet = (bpImpl > 0) && (bpEdge >= 0.08);

    // ── Phase 4C: Risk Reward Data ────────────────────────────────────────
    bp.riskReward = {
      odds: bpOdds > 0 ? parseFloat(bpOdds.toFixed(2)) : null,
      ev: bpEv != null ? parseFloat(bpEv.toFixed(4)) : null,
      probability: parseFloat(bpProb.toFixed(4)),
      impliedProbability: bpImpl > 0 ? parseFloat(bpImpl.toFixed(4)) : null,
      edge: bpEdge !== 0 ? parseFloat(bpEdge.toFixed(4)) : null,
      tier: bpValueTier,
      tierLabel: bp.valueTierLabel || classifyValueTier(bp).tierLabel,
    };
  }

  const featureEvidence = {
    formUsed: features.homePointsLast5 != null && features.awayPointsLast5 != null,
    h2hUsed: (features.h2hMatchesAvailable || 0) > 0,
    xgUsed: xg.homeExpectedGoals > 0 && xg.awayExpectedGoals > 0,
    tacticalUsed: !!(features.tacticalMatchup && features.tacticalMatchup.tacticalConfidence !== 'low'),
    sharpUsed: !!features.bestOdds || !!(
      features.polymarketOdds?.odds &&
      Object.values(features.polymarketOdds.odds).some((market) =>
        market && typeof market === 'object' && Object.values(market).some((value) => Number.isFinite(value) && value > 0)
      )
    ),
    injuriesUsed: features.homeMissingXgImpact > 0 || features.awayMissingXgImpact > 0,
  };

  // ── AVOID-badge sync: if bestPick has AVOID badge, upgrade to smart abstention ──
  // This ensures the adapter and UI treat AVOID picks as "no safe pick" rather than
  // showing "Our Best Bet" with an AVOID badge — a confusing contradiction.
  const isAvoidedPick = bestPick?.isAvoidedPick === true;
  const finalNoSafePick = noSafePick || isAvoidedPick;
  const finalNoSafePickReason = noSafePickReason
    || (isAvoidedPick ? bestPick.avoidReason : null)
    || null;
  const finalAbstainCode = abstainCode
    || (isAvoidedPick ? 'AVOID_BADGE_NO_PICK' : null)
    || null;

  const result = {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    script: { primary: script.primary, secondary: script.secondary, confidence: script.confidence, homeControlScore: script.homeControlScore, awayControlScore: script.awayControlScore, eventLevelScore: script.eventLevelScore, volatilityScore: script.volatilityScore },
    tacticalMatchup: features.tacticalMatchup || tacticalMatchup,
    expectedGoals: { home: xg.homeExpectedGoals, away: xg.awayExpectedGoals, total: xg.totalExpectedGoals },
    calibratedProbs,
    bestPick,
    backupPicks,
    noSafePick: finalNoSafePick,
    noSafePickReason: finalNoSafePickReason,
    abstainCode: finalAbstainCode,
    layer2Override: { triggered: layer2Override, applied: layer2OverrideApplied, shiftMarket: maxShiftMarket, shiftPp: parseFloat(((maxShift||0)*100).toFixed(1)), dataComplete: features.dataCompletenessScore ?? null },
    confidence,
    reasonCodes,
    rankedMarkets: rankedCandidates,
    correctScoreProbs,
    topProbKey: topProbKey || null,
    features,
    featureEvidence,
    narrative: narrative || null,
    contextMods: contextMods || null,
    reasonChain: reasonChain || null,
    updatedAt: new Date().toISOString(),
  };
  await savePrediction(result).catch(e => console.error("[finalize] save failed:", e.message));
  if (bestPick?.marketKey) await logRecommendedMarket(fixtureId, bestPick.marketKey, bestPick.selection || bestPick.marketKey).catch(e => console.error("[finalize] tracking failed:", e.message));
  return result;
}
