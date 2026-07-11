import { safeNum } from '../utils/math.js';

const MARKET_DEFINITIONS = [
  { marketKey: 'home_win',           selection: 'Home Win',             probKey: 'homeWin' },
  { marketKey: 'away_win',           selection: 'Away Win',             probKey: 'awayWin' },
  { marketKey: 'draw',               selection: 'Draw',                 probKey: 'draw' },
  { marketKey: 'double_chance_home', selection: 'Double Chance 1X',     probKey: null,    compute: (p) => safeNum(p.homeWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'double_chance_away', selection: 'Double Chance X2',     probKey: null,    compute: (p) => safeNum(p.awayWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'double_chance_draw', selection: 'Double Chance 12',     probKey: null,    compute: (p) => safeNum(p.homeWin, 0) + safeNum(p.awayWin, 0) },
  { marketKey: 'dnb_home',           selection: 'Home Win (DNB)',        probKey: null,    compute: (p) => { const h = safeNum(p.homeWin, 0); const a = safeNum(p.awayWin, 0); const denom = h + a; return denom > 0.01 ? h / denom : 0; } },
  { marketKey: 'dnb_away',           selection: 'Away Win (DNB)',        probKey: null,    compute: (p) => { const h = safeNum(p.homeWin, 0); const a = safeNum(p.awayWin, 0); const denom = h + a; return denom > 0.01 ? a / denom : 0; } },
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
  // ── Corners markets (Tier 3) — BSD serves odds, model computes probability ──
  { marketKey: 'corners_1x2_home',   selection: 'Corners 1X2 Home',     probKey: 'corners_1x2_home' },
  { marketKey: 'corners_1x2_away',   selection: 'Corners 1X2 Away',     probKey: 'corners_1x2_away' },
  { marketKey: 'corners_1x2_draw',   selection: 'Corners 1X2 Draw',     probKey: 'corners_1x2_draw' },
  { marketKey: 'total_corners_over', selection: 'Total Corners Over',   probKey: 'total_corners_over' },
  { marketKey: 'total_corners_under',selection: 'Total Corners Under',  probKey: 'total_corners_under' },
  // ── Red card markets (Tier 3) ──────────────────────────────────────────────
  { marketKey: 'red_card_yes',       selection: 'Red Card Yes',         probKey: 'red_card_yes' },
  { marketKey: 'red_card_no',        selection: 'Red Card No',          probKey: 'red_card_no' },
  { marketKey: 'total_red_cards_over', selection: 'Total Red Cards Over',  probKey: 'total_red_cards_over' },
  { marketKey: 'total_red_cards_under',selection: 'Total Red Cards Under', probKey: 'total_red_cards_under' },
  // ── Asian Handicap markets (Tier 3) — model-only (BSD doesn't serve AH odds) ──
  // These produce model probabilities from the Poisson score matrix but have no
  // bookmaker odds → edge can't be computed → they'll be model-only candidates.
  // Adding them so the engine at least evaluates AH lines for informational purposes.
  { marketKey: 'ah_home_neg1_5',     selection: 'Asian Handicap Home -1.5', probKey: 'ah_home_neg1_5' },
  { marketKey: 'ah_away_1_5',        selection: 'Asian Handicap Away +1.5',  probKey: 'ah_away_1_5' },
  { marketKey: 'ah_home_neg1',       selection: 'Asian Handicap Home -1',   probKey: 'ah_home_neg1' },
  { marketKey: 'ah_away_1',          selection: 'Asian Handicap Away +1',    probKey: 'ah_away_1' },
  { marketKey: 'ah_home_neg0_5',     selection: 'Asian Handicap Home -0.5', probKey: 'ah_home_neg0_5' },
  { marketKey: 'ah_away_0_5',        selection: 'Asian Handicap Away +0.5',  probKey: 'ah_away_0_5' },
  { marketKey: 'ah_home_0_5',        selection: 'Asian Handicap Home +0.5',  probKey: 'ah_home_0_5' },
  { marketKey: 'ah_away_neg0_5',     selection: 'Asian Handicap Away -0.5', probKey: 'ah_away_neg0_5' },
  { marketKey: 'ah_home_1',          selection: 'Asian Handicap Home +1',    probKey: 'ah_home_1' },
  { marketKey: 'ah_away_neg1',       selection: 'Asian Handicap Away -1',   probKey: 'ah_away_neg1' },
  { marketKey: 'ah_home_1_5',        selection: 'Asian Handicap Home +1.5',  probKey: 'ah_home_1_5' },
  { marketKey: 'ah_away_neg1_5',     selection: 'Asian Handicap Away -1.5', probKey: 'ah_away_neg1_5' },
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
      modelProbability: parseFloat(Math.max(0, Math.min(1, modelProbability)).toFixed(4)),
      impliedProbability: null,
      edge: null,
      finalScore: 0,
    });
  }

  return candidates;
}
