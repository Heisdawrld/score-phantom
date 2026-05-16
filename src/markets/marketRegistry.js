export const MARKET_REGISTRY = {
  home_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  away_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  draw: { selectable: true, requiresOdds: true, headlineEligible: false },
  over_15: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_35: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  under_35: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_yes: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_no: { selectable: true, requiresOdds: true, headlineEligible: true },
  double_chance_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  double_chance_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  // ── European Handicap Markets ────────────────────────────────────────────
  // The punter's natural escalation when straight win odds are junk.
  // Home Win at 1.20 → Home -1 at 1.85 (same conviction, better price)
  handicap_home_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_away_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_home_plus1:  { selectable: true, requiresOdds: true, headlineEligible: false },
  handicap_away_plus1:  { selectable: true, requiresOdds: true, headlineEligible: false },
};

export function isHeadlineEligibleMarket(marketKey) {
  const key = String(marketKey || '').toLowerCase();
  return MARKET_REGISTRY[key]?.headlineEligible === true;
}
