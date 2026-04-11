/**
 * computePremiumStatsBoosts.js — Premium Stats Modifier (Layer 3)
 *
 * STATUS: NOT ACTIVE — requires a higher LiveScore API plan.
 *
 * The LiveScore /matches/stats.json endpoint only returns data for live matches
 * in top leagues with a higher data tier. All calls currently return null.
 *
 * WHAT THIS WILL DO (when activated):
 *   - Shots on target differential → pressure dominance signal
 *   - Possession imbalance → control vs counter-attack fingerprint
 *   - Dangerous attacks → quality chance creation
 *   - Corner dominance → set-piece threat modifier
 *
 * INTEGRATION PATTERN (ready to wire in when data is available):
 *   const { homeXgBoost, awayXgBoost } = computePremiumStatsBoosts(fv);
 *   homeXg = homeXg * (1 + homeXgBoost);
 *   awayXg = awayXg * (1 + awayXgBoost);
 *
 * ACTIVATION CHECKLIST:
 *   [ ] Upgrade LiveScore API plan to include match stats
 *   [ ] Verify /matches/stats.json returns non-null for target leagues
 *   [ ] Uncomment fetchHistoricalStats in enrichmentService.js
 *   [ ] Uncomment Layer 3 call in estimateExpectedGoals.js
 *   [ ] Run unit tests in computePremiumStatsBoosts.test.js
 */

/**
 * Returns zero boosts — premium stats not yet available.
 *
 * @param {object} _fv - feature vector (unused until activated)
 * @returns {{ homeXgBoost: 0, awayXgBoost: 0, active: false }}
 */
export function computePremiumStatsBoosts(_fv) {
  return {
    homeXgBoost: 0,
    awayXgBoost: 0,
    active: false,
  };
}
