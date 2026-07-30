import { safeNum } from '../utils/math.js';

/**
 * Convert valid decimal odds to their implied probability.
 */
export function oddsToImpliedProb(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 1) return null;
  return 1 / decimalOdds;
}

/**
 * Normalize a market's implied probabilities so the bookmaker margin is removed.
 */
export function removeVig(oddsMap) {
  if (!oddsMap || typeof oddsMap !== 'object') return null;
  const entries = Object.entries(oddsMap).filter(([, odds]) => odds && odds > 1);
  if (entries.length === 0) return null;

  const implied = {};
  let overround = 0;
  for (const [key, odds] of entries) {
    implied[key] = 1 / odds;
    overround += implied[key];
  }

  if (overround === 0) return null;

  const fair = {};
  for (const [key, probability] of Object.entries(implied)) {
    fair[key] = probability / overround;
  }
  return fair;
}

/**
 * Compute closing-line value using implied probability, where positive is good.
 */
export function computeClv(openingOdds, closingOdds) {
  const open = safeNum(openingOdds, null);
  const close = safeNum(closingOdds, null);
  if (open == null || close == null || open <= 1 || close <= 1) return null;

  const openingImplied = 1 / open;
  const closingImplied = 1 / close;
  const clv = closingImplied - openingImplied;
  const clvPct = openingImplied > 0 ? clv / openingImplied : 0;

  return {
    clv: parseFloat(clv.toFixed(4)),
    clvPct: parseFloat(clvPct.toFixed(4)),
    openingImplied: parseFloat(openingImplied.toFixed(4)),
    closingImplied: parseFloat(closingImplied.toFixed(4)),
  };
}

/**
 * Read the decimal odds for a normalized market key.
 */
export function getOddsForPick(odds, marketKey) {
  if (!odds || !marketKey) return null;
  const key = String(marketKey).toLowerCase();
  return odds[key] ?? null;
}
