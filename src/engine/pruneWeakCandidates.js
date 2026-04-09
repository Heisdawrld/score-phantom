import { safeNum } from '../utils/math.js';
export function pruneWeakCandidates(scoredCandidates, options = {}) {
  const mode = options.mode ?? 'balanced';
  const dataQuality = options.dataQuality ?? 0.5;
  const BASE = { safe: { prob: 0.60, edge: -0.08, tactical: 0.12 }, balanced: { prob: 0.55, edge: -0.12, tactical: 0.10 }, aggressive: { prob: 0.50, edge: -0.15, tactical: 0.08 } };
  const base = BASE[mode] ?? BASE.balanced;
  const qualityAdj = dataQuality >= 0.7 ? -0.02 : dataQuality < 0.4 ? 0.03 : 0;
  const minProb = base.prob + qualityAdj; const minEdge = base.edge; const minTactical = base.tactical;
  const kept = []; const rejected = [];
  for (const c of (scoredCandidates || [])) {
    const prob = safeNum(c.modelProbability, 0); const edge = c.edge != null ? safeNum(c.edge, 0) : null; const tactical = safeNum(c.tacticalFitScore, 0); const score = safeNum(c.finalScore, 0);
    if (prob < minProb) { rejected.push(c.marketKey + '(LOW_PROB:' + (prob*100).toFixed(1) + '%<' + (minProb*100).toFixed(0) + '%)'); continue; }
    if (edge !== null && edge < minEdge) { rejected.push(c.marketKey + '(LOW_EDGE:' + (edge*100).toFixed(1) + 'pp)'); continue; }
    if (tactical < minTactical) { rejected.push(c.marketKey + '(LOW_TACTICAL:' + tactical.toFixed(3) + ')'); continue; }
    if (score <= 0) { rejected.push(c.marketKey + '(NEG_SCORE:' + score.toFixed(3) + ')'); continue; } kept.push(c); }
  if (rejected.length > 0) console.log('[pruneWeakCandidates] Removed ' + rejected.length + '/' + (scoredCandidates||[]).length + ' [mode=' + mode + ' dq=' + (dataQuality*100).toFixed(0) + '%]: ' + rejected.join(', '));
  return kept; }
