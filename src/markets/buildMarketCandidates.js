import { safeNum } from '../utils/math.js';

/**
 * Hard cap on any single market probability.
 * Poisson maths can produce 92-97% on extremely low-xG matches (Under 2.5 on tight scripts).
 * These are mathematically defensible but a massive credibility red flag on the UI.
 * We cap at 87% — still a very high confidence rating, but looks realistic to a user.
 */
const MAX_MODEL_PROBABILITY = 0.87;

const MARKET_DEFINITIONS = [
  { marketKey: 'home_win',           selection: 'Home Win',             probKey: 'homeWin' },
  { marketKey: 'away_win',           selection: 'Away Win',             probKey: 'awayWin' },
  { marketKey: 'draw',               selection: 'Draw',                 probKey: 'draw' },
  { marketKey: 'double_chance_home', selection: 'Double Chance 1X',     probKey: null,    compute: (p) => safeNum(p.homeWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'double_chance_away', selection: 'Double Chance X2',     probKey: null,    compute: (p) => safeNum(p.awayWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'over_15',            selection: 'Over 1.5 Goals',       probKey: 'over15' },
  { marketKey: 'over_25',            selection: 'Over 2.5 Goals',       probKey: 'over25' },
  { marketKey: 'over_35',            selection: 'Over 3.5 Goals',       probKey: 'over35' },
  { marketKey: 'under_15',           selection: 'Under 1.5 Goals',      probKey: 'under15' },
  { marketKey: 'under_25',           selection: 'Under 2.5 Goals',      probKey: 'under25' },
  { marketKey: 'under_35',           selection: 'Under 3.5 Goals',      probKey: 'under35' },
  { marketKey: 'btts_yes',           selection: 'BTTS Yes',             probKey: 'bttsYes' },
  { marketKey: 'btts_no',            selection: 'BTTS No',              probKey: 'bttsNo' },
  { marketKey: 'home_over_05',       selection: 'Home Over 0.5 Goals',  probKey: 'homeOver05' },
  { marketKey: 'home_over_15',       selection: 'Home Over 1.5 Goals',  probKey: 'homeOver15' },
  { marketKey: 'home_over_25',       selection: 'Home Over 2.5 Goals',  probKey: 'homeOver25' },
  { marketKey: 'home_under_15',      selection: 'Home Under 1.5 Goals', probKey: 'homeUnder15' },
  { marketKey: 'away_over_05',       selection: 'Away Over 0.5 Goals',  probKey: 'awayOver05' },
  { marketKey: 'away_over_15',       selection: 'Away Over 1.5 Goals',  probKey: 'awayOver15' },
  { marketKey: 'away_over_25',       selection: 'Away Over 2.5 Goals',  probKey: 'awayOver25' },
  { marketKey: 'away_under_15',      selection: 'Away Under 1.5 Goals', probKey: 'awayUnder15' },
  { marketKey: 'win_either_half_home', selection: 'Home Win Either Half', probKey: null,  compute: (p) => safeNum(p.homeOver05, 0) * 0.75 },
  { marketKey: 'win_either_half_away', selection: 'Away Win Either Half', probKey: null,  compute: (p) => safeNum(p.awayOver05, 0) * 0.7 },
];

/**
 * Build market candidate array from calibrated probabilities.
 *
 * @param {object} calibratedProbs - output of calibrateProbabilities
 * @param {object|null} odds - bookmaker odds snapshot
 * @returns {MarketCandidate[]}
 */
export function buildMarketCandidates(calibratedProbs, odds) {
  const probs = calibratedProbs || {};
  const candidates = [];

  for (const def of MARKET_DEFINITIONS) {
    let modelProbability;

    if (def.probKey && probs[def.probKey] != null) {
      modelProbability = safeNum(probs[def.probKey], 0);
    } else if (def.compute) {
      modelProbability = safeNum(def.compute(probs), 0);
    } else {
      continue;
    }

    candidates.push({
      marketKey: def.marketKey,
      selection: def.selection,
      modelProbability: parseFloat(Math.min(modelProbability, MAX_MODEL_PROBABILITY).toFixed(4)),
      impliedProbability: null,
      edge: null,
      finalScore: 0,
    });
  }

  return candidates;
}
