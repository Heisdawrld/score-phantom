function safeParseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Resolve only the captured price for the exact ACCA leg.
 * Never borrow a related 1X2 price or infer odds from model probability.
 */
export function resolvePickOdds(row) {
  const captured = parseFloat(row.captured_pick_odds || row.bookmaker_odds || 0);
  if (Number.isFinite(captured) && captured > 1) return captured;

  const market = String(row.best_pick_market || '').toLowerCase();
  const selection = String(row.best_pick_selection || '').toLowerCase();

  if (market === 'home_win') return parseFloat(row.odds_home || row.home || 0) || null;
  if (market === 'away_win') return parseFloat(row.odds_away || row.away || 0) || null;
  if (market === 'draw') return parseFloat(row.odds_draw || row.draw || 0) || null;
  if (market === 'double_chance_home') {
    return parseFloat(row.odds_dc_home_draw || row.dc_home_draw || 0) || null;
  }
  if (market === 'double_chance_away') {
    return parseFloat(row.odds_dc_away_draw || row.dc_away_draw || 0) || null;
  }
  if (market === 'btts_yes') return parseFloat(row.odds_btts_yes || row.btts_yes || 0) || null;
  if (market === 'btts_no') return parseFloat(row.odds_btts_no || row.btts_no || 0) || null;

  const overUnder = safeParseJson(row.over_under);
  if (market === 'over_15') {
    return parseFloat(overUnder.over_1_5 || overUnder.over15 || row.odds_over_15 || 0) || null;
  }
  if (market === 'over_25' || (market === 'over_under' && selection.includes('over'))) {
    return parseFloat(overUnder.over_2_5 || overUnder.over25 || row.odds_over_25 || 0) || null;
  }
  if (market === 'under_25' || (market === 'over_under' && selection.includes('under'))) {
    return parseFloat(overUnder.under_2_5 || overUnder.under25 || row.odds_under_25 || 0) || null;
  }
  if (market === 'under_35') {
    return parseFloat(overUnder.under_3_5 || overUnder.under35 || row.odds_under_35 || 0) || null;
  }

  return null;
}
