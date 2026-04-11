import { safeNum } from '../utils/math.js';

/**
 * pruneWeakCandidates — removes candidates that don't meet minimum quality bars.
 * Called AFTER scoring (finalScore available) but BEFORE ranking.
 *
 * Prune conditions:
 *   - modelProbability < minProb (default 0.60) — below confidence floor
 *   - edge < minEdge (default -0.08) — bookmaker strongly disagrees
 *   - tacticalFitScore < minTactical (default 0.12) — no tactical basis
 *   - finalScore <= 0 — scored as net-negative value
 */
export function pruneWeakCandidates(scoredCandidates, options = {}) {
  const minProb     = options.minProb     ?? 0.60;
  const minEdge     = options.minEdge     ?? -0.08;
  const minTactical = options.minTactical ?? 0.12;
  const pruned  = [];
  const removed = [];
  for (const c of (scoredCandidates || [])) {
    const prob     = safeNum(c.modelProbability, 0);
    const edge     = safeNum(c.edge, 0);
    const tactical = safeNum(c.tacticalFitScore, 0);
    const score    = safeNum(c.finalScore, 0);
    if (prob < minProb) { removed.push(c.marketKey + '(prob=' + (prob*100).toFixed(1) + '%)'); continue; }
    if (edge < minEdge) { removed.push(c.marketKey + '(edge=' + (edge*100).toFixed(1) + 'pp)'); continue; }
    if (tactical < minTactical) { removed.push(c.marketKey + '(tactical=' + tactical.toFixed(3) + ')'); continue; }
    if (score <= 0) { removed.push(c.marketKey + '(score=' + score.toFixed(3) + ')'); continue; }
    pruned.push(c);
  }
  if (removed.length > 0) {
    console.log('[pruneWeakCandidates] Removed ' + removed.length + '/' + (scoredCandidates||[]).length + ': ' + removed.join(', '));
  }
  return pruned;
}
