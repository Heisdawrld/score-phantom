import { safeNum } from '../utils/math.js';
import { getDynamicMarketFloor, getOddsBandPerformance } from '../storage/accuracyCache.js';
import { checkOddsGate } from '../markets/valueTiers.js';

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
 *   - Odds gate: junk odds pruned (Over 1.5 at 1.14, Under 3.5 at 1.12, etc.)
 *   - Over 1.5 comfort pick guard: low-odds Over 1.5 pruned or penalized
 *
 * Per-market floors (from real prediction_outcomes data — April 2026):
 *   - Over/Under:     0.60  → real win rate 68.1% ✅ (keep standard floor)
 *   - Match Result:   0.62  → real win rate 55.0% (marginal, needs decent conf)
 *   - BTTS Yes:       0.68  → real win rate 44.0% 🔴 (was losing at low prob)
 *   - Double Chance:  0.72  → real win rate 42.9% 🔴 (worst market, high bar)
 *   - DNB:            0.65  → protective floor
 *
 * v3: Intelligent Analyst — adds odds gate (Phase 1A/1B), Over 1.5 comfort guard
 */
// ── v5: Lowered floors to allow smart-risk picks through ────────────────
// Key changes: Home/Away Win 0.62→0.56, Over 2.5 0.60→0.55, BTTS Yes 0.68→0.64
// These were too high, causing +EV picks to get pruned simply because they
// were below a one-size-fits-all probability floor.
// The Smart Risk Exception (below) adds further intelligence.
const MARKET_MIN_PROB = {
  btts_yes:           0.64,
  btts_no:            0.68,
  double_chance_home: 0.68,
  double_chance_away: 0.68,
  draw:               0.60,
  home_win:           0.56,
  away_win:           0.56,
  dnb_home:           0.60,
  dnb_away:           0.60,
  over_25:            0.55,
  under_25:           0.55,
  over_15:            0.60,
  under_35:           0.72,   // still protective — Under 3.5 must be well above base rate
  over_35:            0.60,
};

function isUnder35ComfortPick(candidate, options) {
  if (!candidate || candidate.marketKey !== 'under_35') return false;
  const prob = safeNum(candidate.modelProbability, 0);
  const tactical = safeNum(candidate.tacticalFitScore, 0);
  const score = safeNum(candidate.finalScore, 0);
  const script = String(options.scriptPrimary || options.primaryScript || '').toLowerCase();
  const leagueOver35Rate = safeNum(options.leagueOver35Rate, 0.30);
  const h2hOver35Rate = safeNum(options.h2hOver35Rate, null);

  // ── v5: Strong tactical override ─────────────────────────────────────
  // If tight_low_event script AND tactical > 0.85 AND +EV, allow Under 3.5
  // even at slightly lower probability — the match script strongly supports it.
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const ev = odds > 1.0 ? (prob * odds) - 1 : 0;
  if (tactical > 0.85 && ev >= 0.03 && prob >= 0.70) return false; // Exception granted

  const highEventScript = script === 'open_end_to_end' || script === 'balanced_high_event';
  if (highEventScript && prob < 0.80) return true;
  if (tactical <= 0.45 && score < 0.58 && prob < 0.78) return true;
  if (tactical > 0.45 && tactical < 0.65 && prob < 0.75) return true;
  if (leagueOver35Rate > 0.30 && prob < 0.76) return true;
  if (leagueOver35Rate > 0.35 && prob < 0.80) return true;
  if (leagueOver35Rate > 0.40 && prob < 0.85) return true;
  if (h2hOver35Rate != null && h2hOver35Rate > 0.30 && prob < 0.76) return true;
  if (h2hOver35Rate != null && h2hOver35Rate > 0.35 && prob < 0.80) return true;
  if (h2hOver35Rate != null && h2hOver35Rate > 0.40 && prob < 0.85) return true;
  if (prob < 0.74) return true;

  return false;
}

/**
 * Phase 1B: Over 1.5 Comfort Pick Guard
 *
 * Over 1.5 is naturally 75%+ probable in football. At low odds (below 1.25),
 * it's pure junk — no return for the risk. At moderate odds (1.25-1.40),
 * it's only worth it as an accumulator filler, never as a standalone.
 *
 * This mirrors the Under 3.5 comfort pick guard but for the other direction.
 */
function isOver15ComfortPick(candidate, options) {
  if (!candidate || candidate.marketKey !== 'over_15') return false;
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const score = safeNum(candidate.finalScore, 0);
  const script = String(options.scriptPrimary || options.primaryScript || '').toLowerCase();
  const tactical = safeNum(candidate.tacticalFitScore, 0);

  // ── v5: Strong tactical override ─────────────────────────────────────
  // If open/high-event script AND tactical > 0.85 AND +EV, allow Over 1.5
  // at moderate odds — the match script strongly supports it.
  const ev = odds > 1.0 ? (prob * odds) - 1 : 0;
  if (tactical > 0.85 && ev >= 0.03 && odds >= 1.35) return false; // Exception granted

  // Hard prune: odds below 1.25 — no value at all
  if (odds > 1.0 && odds < 1.25) return true;

  // Soft prune: odds 1.25-1.40 with low score — only worth as ACCA filler
  if (odds >= 1.25 && odds < 1.40 && score < 0.35) return true;

  // Low-event scripts should not recommend Over 1.5 as headline
  const lowEventScript = script === 'tight_low_event';
  if (lowEventScript && odds < 1.40 && prob < 0.78) return true;

  return false;
}

export function pruneWeakCandidates(scoredCandidates, options = {}) {
  const minProb     = options.minProb     ?? 0.60;
  const minEdge     = options.minEdge     ?? -0.08;
  const minTactical = options.minTactical ?? 0.12;
  const accuracyCache = options.accuracyCache || null;
  const featureVector = options.featureVector || {};
  const narrative = options.narrative || null;
  const pruned  = [];
  const removed = [];

  for (const c of (scoredCandidates || [])) {
    const prob     = safeNum(c.modelProbability, 0);
    const edge     = safeNum(c.edge, 0);
    const tactical = safeNum(c.tacticalFitScore, 0);
    const score    = safeNum(c.finalScore, 0);
    const odds     = safeNum(c.bookmakerOdds, 0);
    const ev       = odds > 1.0 ? (prob * odds) - 1 : 0;
    const oddsBandPerformance = accuracyCache ? getOddsBandPerformance(c.marketKey, odds, accuracyCache) : null;
    const marketFloor = (function() {
      if (accuracyCache) {
        const dynamic = getDynamicMarketFloor(c.marketKey, accuracyCache);
        if (dynamic != null) return dynamic.floor;
      }
      return MARKET_MIN_PROB[c.marketKey] ?? minProb;
    })();

    // ── Phase 1A: Odds Gate — prune junk odds ──────────────────────────────
    // This is the most important new filter: no more recommending Over 1.5 at 1.14
    const oddsGate = checkOddsGate(c);
    if (oddsGate.shouldPrune) {
      removed.push(c.marketKey + '(' + oddsGate.reason + ')');
      continue;
    }

    // "Too Good To Be True" Anomaly Filter (The Value Trap)
    if (edge > 0.35) {
      removed.push(c.marketKey + '(value_trap=' + (edge*100).toFixed(1) + 'pp edge)');
      continue;
    }

    // ── v5: Smart Risk Exception ────────────────────────────────────────
    // Don't prune a market below floor if it has genuine value.
    // ALL five conditions must be true — this is NOT a general loosening.
    if (prob < marketFloor) {
      const dataCompleteness = safeNum(featureVector?.dataCompletenessScore, 0.5);
      const isComfortMarket = [
        'under_35', 'over_15', 'double_chance_home', 'double_chance_away',
        'home_over_05', 'away_over_05',
        'home_over_15', 'home_over_25', 'away_over_15', 'away_over_25',
        'home_under_15', 'away_under_15',
      ].includes(c.marketKey);
      const smartRiskException =
        ev >= 0.02 &&                    // Genuine positive EV
        tactical >= 0.65 &&              // Strong tactical alignment
        !isComfortMarket &&              // Not a lazy/safe market
        prob >= marketFloor - 0.08 &&    // Not too far below floor
        dataCompleteness >= 0.40;        // Adequate data to trust the model

      if (!smartRiskException) {
        removed.push(c.marketKey + '(prob=' + (prob*100).toFixed(1) + '%<floor=' + (marketFloor*100).toFixed(0) + '%)');
        continue;
      }
      // Exception granted — mark for transparency
      c.smartRiskException = true;
      c.smartRiskExceptionReason = 'Below floor (' + (prob*100).toFixed(1) + '% < ' + (marketFloor*100).toFixed(0) + '%) but +EV=' + (ev*100).toFixed(1) + '% tactical=' + tactical.toFixed(2);
    }
    if (isUnder35ComfortPick(c, {
      ...options,
      leagueOver35Rate: featureVector.leagueOver35Rate,
      h2hOver35Rate: featureVector.h2hOver35Rate,
    })) { removed.push(c.marketKey + '(comfort_pick_guard prob=' + (prob*100).toFixed(1) + '%, tactical=' + tactical.toFixed(2) + ', score=' + score.toFixed(2) + ', leagueO35=' + ((featureVector.leagueOver35Rate||0.30)*100).toFixed(0) + '%)'); continue; }

    // ── Phase 1B: Over 1.5 comfort pick guard ──────────────────────────────
    if (isOver15ComfortPick(c, options)) {
      removed.push(c.marketKey + '(over15_comfort_guard odds=' + safeNum(c.bookmakerOdds,0).toFixed(2) + ', prob=' + (prob*100).toFixed(1) + '%, score=' + score.toFixed(2) + ')');
      continue;
    }

    // ── Phase 1C: Historical odds-band trap ──────────────────────────────
    // If this exact market/odds bucket has been unprofitable over a meaningful
    // sample, suppress it unless the current setup is exceptionally strong.
    if (
      oddsBandPerformance &&
      oddsBandPerformance.samples >= 10 &&
      Number.isFinite(oddsBandPerformance.weightedYield) &&
      oddsBandPerformance.weightedYield <= -0.08
    ) {
      const eliteOverride = ev >= 0.05 && tactical >= 0.75 && prob >= Math.max(marketFloor, 0.68);
      if (!eliteOverride) {
        removed.push(c.marketKey + '(odds_band_trap=' + oddsBandPerformance.oddsBand + ', yield=' + (oddsBandPerformance.weightedYield * 100).toFixed(1) + '%, n=' + oddsBandPerformance.samples + ')');
        continue;
      }
      c.oddsBandOverride = {
        oddsBand: oddsBandPerformance.oddsBand,
        weightedYield: oddsBandPerformance.weightedYield,
        samples: oddsBandPerformance.samples,
        reason: 'Elite current setup overrode negative historical odds-band performance',
      };
    }

    if (edge < minEdge) { removed.push(c.marketKey + '(edge=' + (edge*100).toFixed(1) + 'pp)'); continue; }
    if (tactical < minTactical) { removed.push(c.marketKey + '(tactical=' + tactical.toFixed(3) + ')'); continue; }
    if (score <= 0) { removed.push(c.marketKey + '(score=' + score.toFixed(3) + ')'); continue; }

    // ── Phase 2B: Narrative-blocked markets ─────────────────────────────────
    // If the narrative explicitly blocks a market type, prune it
    if (narrative && narrative.blockedMarkets && narrative.blockedMarkets.includes(c.marketKey)) {
      // Only block if the narrative confidence is moderate or high
      if (narrative.narrativeConfidence !== 'low') {
        removed.push(c.marketKey + '(narrative_blocked: ' + (narrative.narrativeReasons || ['unknown'])[0] + ')');
        continue;
      }
    }

    pruned.push(c);
  }

  if (removed.length > 0) {
    console.log('[pruneWeakCandidates] Removed ' + removed.length + '/' + (scoredCandidates||[]).length + ': ' + removed.join(', '));
  }
  return pruned;
}
