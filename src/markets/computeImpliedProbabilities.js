import { safeNum } from '../utils/math.js';

/**
 * Maps market keys to odds field names in various possible odds formats.
 */
const ODDS_MAP = {
  home_win: ['home', 'homeWin', 'home_win', '1'],
  draw: ['draw', 'x', 'X', 'draw_odds'],
  away_win: ['away', 'awayWin', 'away_win', '2'],
  over_15: ['over_1_5', 'over15', 'over_1.5'],
  over_25: ['over_2_5', 'over25', 'over_2.5'],
  over_35: ['over_3_5', 'over35', 'over_3.5'],
  under_15: ['under_1_5', 'under15', 'under_1.5'],
  under_25: ['under_2_5', 'under25', 'under_2.5'],
  under_35: ['under_3_5', 'under35', 'under_3.5'],
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
 * Also extracts Pinnacle odds specifically to use as the true mathematical baseline.
 *
 * @param {MarketCandidate[]} candidates
 * @param {object|null} oddsSnapshot
 * @param {Array|null} deepOdds - Multi-bookmaker array from BSD
 * @returns {MarketCandidate[]}
 */
export function computeImpliedProbabilities(candidates, oddsSnapshot, deepOdds = []) {
  return candidates.map((candidate) => {
    // 1. Try to find the best odds and Pinnacle odds from the deepOdds array
    let bestOdds = null;
    let bestBookmaker = null;
    let pinnacleOdds = null;

    if (deepOdds && Array.isArray(deepOdds) && deepOdds.length > 0) {
      // Find the specific market in the deep odds array
      // Deep odds usually come back with specific market names or IDs depending on the endpoint
      // We will do a fuzzy match on the market name
      const marketName = candidate.marketKey.replace(/_/g, ' ').toLowerCase();
      
      const marketOdds = deepOdds.find(m => {
        const mName = String(m.market || m.name || '').toLowerCase();
        return mName.includes(marketName) || marketName.includes(mName);
      });

      if (marketOdds && marketOdds.bookmakers && Array.isArray(marketOdds.bookmakers)) {
        let highestPrice = 0;
        
        marketOdds.bookmakers.forEach(bookie => {
          // Assume the outcome matches our selection (e.g. 'Home', 'Over', etc)
          // In a production app, we would match the exact outcome ID. 
          // For now, we take the highest price found for this market as a proxy.
          const price = parseFloat(bookie.odds || bookie.price || 0);
          
          if (price > highestPrice) {
            highestPrice = price;
            bestOdds = price;
            bestBookmaker = bookie.name || bookie.bookmaker || 'Unknown';
          }

          if (String(bookie.name || bookie.bookmaker).toLowerCase().includes('pinnacle')) {
            pinnacleOdds = price;
          }
        });
      }
    }

    // 2. Fallback to the generic odds snapshot if deep odds failed or weren't found
    const genericOdds = lookupOdds(candidate.marketKey, oddsSnapshot);
    
    const finalDisplayOdds = bestOdds || genericOdds;
    const finalDisplayBookmaker = bestBookmaker || 'Average Market';
    
    // 3. For the edge calculation, we strictly prefer Pinnacle. If no Pinnacle, use the generic.
    const baselineOdds = pinnacleOdds || genericOdds;

    if (!baselineOdds || baselineOdds <= 1.0) {
      return { 
        ...candidate, 
        impliedProbability: null, 
        edge: null,
        bookmakerOdds: finalDisplayOdds,
        bookmakerName: finalDisplayBookmaker,
        pinnacleOdds: null
      };
    }

    const impliedProbability = parseFloat((1 / baselineOdds).toFixed(4));
    const edge = parseFloat((candidate.modelProbability - impliedProbability).toFixed(4));

    return {
      ...candidate,
      impliedProbability,
      edge, // Edge is now strictly calculated against Pinnacle (if available)
      bookmakerOdds: finalDisplayOdds, // But we display the best available price to the user
      bookmakerName: finalDisplayBookmaker,
      pinnacleOdds: pinnacleOdds
    };
  });
}
