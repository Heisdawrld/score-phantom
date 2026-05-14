import { safeNum } from '../utils/math.js';

/**
 * Maps market keys to odds field names in various possible odds formats.
 */
const ODDS_MAP = {
  home_win: ['home', 'homeWin', 'home_win', '1'],
  draw: ['draw', 'x', 'X', 'draw_odds'],
  away_win: ['away', 'awayWin', 'away_win', '2'],
  over_15: ['over_15', 'over_1_5', 'over15', 'over_1.5'],
  over_25: ['over_25', 'over_2_5', 'over25', 'over_2.5'],
  over_35: ['over_35', 'over_3_5', 'over35', 'over_3.5'],
  under_15: ['under_15', 'under_1_5', 'under15', 'under_1.5'],
  under_25: ['under_25', 'under_2_5', 'under25', 'under_2.5'],
  under_35: ['under_35', 'under_3_5', 'under35', 'under_3.5'],
  btts_yes: ['btts_yes', 'bttsYes', 'both_teams_score_yes'],
  btts_no: ['btts_no', 'bttsNo', 'both_teams_score_no'],
};

/**
 * Look up odds for a given market key from the odds snapshot.
 */
function lookupOdds(marketKey, oddsSnapshot) {
  if (!oddsSnapshot) return null;

  const keys = ODDS_MAP[marketKey] || [marketKey];
  for (const k of keys) {
    if (oddsSnapshot[k] != null) {
      const val = safeNum(oddsSnapshot[k], 0);
      if (val > 1.0) return val;
    }
  }

  // Check over_under nested object
  if (oddsSnapshot.over_under && typeof oddsSnapshot.over_under === 'object') {
    const ouKeys = ODDS_MAP[marketKey] || [];
    for (const k of ouKeys) {
      if (oddsSnapshot.over_under[k] != null) {
        const val = safeNum(oddsSnapshot.over_under[k], 0);
        if (val > 1.0) return val;
      }
    }
  }

  return null;
}

/**
 * Add impliedProbability and edge to each candidate based on odds.
 *
 * @param {MarketCandidate[]} candidates
 * @param {object|null} oddsSnapshot
 * @param {object|null} [features]
 * @returns {MarketCandidate[]}
 */
export function computeImpliedProbabilities(candidates, oddsSnapshot, features) {
  return candidates.map((candidate) => {
    const decimalOdds = lookupOdds(candidate.marketKey, oddsSnapshot);

    if (decimalOdds && decimalOdds > 1.0) {
      const impliedProbability = parseFloat((1 / decimalOdds).toFixed(4));
      const edge = parseFloat((candidate.modelProbability - impliedProbability).toFixed(4));

      return {
        ...candidate,
        impliedProbability,
        edge,
        bookmakerOdds: decimalOdds,
      };
    }

    // Look for advanced odds if basic odds are missing
    const adv = features?.advancedOdds || null;
    const advOdds = lookupOdds(candidate.marketKey, adv);

    if (advOdds && advOdds > 1.0) {
      const impliedProbability = parseFloat((1 / advOdds).toFixed(4));
      const edge = parseFloat((candidate.modelProbability - impliedProbability).toFixed(4));

      return {
        ...candidate,
        impliedProbability,
        edge,
        bookmakerOdds: advOdds,
      };
    }

    return { ...candidate, impliedProbability: null, edge: null };
  });
}
