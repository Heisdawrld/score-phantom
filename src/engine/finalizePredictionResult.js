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
    const prob = bestPick.modelProbability || 0;
    const impl = bestPick.impliedProbability || 0;
    const edge = bestPick.edge || 0;
    const finalScore = bestPick.finalScore || 0;
    const odds = bestPick.bookmakerOdds || 0;

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

    // ── Phase 4A: EV-Aware Advisor Badge Sync ─────────────────────────────
    // The badge now considers both probability AND odds value.
    // A 72% pick at 1.14 odds is NOT FIRE — it's JUNK or ACCUMULATOR at best.
    // A 52% pick at 2.00 odds with +4% EV IS a VALUE pick.
    const dataQ = features.dataCompletenessScore || 0.5;
    const isRestricted = bestPick.leagueSignal?.status === 'restricted';
    const ev = odds > 1.0 ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;

    let syncedAdvisorStatus;

    if (isRestricted) {
      syncedAdvisorStatus = prob >= 0.65 ? 'GAMBLE' : 'AVOID';
    } else if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
      // Junk odds or negative EV — NEVER badge as FIRE or RECOMMENDED
      syncedAdvisorStatus = 'AVOID';
    } else if (valueTier.tier === 'STRONG') {
      // High prob AND fair odds → FIRE
      syncedAdvisorStatus = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
    } else if (valueTier.tier === 'VALUE') {
      // Moderate prob at good odds → RECOMMENDED if positive EV
      syncedAdvisorStatus = isPositiveEV ? 'RECOMMENDED' : 'GAMBLE';
    } else if (valueTier.tier === 'SHARP') {
      // Low prob at high odds → RECOMMENDED if positive EV, else GAMBLE
      syncedAdvisorStatus = isPositiveEV ? 'RECOMMENDED' : 'GAMBLE';
    } else if (valueTier.tier === 'ACCUMULATOR') {
      // Solid but low odds → GAMBLE (good for ACCAs, not singles)
      syncedAdvisorStatus = 'GAMBLE';
    } else if (prob >= 0.72 && odds >= 1.30) {
      // Classic high probability with decent odds → FIRE
      syncedAdvisorStatus = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
    } else if (prob >= 0.60) {
      syncedAdvisorStatus = dataQ < 0.20 ? 'AVOID' : 'GAMBLE';
    } else if (prob >= 0.50 && isPositiveEV) {
      // ── Phase 3C: CAUTIOUS badge ────────────────────────────────────────
      // Marginal probability but positive EV — not enough for GAMBLE,
      // but too much value to AVOID entirely. Small stakes, ACCA filler.
      syncedAdvisorStatus = 'CAUTIOUS';
    } else if (prob >= 0.50) {
      syncedAdvisorStatus = dataQ >= 0.40 ? 'GAMBLE' : 'AVOID';
    } else {
      syncedAdvisorStatus = 'AVOID';
    }
    bestPick.advisor_status = syncedAdvisorStatus;

    // ── Phase 4A.1: AVOID sync — when badge is AVOID, treat as smart abstention ──
    // The engine still provides the pick data for transparency (showing what we found
    // and why we're avoiding it), but flags it so the UI doesn't display "Our Best Bet".
    // This prevents the AVOID + "Our Best Bet" + VALUE tier contradiction.
    if (syncedAdvisorStatus === 'AVOID') {
      const avoidReasons = [];
      if (isRestricted) avoidReasons.push('Restricted league — limited data reliability');
      if (valueTier.tier === 'JUNK') avoidReasons.push(`Junk odds at ${odds.toFixed(2)} — no value regardless of probability`);
      if (valueTier.tier === 'NEGATIVE_EV') avoidReasons.push(`Negative EV (${(ev * 100).toFixed(1)}%) — not profitable long-term`);
      if (dataQ < 0.20) avoidReasons.push('Very low data quality — prediction unreliable');
      else if (dataQ < 0.40) avoidReasons.push('Below-average data quality — confidence reduced');
      if (prob < 0.50) avoidReasons.push(`Probability too low (${(prob * 100).toFixed(1)}%) for a reliable pick`);

      bestPick.isAvoidedPick = true;
      bestPick.avoidReason = avoidReasons.length > 0
        ? avoidReasons.join('. ')
        : `Model does not recommend this pick — insufficient edge or value`;
    }

    // ── Phase 4B: Accumulator-Eligible Flag ───────────────────────────────
    // Separate "good for singles" from "good for accumulators"
    // ACCA-eligible: solid probability (≥58%), odds in useful range (1.30-1.65),
    // positive or near-neutral EV, not chaotic
    const isAccaEligible = prob >= 0.58 &&
      odds >= 1.30 && odds <= 1.65 &&
      (ev == null || ev >= -0.05) &&
      confidence.volatility !== 'high' &&
      syncedAdvisorStatus !== 'AVOID';

    bestPick.isAccaEligible = isAccaEligible;

    // Safe Bet = probability >= 72%, low volatility, decent odds
    bestPick.isSafeBet = prob >= 0.72 && confidence.volatility === 'low' && odds >= 1.25;

    // Value Bet = positive EV with decent edge
    bestPick.isValueBet = impl > 0 && edge >= 0.08;

    // ── Phase 4C: Risk Reward Data ────────────────────────────────────────
    bestPick.riskReward = {
      odds: parseFloat(odds.toFixed(2)),
      ev: ev != null ? parseFloat(ev.toFixed(4)) : null,
      probability: parseFloat(prob.toFixed(4)),
      impliedProbability: impl > 0 ? parseFloat(impl.toFixed(4)) : null,
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
