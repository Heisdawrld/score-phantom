import { safeNum } from '../utils/math.js';

/**
 * Select the best pick from ranked market candidates.
 *
 * Rules:
 * 1. If scriptOutput.primary === 'chaotic_unreliable' AND confidence > 0.65 => noSafePick
 * 2. If featureVector.matchChaosScore > 0.78 => noSafePick
 * 3. If ranked[0].finalScore - ranked[1].finalScore < 0.06 => noSafePick (too close)
 * 4. Else: bestPick = ranked[0], backupPicks = ranked[1..3]
 *
 * @param {MarketCandidate[]} rankedCandidates - sorted by finalScore desc
 * @param {object} scriptOutput
 * @param {object} featureVector
 * @returns {{ bestPick, backupPicks, noSafePick }}
 */
export function selectBestPick(rankedCandidates, scriptOutput, featureVector, options = {}) {
  const ranked = rankedCandidates || [];
  const fv = featureVector || {};
  const script = scriptOutput || {};

  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);

  // Rule 1: chaotic script with high confidence
  if (script.primary === 'chaotic_unreliable' && safeNum(script.confidence, 0) > 0.65) {
    return {
      bestPick: null,
      backupPicks: ranked.slice(0, 3),
      noSafePick: true,
      noSafePickReason: 'Match classified as chaotic_unreliable with high confidence',
    };
  }

  // Rule 2: high chaos score (relaxed from 0.85 to 0.88)
  if (matchChaosScore > 0.88) {
    return {
      bestPick: null,
      backupPicks: ranked.slice(0, 3),
      noSafePick: true,
      noSafePickReason: 'Match chaos score too high — insufficient data or volatile match',
    };
  }

  // Not enough candidates
  if (ranked.length === 0) {
    return {
      bestPick: null,
      backupPicks: [],
      noSafePick: true,
      noSafePickReason: 'No market candidates passed filters',
    };
  }

  // Rule 3: top two too close
  // When no odds data is available, the formula can only differentiate via tactical fit and
  // model probability — natural gaps are small (0.006–0.02). Use a lower threshold in that case.
  if (ranked.length >= 2) {
    const hasOdds = ranked.some(c => c.edge != null && c.edge !== 0);
    // Improved thresholds: 0.018 with odds, 0.012 without (increased from 0.004 for better differentiation)
    const minGap = hasOdds ? 0.018 : 0.012;
    const gap = safeNum(ranked[0].finalScore, 0) - safeNum(ranked[1].finalScore, 0);
    if (gap < minGap) {
      // ── Layer 2 Pick Override ──────────────────────────────────────────────────
      // If Layer 2 caused a ≥ 6pp probability shift AND data quality is ≥ good,
      // trust the form signal and force the top-ranked pick even when the gap is
      // too narrow for a normal selection.
      if (options.layer2Override && ranked.length > 0) {
        const shiftPp = ((options.layer2ShiftPp ?? 0) * 100).toFixed(1);
        const mkt     = options.layer2ShiftMarket ?? 'unknown';
        console.log(
          `[PICK OVERRIDE] Applied | gap=${gap.toFixed(4)} (< ${minGap} threshold) ` +
          `L2-shift=${shiftPp}pp on "${mkt}" | ` +
          `pick="${ranked[0].marketKey}" ` +
          `prob=${(safeNum(ranked[0].modelProbability, 0) * 100).toFixed(1)}% ` +
          `tacticalFit=${safeNum(ranked[0].tacticalFitScore, 0).toFixed(3)}`
        );
        return {
          bestPick: ranked[0],
          backupPicks: ranked.slice(1, 4),
          noSafePick: false,
          noSafePickReason: null,
          layer2OverrideApplied: true,
        };
      }

      // Without odds, fall back to best tactical fit + probability instead of rejecting outright
      if (!hasOdds) {
        const byTacticalScore = [...ranked].sort((a, b) => {
          const aScore = safeNum(a.tacticalFitScore, 0) * 0.6 + safeNum(a.modelProbability, 0) * 0.4;
          const bScore = safeNum(b.tacticalFitScore, 0) * 0.6 + safeNum(b.modelProbability, 0) * 0.4;
          return bScore - aScore;
        });
        const tacticalGap = (safeNum(byTacticalScore[0].tacticalFitScore, 0) * 0.6 + safeNum(byTacticalScore[0].modelProbability, 0) * 0.4) -
                            (safeNum(byTacticalScore[1].tacticalFitScore, 0) * 0.6 + safeNum(byTacticalScore[1].modelProbability, 0) * 0.4);
        if (tacticalGap >= 0.02) {
          // Sufficient tactical separation — use the tactically best pick
          return {
            bestPick: byTacticalScore[0],
            backupPicks: byTacticalScore.slice(1, 4),
            noSafePick: false,
            noSafePickReason: null,
          };
        }
      }
      return {
        bestPick: null,
        backupPicks: ranked.slice(0, 3),
        noSafePick: true,
        noSafePickReason: `Top two picks too close (gap=${gap.toFixed(3)}) — no clear best market`,
      };
    }
  }

  // Rule 4: pick the winner
  return {
    bestPick: ranked[0],
    backupPicks: ranked.slice(1, 4),
    noSafePick: false,
    noSafePickReason: null,
  };
}
