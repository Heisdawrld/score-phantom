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
export function selectBestPick(rankedCandidates, scriptOutput, featureVector) {
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

  // Rule 2: high chaos score
  if (matchChaosScore > 0.85) {
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
  if (ranked.length >= 2) {
    const gap = safeNum(ranked[0].finalScore, 0) - safeNum(ranked[1].finalScore, 0);
    if (gap < 0.035) {
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
