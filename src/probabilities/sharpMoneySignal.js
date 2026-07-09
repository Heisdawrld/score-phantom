/**
 * sharpMoneySignal.js — Detect sharp money from bookmaker odds movement.
 *
 * Sharp money = bets from professional/syndicate bettors. They bet large
 * amounts at sharp books (Pinnacle, Circa) and their action moves the lines.
 *
 * Signal sources (from BSD /events/{id}/odds/comparison/):
 *   1. PINNACLE SHORTENING on an outcome → STRONG sharp money signal
 *   2. Multiple books (≥3) shortening same outcome → MEDIUM signal
 *   3. Best odds DROPPING across all books → WEAK signal
 *
 * Usage:
 *   const signal = computeSharpMoneySignal(oddsComparison, bestPick);
 *   if (signal.alignment === 'confirms') confidence += 0.03;
 *   if (signal.alignment === 'contradicts') confidence -= 0.05;
 */

import { safeNum } from '../utils/math.js';

/**
 * Compute a sharp money signal for a specific pick.
 *
 * @param {Object} oddsComparison - output from fetchOddsComparison()
 * @param {Object} pick - the candidate pick { marketKey, selection }
 * @returns {{alignment: 'confirms'|'contradicts'|'neutral', strength: 'strong'|'medium'|'weak'|'none', signal: number, details: Object}}
 */
export function computeSharpMoneySignal(oddsComparison, pick) {
  if (!oddsComparison || !oddsComparison?.movementSummary || !pick) {
    return { alignment: 'neutral', strength: 'none', signal: 0, details: {} };
  }

  const ms = oddsComparison.movementSummary;

  // Map our marketKey + selection to BSD outcome codes used in /odds/comparison/
  // BSD uses: HOME, DRAW, AWAY for 1X2; over_15, over_25, etc. for totals; yes/no for BTTS
  const marketKey = String(pick.marketKey || '').toLowerCase();
  const selection = String(pick.selection || '').toLowerCase();

  let outcomeId = null;
  if (marketKey === 'home_win' || (marketKey === 'match_result' && selection === 'home')) outcomeId = 'match_result:HOME';
  else if (marketKey === 'away_win' || (marketKey === 'match_result' && selection === 'away')) outcomeId = 'match_result:AWAY';
  else if (marketKey === 'draw' || (marketKey === 'match_result' && selection === 'draw')) outcomeId = 'match_result:DRAW';
  else if (marketKey === 'over_15') outcomeId = 'over_under:over_15';
  else if (marketKey === 'over_25') outcomeId = 'over_under:over_25';
  else if (marketKey === 'over_35') outcomeId = 'over_under:over_35';
  else if (marketKey === 'under_15') outcomeId = 'over_under:under_15';
  else if (marketKey === 'under_25') outcomeId = 'over_under:under_25';
  else if (marketKey === 'under_35') outcomeId = 'over_under:under_35';
  else if (marketKey === 'btts_yes') outcomeId = 'btts:yes';
  else if (marketKey === 'btts_no') outcomeId = 'btts:no';

  if (!outcomeId) {
    return { alignment: 'neutral', strength: 'none', signal: 0, details: { reason: 'no_outcome_mapping' } };
  }

  const outcomeMovement = ms.perOutcome[outcomeId];
  if (!outcomeMovement) {
    return { alignment: 'neutral', strength: 'none', signal: 0, details: { reason: 'no_movement_data', outcomeId } };
  }

  // ── Determine alignment and strength ─────────────────────────────────────
  const { shortening, drifting, pinnacle, netSignal } = outcomeMovement;

  let alignment = 'neutral';
  let strength = 'none';
  let signal = 0;

  // Pinnacle is the sharpest book — its movement is the strongest signal
  if (pinnacle === 'SHORTENING') {
    alignment = 'confirms';
    strength = 'strong';
    signal = 0.04;
  } else if (pinnacle === 'DRIFTING') {
    alignment = 'contradicts';
    strength = 'strong';
    signal = -0.05;
  }
  // Multiple books shortening (≥3) without Pinnacle
  else if (shortening >= 3 && shortening > drifting + 1) {
    alignment = 'confirms';
    strength = 'medium';
    signal = 0.025;
  }
  // Multiple books drifting
  else if (drifting >= 3 && drifting > shortening + 1) {
    alignment = 'contradicts';
    strength = 'medium';
    signal = -0.03;
  }
  // Mild signal (2 shortening vs 0 drifting)
  else if (shortening === 2 && drifting === 0) {
    alignment = 'confirms';
    strength = 'weak';
    signal = 0.01;
  } else if (drifting === 2 && shortening === 0) {
    alignment = 'contradicts';
    strength = 'weak';
    signal = -0.015;
  }

  return {
    alignment,
    strength,
    signal,
    details: {
      outcomeId,
      shortening,
      drifting,
      pinnacle,
      netSignal,
      bestOdds: outcomeMovement.bestOdds,
      bestBookmaker: outcomeMovement.bestBookmaker,
    },
  };
}

/**
 * Aggregate sharp money signal across the top 3 ranked candidates.
 *
 * Useful for the confidence profile — if sharp money confirms the top picks,
 * overall confidence should increase.
 *
 * @param {Object} oddsComparison
 * @param {Array} rankedPicks - top N picks from the market ranking
 * @returns {{overallSignal: number, confirmations: number, contradictions: number, details: Array}}
 */
export function aggregateSharpMoneySignals(oddsComparison, rankedPicks) {
  if (!oddsComparison || !Array.isArray(rankedPicks) || rankedPicks.length === 0) {
    return { overallSignal: 0, confirmations: 0, contradictions: 0, details: [] };
  }

  const top3 = rankedPicks.slice(0, 3);
  let overallSignal = 0;
  let confirmations = 0;
  let contradictions = 0;
  const details = [];

  for (const pick of top3) {
    const sig = computeSharpMoneySignal(oddsComparison, pick);
    details.push({
      marketKey: pick.marketKey,
      selection: pick.selection,
      alignment: sig.alignment,
      strength: sig.strength,
      signal: sig.signal,
    });
    if (sig.alignment === 'confirms') confirmations++;
    else if (sig.alignment === 'contradicts') contradictions++;
    overallSignal += sig.signal;
  }

  // Cap the aggregate signal
  overallSignal = Math.max(-0.08, Math.min(0.05, overallSignal));

  return { overallSignal, confirmations, contradictions, details };
}
