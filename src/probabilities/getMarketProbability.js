const DIRECT_PROBABILITY_KEYS = Object.freeze({
  home_win: 'homeWin',
  draw: 'draw',
  away_win: 'awayWin',
  over_15: 'over15',
  over_25: 'over25',
  over_35: 'over35',
  under_15: 'under15',
  under_25: 'under25',
  under_35: 'under35',
  btts_yes: 'bttsYes',
  btts_no: 'bttsNo',
  home_over_05: 'homeOver05',
  home_over_15: 'homeOver15',
  home_over_25: 'homeOver25',
  home_under_15: 'homeUnder15',
  away_over_05: 'awayOver05',
  away_over_15: 'awayOver15',
  away_over_25: 'awayOver25',
  away_under_15: 'awayUnder15',
});

function finiteProbability(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

/**
 * Resolve a persisted market key to its probability in the engine's camelCase
 * probability object. Derived markets intentionally mirror buildMarketCandidates.
 */
export function getMarketProbability(probabilities, marketKey, fallback = null) {
  if (!probabilities || !marketKey) return fallback;

  const directKey = DIRECT_PROBABILITY_KEYS[marketKey];
  if (directKey) {
    return finiteProbability(probabilities[directKey]) ?? fallback;
  }

  const home = finiteProbability(probabilities.homeWin);
  const draw = finiteProbability(probabilities.draw);
  const away = finiteProbability(probabilities.awayWin);

  if (marketKey === 'double_chance_home' && home != null && draw != null) {
    return Math.min(1, home + draw);
  }
  if (marketKey === 'double_chance_away' && away != null && draw != null) {
    return Math.min(1, away + draw);
  }
  if (marketKey === 'double_chance_draw' && home != null && away != null) {
    return Math.min(1, home + away);
  }
  if (marketKey === 'dnb_home' && home != null && away != null && home + away > 0.01) {
    return home / (home + away);
  }
  if (marketKey === 'dnb_away' && home != null && away != null && home + away > 0.01) {
    return away / (home + away);
  }
  if (marketKey === 'win_either_half_home') {
    const homeOver05 = finiteProbability(probabilities.homeOver05);
    return homeOver05 == null ? fallback : homeOver05 * 0.75;
  }
  if (marketKey === 'win_either_half_away') {
    const awayOver05 = finiteProbability(probabilities.awayOver05);
    return awayOver05 == null ? fallback : awayOver05 * 0.70;
  }

  return finiteProbability(probabilities[marketKey]) ?? fallback;
}

export default getMarketProbability;
