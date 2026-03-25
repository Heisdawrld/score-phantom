/**
 * Apply hard reject rules to market candidates.
 *
 * Hard reject:
 * 1. marketKey === 'over_05' (or home/away_over_05 with bad penalty) => reject
 * 2. modelProbability < 0.45 => reject
 * 3. edge !== null && edge < 0.04 => reject
 * 4. badMarketPenalty >= 0.9 => reject
 * 5. tacticalFitScore < 0.25 => reject
 *
 * @param {MarketCandidate[]} candidates
 * @returns {MarketCandidate[]} filtered candidates
 */
export function applyMarketFilters(candidates) {
  return candidates.filter((candidate) => {
    const { marketKey, modelProbability, edge, badMarketPenalty, tacticalFitScore } = candidate;

    // Rule 1: reject over_05 markets entirely
    if (marketKey === 'over_05') return false;
    if (marketKey === 'home_over_05' && (badMarketPenalty ?? 0) >= 0.9) return false;
    if (marketKey === 'away_over_05' && (badMarketPenalty ?? 0) >= 0.9) return false;

    // Rule 2: too low probability
    if ((modelProbability ?? 0) < 0.45) return false;

    // Rule 3: edge is negative (market strongly against us) — only reject when odds available
    // Do NOT reject on small positive edge; that kills all picks for leagues without odds coverage
    if (edge !== null && edge !== undefined && edge < -0.05) return false;

    // Rule 4: bad market penalty too high
    if ((badMarketPenalty ?? 0) >= 0.9) return false;

    // Rule 5: tactical fit too low
    if ((tacticalFitScore ?? DEFAULT_FIT) < 0.25) return false;

    return true;
  });
}

const DEFAULT_FIT = 0.3; // matches default in scoreMarketCandidates
