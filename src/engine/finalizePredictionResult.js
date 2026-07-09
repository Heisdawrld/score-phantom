import { safeNum } from "../utils/math.js";
import { buildConfidenceProfile } from "./buildConfidenceProfile.js";
import { buildReasonCodes } from "./buildReasonCodes.js";
import { savePrediction } from "../storage/savePrediction.js";
import { logRecommendedMarket } from "../storage/marketTracking.js";
import { classifyValueTier } from "../markets/valueTiers.js";
import { getMarketEscalationTargets, isJunkOdds, isAcceptableOdds } from "../markets/marketWorthRanges.js";
import { buildMarketLadder, buildPhantomVerdictPayload } from './buildPhantomVerdict.js';

/**
 * Stage 4 — Finalize prediction result.
 * Builds confidence profile, reason codes, assembles the result object,
 * persists to DB, logs market tracking. Returns the full prediction.
 *
 * v5: Intelligent Analyst — 3-tier badge (BET/ACCA/SKIP), per-market worth,
 *     3-pass punter-style SKIP cascade, context-aware escalation.
 */
export async function finalizePredictionResult({ fixtureId, homeTeamName, awayTeamName, script, xg, calibratedProbs, features, selection, tacticalMatchup, scoreMatrix, narrative, contextMods, reasonChain, ensembleMeta = null }) {
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
    const impl = bestPick.impliedProbability ?? null;
    const edge = bestPick.edge ?? null;
    const finalScore = bestPick.finalScore ?? 0;
    const odds = bestPick.bookmakerOdds ?? null;

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
    const dataQ = features.dataCompletenessScore ?? 0.5;
    const matchChaos = safeNum(features.matchChaosScore, 0.5);
    const upsetRisk = safeNum(features.upsetRiskScore, 0.5);
    const predScore = (dataQ * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);
    const isRestricted = bestPick.leagueSignal?.status === 'restricted';
    const ev = (odds != null && odds > 1.0) ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;

    let syncedAdvisorStatus;

    if (isRestricted) {
      syncedAdvisorStatus = prob >= 0.65 ? 'ACCA' : 'SKIP';
    } else if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
      syncedAdvisorStatus = 'SKIP';
    } else if (valueTier.tier === 'ACCUMULATOR') {
      syncedAdvisorStatus = 'ACCA';
    } else if (valueTier.tier === 'STRONG' || valueTier.tier === 'VALUE') {
      syncedAdvisorStatus = (isPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
    } else if (valueTier.tier === 'SHARP') {
      syncedAdvisorStatus = isPositiveEV ? 'BET' : 'SKIP';
    } else if (prob >= 0.72 && odds >= 1.30) {
      syncedAdvisorStatus = predScore < 0.20 ? 'ACCA' : 'BET';
    } else if (prob >= 0.58 && odds >= 1.30 && odds <= 1.65) {
      syncedAdvisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
    } else if (prob >= 0.60 && odds >= 1.25) {
      syncedAdvisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
    } else if (prob >= 0.50 && isPositiveEV) {
      syncedAdvisorStatus = 'ACCA';
    } else if (prob >= 0.50) {
      syncedAdvisorStatus = predScore >= 0.40 ? 'ACCA' : 'SKIP';
    } else {
      syncedAdvisorStatus = 'SKIP';
    }
    bestPick.advisor_status = syncedAdvisorStatus;

    // ── 3-PASS SKIP CASCADE — The Punter's Instinct ──────────────────────
    // When the #1 pick gets SKIP'd, the engine thinks like a punter:
    //
    //   PASS 1: Natural Escalation — "Home Win at 1.20 is disrespectful,
    //           can they score 2? → Home Over 1.5, Home -1, Win Either Half"
    //   PASS 2: Broad BET Scan — "OK, what market IS worth betting on?"
    //           Find the best BET-badge pick across all markets
    //   PASS 3: ACCA Lifeline — "Nothing earns BET? What about ACCA?
    //           Needs high confidence (≥65%) and decent score"
    //
    // The cascade uses per-market worth ranges so each market's odds are
    // judged against its OWN thresholds, not a flat 1.25 gate.
    if (syncedAdvisorStatus === 'SKIP' && rankedCandidates && rankedCandidates.length > 1) {
      const originalSkipPick = bestPick;
      const originalSkipReason = (() => {
        const reasons = [];
        if (isRestricted) reasons.push('Restricted league');
        if (valueTier.tier === 'JUNK') reasons.push(`Odds at ${(odds ?? 0).toFixed(2)} offer no value`);
        if (valueTier.tier === 'NEGATIVE_EV') reasons.push('Negative EV');
        return reasons.length > 0 ? reasons.join(', ') : 'Insufficient edge or value';
      })();

      // ── Helper: Confidence gates for promoted picks ──────────────────────
      // These ensure the engine genuinely trusts the promoted pick.
      const passesConfidenceGates = (c) => {
        const cProb = safeNum(c.modelProbability, 0);
        const cOdds = safeNum(c.bookmakerOdds, 0);
        const cFinalScore = safeNum(c.finalScore, 0);
        const cPhantomScore = (cProb * 0.55) + (cFinalScore * 0.45);
        const cDataScore = safeNum(features.dataCompletenessScore, 0.5);
        const cEdge = safeNum(c.edge, 0);
        const cTacticalFit = safeNum(c.tacticalFitScore, 0);
        const cVolatilityScore = safeNum(script?.volatilityScore, 0.5);
        const cChaos = safeNum(features.matchChaosScore, 0.5);

        // Gate 1: Minimum probability
        if (cProb < 0.50) return false;
        // Gate 2: Minimum composite score
        if (cFinalScore < 0.25) return false;
        // Gate 3: Minimum phantom score
        if (cPhantomScore < 0.45) return false;
        // Gate 4: Minimum data quality
        if (cDataScore < 0.25) return false;
        // Gate 5: Volatility/chaos extra proof
        if (cVolatilityScore > 0.70 || cChaos >= 0.68) {
          if (cPhantomScore < 0.55) return false;
          if (cFinalScore < 0.35) return false;
          if (cProb < 0.65) return false;
        }
        // Gate 6: Tactical alignment
        if (cTacticalFit < 0.12) return false;
        // Gate 7: Odds must be in acceptable range for THIS market
        if (cOdds > 1.0 && !isAcceptableOdds(c.marketKey, cOdds) && cProb < 0.70) return false;
        // Gate 8: Weak EV with odds — bookmaker disagrees strongly
        const cImpl = safeNum(c.impliedProbability, 0);
        if (cImpl > 0 && cEdge < 0.01 && cProb < 0.72) return false;

        return true;
      };

      // ── Helper: Compute badge for a promoted candidate ───────────────────
      const computeCandidateBadge = (c) => {
        const cProb = safeNum(c.modelProbability, 0);
        const cOdds = safeNum(c.bookmakerOdds, 0);
        const cValueTier = classifyValueTier(c);
        const cEv = cOdds > 1.0 ? (cProb * cOdds) - 1 : null;
        const cIsPositiveEV = cEv != null && cEv >= 0;
        const cIsRestricted = c.leagueSignal?.status === 'restricted';

        if (cIsRestricted && cProb < 0.65) return 'SKIP';
        if (cValueTier.tier === 'JUNK' || cValueTier.tier === 'NEGATIVE_EV') return 'SKIP';
        if (cValueTier.tier === 'ACCUMULATOR') return 'ACCA';
        if (cValueTier.tier === 'STRONG' || cValueTier.tier === 'VALUE') return (cIsPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
        if (cValueTier.tier === 'SHARP') return cIsPositiveEV ? 'BET' : 'SKIP';
        if (cProb >= 0.72 && cOdds >= 1.30) return predScore < 0.20 ? 'ACCA' : 'BET';
        if (cProb >= 0.58 && cOdds >= 1.30 && cOdds <= 1.65) return predScore < 0.20 ? 'SKIP' : 'ACCA';
        if (cProb >= 0.60 && cOdds >= 1.25) return predScore < 0.20 ? 'SKIP' : 'ACCA';
        if (cProb >= 0.50 && cIsPositiveEV) return 'ACCA';
        if (cProb >= 0.50) return predScore >= 0.40 ? 'ACCA' : 'SKIP';
        return 'SKIP';
      };

      let promotedCandidate = null;
      let promotedBadge = 'SKIP';
      let cascadePass = '';

      // ── PASS 1: Natural Escalation (Punter Instinct) ────────────────────
      // When a market has junk odds, check its natural escalation targets first.
      // Home Win at 1.20 → check Home -1, Home Over 1.5, Win Either Half
      // Over 1.5 at 1.22 → check Over 2.5, BTTS, Home/Away Over 1.5
      const { targets, reason } = getMarketEscalationTargets(originalSkipPick.marketKey);

      for (const target of targets) {
        const candidate = rankedCandidates.find(c => c.marketKey === target && c !== originalSkipPick);
        if (!candidate) continue;
        if (!passesConfidenceGates(candidate)) continue;

        const badge = computeCandidateBadge(candidate);
        if (badge !== 'SKIP') {
          promotedCandidate = candidate;
          promotedBadge = badge;
          cascadePass = `P1(natural: ${originalSkipPick.marketKey}→${target})`;
          break; // First valid natural escalation wins
        }
      }

      // ── PASS 2: Broad BET Scan ──────────────────────────────────────────
      // No natural escalation worked. Find the BEST BET-badge pick across ALL markets.
      // The punter asks: "What market IS worth betting on?"
      if (!promotedCandidate) {
        for (const candidate of rankedCandidates) {
          if (candidate === originalSkipPick) continue;
          if (!passesConfidenceGates(candidate)) continue;

          const badge = computeCandidateBadge(candidate);
          if (badge === 'BET') {
            promotedCandidate = candidate;
            promotedBadge = badge;
            cascadePass = `P2(BET scan: ${candidate.marketKey})`;
            break; // First BET wins (ranked by score already)
          }
        }
      }

      // ── PASS 3: ACCA Lifeline ───────────────────────────────────────────
      // No BET found. Check for high-confidence ACCA picks (prob ≥ 0.65).
      // The punter asks: "Nothing is strong enough for a single? What about ACCA?"
      if (!promotedCandidate) {
        for (const candidate of rankedCandidates) {
          if (candidate === originalSkipPick) continue;
          const cProb = safeNum(candidate.modelProbability, 0);
          const cFinalScore = safeNum(candidate.finalScore, 0);
          // ACCA lifeline: higher bar — must be genuinely confident
          if (cProb < 0.65) continue;
          if (cFinalScore < 0.30) continue;
          if (!passesConfidenceGates(candidate)) continue;

          const badge = computeCandidateBadge(candidate);
          if (badge === 'ACCA') {
            promotedCandidate = candidate;
            promotedBadge = badge;
            cascadePass = `P3(ACCA lifeline: ${candidate.marketKey})`;
            break;
          }
        }
      }

      // ── Promote the found candidate ─────────────────────────────────────
      if (promotedCandidate && promotedBadge !== 'SKIP') {
        const cProb = safeNum(promotedCandidate.modelProbability, 0);
        const cFinalScore = safeNum(promotedCandidate.finalScore, 0);
        const cOdds = safeNum(promotedCandidate.bookmakerOdds, 0);
        const cEv = cOdds > 1.0 ? (cProb * cOdds) - 1 : null;

        console.log(`[finalize] SKIP cascade ${cascadePass}: ${originalSkipPick.marketKey}(${originalSkipPick.selection}) → ${promotedCandidate.marketKey}(${promotedCandidate.selection}) badge=${promotedBadge} prob=${(cProb*100).toFixed(1)}% score=${cFinalScore.toFixed(3)} odds=${cOdds.toFixed(2)} ev=${cEv != null ? (cEv*100).toFixed(1) + '%' : 'N/A'}`);

        const cValueTier = classifyValueTier(promotedCandidate);
        const cPhantomScoreRaw = (cProb * 0.55) + (cFinalScore * 0.45);
        promotedCandidate.displayedConfidence = parseFloat((cProb * 100).toFixed(1));
        promotedCandidate.phantomScoreRaw = parseFloat(cPhantomScoreRaw.toFixed(4));
        promotedCandidate.valueTier = cValueTier.tier;
        promotedCandidate.valueTierLabel = cValueTier.tierLabel;
        promotedCandidate.valueTierDescription = cValueTier.tierDescription;
        promotedCandidate.ev = cValueTier.ev;
        promotedCandidate.advisor_status = promotedBadge;

        // Preserve the original SKIP as a skip note for transparency
        promotedCandidate.skipNote = {
          originalPick: originalSkipPick.marketKey,
          originalSelection: originalSkipPick.selection,
          originalProb: originalSkipPick.modelProbability,
          originalOdds: originalSkipPick.bookmakerOdds,
          reason: originalSkipReason,
          cascadePass,
        };

        bestPick = promotedCandidate;
        syncedAdvisorStatus = promotedBadge;
        confidence = buildConfidenceProfile(bestPick, features);
        reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);
      } else {
        // Cascade didn't find anything — mark original as SKIP
        console.log(`[finalize] SKIP cascade: no quality alternative found for ${originalSkipPick.marketKey} — ${rankedCandidates.length - 1} alternatives checked across 3 passes`);
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
    bp.isSafeBet = bpProb >= 0.72 && confidence.volatility === 'low' && bpOdds >= 1.25;
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
    sharpUsed: !!features.bestOdds,
    injuriesUsed: features.homeMissingXgImpact > 0 || features.awayMissingXgImpact > 0,
  };

  // ── AVOID-badge sync ──────────────────────────────────────────────────
  const isAvoidedPick = bestPick?.isAvoidedPick === true;
  const finalNoSafePick = noSafePick || isAvoidedPick;
  const finalNoSafePickReason = noSafePickReason
    || (isAvoidedPick ? bestPick.avoidReason : null)
    || null;
  const finalAbstainCode = abstainCode
    || (isAvoidedPick ? 'AVOID_BADGE_NO_PICK' : null)
    || null;

  const marketLadder = finalNoSafePick
    ? []
    : buildMarketLadder({
      rankedCandidates,
      bestPick,
      narrative,
      features,
      limit: 4,
    });

  const phantomVerdict = buildPhantomVerdictPayload({
    bestPick,
    noSafePick: finalNoSafePick,
    noSafePickReason: finalNoSafePickReason,
    features,
    narrative,
    reasonChain,
    script,
    marketLadder,
  });

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
    marketLadder,
    phantomVerdict,
    correctScoreProbs,
    topProbKey: topProbKey || null,
    features,
    featureEvidence,
    narrative: narrative || null,
    contextMods: contextMods || null,
    reasonChain: reasonChain || null,
    ensembleMeta,  // NEW — ensemble agreement signal for UI
    updatedAt: new Date().toISOString(),
  };
  await savePrediction(result).catch(e => console.error("[finalize] save failed:", e.message));
  if (bestPick?.marketKey) await logRecommendedMarket(fixtureId, bestPick.marketKey, bestPick.selection || bestPick.marketKey).catch(e => console.error("[finalize] tracking failed:", e.message));
  return result;
}
