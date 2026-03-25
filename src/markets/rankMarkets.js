/**
 * Sort market candidates by finalScore descending.
 *
 * @param {MarketCandidate[]} candidates
 * @returns {MarketCandidate[]} sorted candidates
 */
export function rankMarkets(candidates) {
  return [...candidates].sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}
