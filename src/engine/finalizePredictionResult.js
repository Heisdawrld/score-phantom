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
  const { bestPick, backupPicks, noSafePick, noSafePickReason, abstainCode, rankedCandidates, layer2Override, layer2OverrideApplied, maxShift, maxShiftMarket, topProbKey } = selection;
  const confidence = buildConfidenceProfile(bestPick, features);
  const reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);

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

    // ── SKIP sync — when badge is SKIP, treat as smart abstention ──
    // The engine still provides the pick data for transparency (showing what we found
    // and why we're skipping it), but flags it so the UI doesn't display "Our Best Bet".
    // This prevents the SKIP + "Our Best Bet" contradiction.
    if (syncedAdvisorStatus === 'SKIP') {
      const skipReasons = [];
      if (isRestricted) skipReasons.push('Restricted league — limited data reliability');
      if (valueTier.tier === 'JUNK') skipReasons.push(`Odds at ${odds.toFixed(2)} offer no value`);
      if (valueTier.tier === 'NEGATIVE_EV') skipReasons.push(`Negative expected value (${(ev * 100).toFixed(1)}%) — not profitable`);
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
    const isAccaEligible = prob >= 0.58 &&
      (odds != null && odds >= 1.30 && odds <= 1.65) &&
      (ev == null || ev >= -0.05) &&
      confidence.volatility !== 'high' &&
      syncedAdvisorStatus !== 'SKIP';

    bestPick.isAccaEligible = isAccaEligible;

    // Safe Bet = probability >= 72%, low volatility, decent odds
    bestPick.isSafeBet = prob >= 0.72 && confidence.volatility === 'low' && (odds != null && odds >= 1.25);

    // Value Bet = positive EV with decent edge
    bestPick.isValueBet = (impl != null && impl > 0) && (edge != null && edge >= 0.08);

    // ── Phase 4C: Risk Reward Data ────────────────────────────────────────
    bestPick.riskReward = {
      odds: odds != null ? parseFloat(odds.toFixed(2)) : null,
      ev: ev != null ? parseFloat(ev.toFixed(4)) : null,
      probability: parseFloat(prob.toFixed(4)),
      impliedProbability: (impl != null && impl > 0) ? parseFloat(impl.toFixed(4)) : null,
      edge: edge != null ? parseFloat(edge.toFixed(4)) : null,
      tier: valueTier.tier,
      tierLabel: valueTier.tierLabel,
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
