import { safeNum } from '../utils/math.js';

export function computeMarketFeatures(odds) {
  if (!odds) return null;
  return {
    homeWinOdds: safeNum(odds.home, null) || null,
    drawOdds: safeNum(odds.draw, null) || null,
    awayWinOdds: safeNum(odds.away, null) || null,
    over25Odds: safeNum(odds.over_2_5, null) || null,
    under25Odds: safeNum(odds.under_2_5, null) || null,
    over15Odds: safeNum(odds.over_1_5, null) || null,
    under15Odds: safeNum(odds.under_1_5, null) || null,
    over35Odds: safeNum(odds.over_3_5, null) || null,
    bttsYesOdds: safeNum(odds.btts_yes, null) || null,
    bttsNoOdds: safeNum(odds.btts_no, null) || null,
  };
}
