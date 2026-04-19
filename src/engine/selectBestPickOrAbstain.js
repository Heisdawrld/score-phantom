import { safeNum } from '../utils/math.js';
import { computeRiskLevel, computeEdgeLabel } from './selectBestPick.js';

function annotate(pick, fv, script) {
  if (!pick) return pick;
  const riskLevel = computeRiskLevel(pick, fv, script);
  const edgeLabel = computeEdgeLabel(pick, riskLevel);
  return { ...pick, riskLevel, edgeLabel };
}

/**
 * selectBestPickOrAbstain — strict final selection gate.
 *
 * Unlike selectBestPick which is outcome-of-failure, this function
 * treats abstaining as a FIRST-CLASS deliberate decision.
 *
 * Abstain conditions (checked in order):
 *   A. No candidates survived pruning
 *   B. Best candidate probability < 0.62 (raised floor vs old 0.60)
 *   C. Top two candidates too close in finalScore (weak separation)
 *   D. Best pick edge label is NO EDGE (bookmaker strongly disagrees)
 *   E. Layer 2 override can rescue a close call (existing logic)
 *
 * @returns {{ bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied }}
 */
export function selectBestPickOrAbstain(rankedCandidates, scriptOutput, featureVector, options = {}) {
  const ranked = rankedCandidates || [];
  const fv     = featureVector   || {};
  const script = scriptOutput    || {};
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

  const top  = ranked[0];
  const topProb = safeNum(top.modelProbability, 0);

  // B. Probability floor (restored to 0.55 to allow value edge picks)
  if (topProb < 0.55) return abstain('Best pick probability too low (' + (topProb*100).toFixed(1) + '% < 55% floor)', 'LOW_PROBABILITY');

  // C. Separation check (top two too close)
  if (ranked.length >= 2) {
    const hasOdds = ranked.some(c => c.edge != null && c.edge !== 0);
    const minGap  = hasOdds ? 0.010 : 0.008;
    const gap     = safeNum(top.finalScore, 0) - safeNum(ranked[1].finalScore, 0);
    if (gap < minGap) {
      // ── Rescue: both top picks are genuinely strong — trust the top one ──────
      // Two strong picks near-tied is NOT the same as no picks.
      const secondProb = safeNum(ranked[1].modelProbability, 0);
      if (topProb >= 0.60 && secondProb >= 0.60) {
        console.log('[selectBestPickOrAbstain] Both top picks strong (' + (topProb*100).toFixed(1) + '% + ' + (secondProb*100).toFixed(1) + '%) — picking top despite small gap=' + gap.toFixed(4));
        return { bestPick: annotate(top, fv, script), backupPicks: ranked.slice(1,3).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: false, abstainCode: null };
      }
      // E. Layer 2 override can rescue a close call
      if (options.layer2Override) {
        const shiftPp = ((options.layer2ShiftPp ?? 0) * 100).toFixed(1);
        console.log('[selectBestPickOrAbstain] L2 override rescued close call — gap=' + gap.toFixed(4) + ' L2=' + shiftPp + 'pp');
        return { bestPick: annotate(top, fv, script), backupPicks: ranked.slice(1,3).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: true, abstainCode: null };
      }
      // No-odds tactical tiebreak
      if (!hasOdds && ranked.length >= 2) {
        const byTactical = [...ranked].sort((a,b) => {
          const as = safeNum(a.tacticalFitScore,0)*0.6 + safeNum(a.modelProbability,0)*0.4;
          const bs = safeNum(b.tacticalFitScore,0)*0.6 + safeNum(b.modelProbability,0)*0.4;
          return bs - as;
        });
        const tGap = (safeNum(byTactical[0].tacticalFitScore,0)*0.6 + safeNum(byTactical[0].modelProbability,0)*0.4) - (safeNum(byTactical[1].tacticalFitScore,0)*0.6 + safeNum(byTactical[1].modelProbability,0)*0.4);
        if (tGap >= 0.025) return { bestPick: annotate(byTactical[0],fv,script), backupPicks: byTactical.slice(1,3).map(p=>annotate(p,fv,script)), noSafePick: false, noSafePickReason: null, layer2OverrideApplied: false, abstainCode: null };
      }
      return abstain('Top two markets too close (gap=' + gap.toFixed(3) + ') — no clear winner', 'WEAK_SEPARATION');
    }
  }

  // D. Edge label gate — reject if bookmaker strongly disagrees
  // Skip this gate when odds data is unavailable — can't penalise missing data.
  const annotatedTop = annotate(top, fv, script);
  const hasAnyOdds = ranked.some(c => c.edge != null && c.edge !== 0);
  if (hasAnyOdds && annotatedTop.edgeLabel === 'NO EDGE') {
    return abstain('Best pick has NO EDGE — bookmaker implied probability too high vs model', 'NO_EDGE');
  }

  // All gates passed — commit to this pick
  return {
    bestPick: annotatedTop,
    backupPicks: ranked.slice(1, 3).map(p => annotate(p, fv, script)),
    noSafePick: false,
    noSafePickReason: null,
    layer2OverrideApplied: false,
    abstainCode: null,
  };
}
