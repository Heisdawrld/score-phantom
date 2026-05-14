import { safeNum } from '../utils/math.js';

/**
 * pruneWeakCandidates — removes candidates that don't meet minimum quality bars.
 * Called AFTER scoring (finalScore available) but BEFORE ranking.
 *
 * Prune conditions:
 *   - modelProbability < minProb (default 0.60) — below confidence floor
 *   - Per-market floor not met (data-driven from real win rate analysis)
 *   - edge < minEdge (default -0.08) — bookmaker strongly disagrees
 *   - tacticalFitScore < minTactical (default 0.12) — no tactical basis
 *   - finalScore <= 0 — scored as net-negative value
 *
 * Per-market floors (from real prediction_outcomes data — April 2026):
 *   - Over/Under:     0.60  → real win rate 68.1% ✅ (keep standard floor)
 *   - Match Result:   0.62  → real win rate 55.0% (marginal, needs decent conf)
 *   - BTTS Yes:       0.68  → real win rate 44.0% 🔴 (was losing at low prob)
 *   - Double Chance:  0.72  → real win rate 42.9% 🔴 (worst market, high bar)
 *   - DNB:            0.65  → protective floor
 */
const MARKET_MIN_PROB = {
  btts_yes:           0.68,
  btts_no:            0.72,
  double_chance_home: 0.72,
  double_chance_away: 0.72,
  draw:               0.65,
  home_win:           0.62,
  away_win:           0.62,
  dnb_home:           0.65,
  dnb_away:           0.65,
  over_25:            0.60,
  under_25:           0.60,
  over_15:            0.60,
  under_35:           0.68,   // tightened: prevents Under 3.5 becoming a comfort/default pick
  over_35:            0.65,
};

function isUnder35ComfortPick(candidate, options) {
  if (!candidate || candidate.marketKey !== 'under_35') return false;
  const prob = safeNum(candidate.modelProbability, 0);
  const tactical = safeNum(candidate.tacticalFitScore, 0);
  const score = safeNum(candidate.finalScore, 0);
  const script = String(options.scriptPrimary || options.primaryScript || '').toLowerCase();

  // Under 3.5 is naturally probable in football, so it needs extra confirmation.
  // Do not let it headline high-event/open/balanced scripts unless it is truly strong.
  const highEventScript = script === 'open_end_to_end' || script === 'balanced_high_event';
  if (highEventScript && prob < 0.74) return true;

  // If the tactical fit is only default-level and the score is not strong, it is likely just a safe-looking filler.
  if (tactical <= 0.42 && score < 0.56 && prob < 0.73) return true;

  return false;
}

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
    const marketFloor = MARKET_MIN_PROB[c.marketKey] ?? minProb;

    // "Too Good To Be True" Anomaly Filter (The Value Trap)
    // If the engine thinks a pick has a massive edge (>35%), it means the bookmaker strongly disagrees.
    // Usually, the bookmaker knows something the data doesn't (injuries, rotation, motivation).
    if (edge > 0.35) {
      removed.push(c.marketKey + '(value_trap=' + (edge*100).toFixed(1) + 'pp edge)');
      continue;
    }

    if (prob < marketFloor) { removed.push(c.marketKey + '(prob=' + (prob*100).toFixed(1) + '%<floor=' + (marketFloor*100).toFixed(0) + '%)'); continue; }
    if (isUnder35ComfortPick(c, options)) { removed.push(c.marketKey + '(comfort_pick_guard prob=' + (prob*100).toFixed(1) + '%, tactical=' + tactical.toFixed(2) + ', score=' + score.toFixed(2) + ')'); continue; }
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
