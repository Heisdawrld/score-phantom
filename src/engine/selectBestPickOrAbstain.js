import { safeNum } from '../utils/math.js';
import { computeRiskLevel, computeEdgeLabel } from './selectBestPick.js';
import { isHeadlineEligibleMarket } from '../markets/marketRegistry.js';

function annotate(pick, fv, script) {
  if (!pick) return pick;
  const riskLevel = computeRiskLevel(pick, fv, script);
  const edgeLabel = computeEdgeLabel(pick, riskLevel);
  return { ...pick, riskLevel, edgeLabel };
}

function phantomScoreOf(candidate) {
  const prob = safeNum(candidate?.modelProbability, 0);
  const finalScore = safeNum(candidate?.finalScore, prob);
  return (prob * 0.55) + (finalScore * 0.45);
}

function isPricedCandidate(candidate) {
  if (!candidate) return false;
  if (!isHeadlineEligibleMarket(candidate.marketKey)) return false;
  const bookmakerOdds = safeNum(candidate.bookmakerOdds, 0);
  if (bookmakerOdds > 1.0) return true;
  const impliedProbability = safeNum(candidate.impliedProbability, 0);
  return impliedProbability > 0 && impliedProbability < 1;
}

function isHeadlineQualityCandidate(candidate, featureVector, scriptOutput) {
  if (!candidate) return false;
  const annotated = annotate(candidate, featureVector, scriptOutput);
  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, 0);
  const phantomScore = phantomScoreOf(candidate);
  const dataScore = safeNum(featureVector?.dataCompletenessScore, 0.5);
  const risk = String(annotated.riskLevel || '').toUpperCase();
  const volatility = String(scriptOutput?.volatility || '').toUpperCase();
  const chaos = safeNum(featureVector?.matchChaosScore, 0.5);
  const edge = safeNum(candidate.edge, 0);

  // Base headline gates: do not headline a market just because raw probability is high.
  if (prob < 0.50) return false;
  if (finalScore < 0.42) return false;
  if (phantomScore < 0.55) return false;
  if (dataScore < 0.30) return false;

  // Aggressive/high-risk picks need extra proof. This prevents combinations like:
  // Raw Model 77%, Phantom 59%, HIGH RISK, but still "Pick This".
  if (risk === 'AGGRESSIVE' || volatility === 'HIGH' || chaos >= 0.68) {
    if (phantomScore < 0.60) return false;
    if (finalScore < 0.48) return false;
    if (prob < 0.65) return false;
  }

  // When bookmaker odds exist, very weak EV should not headline unless the model is elite.
  if (candidate.impliedProbability > 0 && edge < 0.01 && prob < 0.72) return false;

  return true;
}

function isModelOnlyEligible(candidate, featureVector, scriptOutput) {
  if (!candidate) return false;
  if (!isHeadlineEligibleMarket(candidate.marketKey)) return false;

  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, 0);
  const phantomScore = phantomScoreOf(candidate);
  const dataScore = safeNum(featureVector?.dataCompletenessScore, 0.5);
  const chaos = safeNum(featureVector?.matchChaosScore, 0.5);
  const volatility = String(scriptOutput?.volatility || '').toUpperCase();
  const tacticalFit = safeNum(candidate.tacticalFitScore, 0.4);

  // Only allow model-only headlines when the model has enough support.
  // This prevents low-data leagues from pretending to have bookmaker-backed edges.
  if (prob < 0.62) return false;
  if (finalScore < 0.48) return false;
  if (phantomScore < 0.60) return false;
  if (dataScore < 0.50) return false;
  if (chaos > 0.72 || volatility === 'HIGH') return false;
  if (tacticalFit < 0.25) return false;

  return true;
}

/**
 * selectBestPickOrAbstain — strict final selection gate.
 *
 * Priced markets are preferred. If no bookmaker-priced market exists, the engine
 * may still headline a clearly qualified MODEL-ONLY pick, but it is explicitly
 * marked as modelOnly so the UI does not display fake bookmaker edge/value.
 */
export function selectBestPickOrAbstain(rankedCandidates, scriptOutput, featureVector, options = {}) {
  const ranked = rankedCandidates || [];
  const fv     = featureVector   || {};
  const script = scriptOutput    || {};
  const pricedRanked = ranked.filter(isPricedCandidate);
  const qualityPricedRanked = pricedRanked.filter(c => isHeadlineQualityCandidate(c, fv, script));
  const abstain = (reason, code) => ({
    bestPick: null,
    backupPicks: ranked.slice(0, 2).map(p => annotate(p, fv, script)),
    noSafePick: true,
    noSafePickReason: reason,
    abstainCode: code,
    layer2OverrideApplied: false,
  });

  // A. No candidates
  if (ranked.length === 0) return abstain('No candidates survived pruning — nothing to pick', 'NO_CANDIDATES');

  if (pricedRanked.length === 0) {
    const modelOnly = ranked.find(c => isModelOnlyEligible(c, fv, script));
    if (modelOnly) {
      const annotated = annotate({
        ...modelOnly,
        modelOnly: true,
        isModelOnly: true,
        isValueBet: false,
        isSharpValue: false,
        edge: null,
        impliedProbability: null,
        bookmakerOdds: null,
        advisor_status: phantomScoreOf(modelOnly) >= 0.72 ? 'FIRE' : phantomScoreOf(modelOnly) >= 0.55 ? 'GAMBLE' : 'AVOID',
        reasons: [
          'MODEL_ONLY_NO_ODDS',
          ...(modelOnly.reasons || []),
        ],
      }, fv, script);

      return {
        bestPick: annotated,
        backupPicks: ranked.slice(0, 3).filter(p => p !== modelOnly).slice(0, 2).map(p => annotate(p, fv, script)),
        noSafePick: false,
        noSafePickReason: null,
        layer2OverrideApplied: false,
        abstainCode: null,
        modelOnly: true,
      };
    }

    return abstain('No priced markets available — refusing to headline weak unpriced markets', 'NO_PRICED_MARKETS');
  }

  if (qualityPricedRanked.length === 0) {
    const top = pricedRanked[0];
    const prob = safeNum(top?.modelProbability, 0);
    const finalScore = safeNum(top?.finalScore, 0);
    const phantomScore = phantomScoreOf(top);
    return abstain(
      `No headline-quality priced market — top candidate prob=${(prob*100).toFixed(1)}%, final=${(finalScore*100).toFixed(1)}%, phantom=${(phantomScore*100).toFixed(1)}%`,
      'LOW_HEADLINE_QUALITY'
    );
  }

  const top  = qualityPricedRanked[0];
  const topProb = safeNum(top.modelProbability, 0);

  // B. Probability floor — 0.50 minimum to show trial users more predictions
  if (topProb < 0.50) return abstain('Best pick probability too low (' + (topProb*100).toFixed(1) + '% < 50% floor)', 'LOW_PROBABILITY');

  // C. Separation check (top two too close)
  if (qualityPricedRanked.length >= 2) {
    const hasOdds = qualityPricedRanked.some(c => c.edge != null && c.edge !== 0);
    const minGap  = hasOdds ? 0.010 : 0.008;
    const gap     = safeNum(top.finalScore, 0) - safeNum(qualityPricedRanked[1].finalScore, 0);
    if (gap < minGap) {
      // ── Rescue: both top picks are genuinely strong — trust the top one ──────
      // Two strong picks near-tied is NOT the same as no picks.
      const secondProb = safeNum(qualityPricedRanked[1].modelProbability, 0);
      if (topProb >= 0.60 && secondProb >= 0.60) {
        console.log('[selectBestPickOrAbstain] Both top picks strong (' + (topProb*100).toFixed(1) + '% + ' + (secondProb*100).toFixed(1) + '%) — picking top despite small gap=' + gap.toFixed(4));
        return { bestPick: annotate(top, fv, script), backupPicks: ranked.slice(0, 3).filter(p => p !== top).slice(0, 2).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: false, abstainCode: null };
      }
      // E. Layer 2 override can rescue a close call only if the candidate passed headline quality.
      if (options.layer2Override) {
        const shiftPp = ((options.layer2ShiftPp ?? 0) * 100).toFixed(1);
        console.log('[selectBestPickOrAbstain] L2 override rescued close call — gap=' + gap.toFixed(4) + ' L2=' + shiftPp + 'pp');
        return { bestPick: annotate(top, fv, script), backupPicks: ranked.slice(0, 3).filter(p => p !== top).slice(0, 2).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: true, abstainCode: null };
      }
      // No-odds tactical tiebreak
      if (!hasOdds && qualityPricedRanked.length >= 2) {
        const byTactical = [...qualityPricedRanked].sort((a,b) => {
          const as = safeNum(a.tacticalFitScore,0)*0.6 + safeNum(a.modelProbability,0)*0.4;
          const bs = safeNum(b.tacticalFitScore,0)*0.6 + safeNum(b.modelProbability,0)*0.4;
          return bs - as;
        });
        const tGap = (safeNum(byTactical[0].tacticalFitScore,0)*0.6 + safeNum(byTactical[0].modelProbability,0)*0.4) - (safeNum(byTactical[1].tacticalFitScore,0)*0.6 + safeNum(byTactical[1].modelProbability,0)*0.4);
        if (tGap >= 0.025) return { bestPick: annotate(byTactical[0],fv,script), backupPicks: ranked.slice(0, 3).filter(p => p !== byTactical[0]).slice(0, 2).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: false, abstainCode: null };
      }
      return abstain('Top two headline-quality markets too close (gap=' + gap.toFixed(3) + ') — no clear winner', 'WEAK_SEPARATION');
    }
  }

  // D. Edge label gate — reject if bookmaker strongly disagrees
  // Skip this gate when odds data is unavailable — can't penalise missing data.
  const annotatedTop = annotate(top, fv, script);
  const hasAnyOdds = qualityPricedRanked.some(c => c.edge != null && c.edge !== 0);
  if (hasAnyOdds && annotatedTop.edgeLabel === 'NO EDGE') {
    return abstain('Best pick has NO EDGE — bookmaker implied probability too high vs model', 'NO_EDGE');
  }

  // All gates passed — commit to this pick
  return {
    bestPick: annotatedTop,
    backupPicks: ranked.slice(0, 3).filter(p => p !== top).slice(0, 2).map(p => annotate(p, fv, script)),
    noSafePick: false,
    noSafePickReason: null,
    layer2OverrideApplied: false,
    abstainCode: null,
  };
}
