const MAX_STANDINGS_ROWS = 64;
const MAX_FORM_ROWS = 10;
const MAX_H2H_ROWS = 5;
const MAX_EVENT_ROWS = 300;
const MAX_PLAYER_STAT_GROUPS = 100;

function cappedArray(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

/**
 * A league table larger than 64 rows is not useful football context. In
 * practice this is the BSD "Club Friendlies" aggregate (2,000+ unrelated
 * teams), which previously added ~430 KB to every affected fixture.
 */
export function compactStandings(rows, maxRows = MAX_STANDINGS_ROWS) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.length <= maxRows ? rows.slice(0, maxRows) : [];
}

/** Build the bounded JSON document persisted in fixtures.meta. */
export function buildStoredFixtureMeta(data, refreshedAt = new Date().toISOString()) {
  const standings = compactStandings(data?.standings);
  const h2h = cappedArray(data?.h2h, MAX_H2H_ROWS);
  const homeForm = cappedArray(data?.homeForm, MAX_FORM_ROWS);
  const awayForm = cappedArray(data?.awayForm, MAX_FORM_ROWS);
  const injuries = data?.injuries ?? null;
  const lineups = data?.lineups ?? null;

  return {
    enrichedAt: refreshedAt,
    bsdRefreshedAt: refreshedAt,
    dataFreshness: {
      provider: 'BSD',
      refreshedAt,
      h2hCount: h2h.length,
      homeFormCount: homeForm.length,
      awayFormCount: awayForm.length,
      standingsCount: standings.length,
      hasHomeStats: !!data?.homeStats,
      hasAwayStats: !!data?.awayStats,
      hasMatchStats: !!data?.matchStats,
    },
    standings,
    homeStats: data?.homeStats ?? null,
    awayStats: data?.awayStats ?? null,
    homeProfile: data?.homeProfile ?? null,
    awayProfile: data?.awayProfile ?? null,
    lineupModifier: data?.lineupModifier ?? null,
    completeness: data?.completeness ?? null,
    homeMomentum: data?.homeMomentum ?? null,
    awayMomentum: data?.awayMomentum ?? null,
    h2h,
    homeForm,
    awayForm,
    matchStats: data?.matchStats ?? null,
    matchEvents: cappedArray(data?.matchEvents, MAX_EVENT_ROWS),
    actualHomeXg: data?.actualHomeXg ?? null,
    actualAwayXg: data?.actualAwayXg ?? null,
    shotmap: cappedArray(data?.shotmap, MAX_EVENT_ROWS),
    lineups,
    injuries,
    average_positions: data?.average_positions ?? null,
    momentum: cappedArray(data?.momentum, MAX_EVENT_ROWS),
    xg_per_minute: cappedArray(data?.xg_per_minute, MAX_EVENT_ROWS),
    bsd_home_form_stats: data?.bsdHomeFormStats ?? null,
    bsd_away_form_stats: data?.bsdAwayFormStats ?? null,
    odds_data: data?.oddsData ?? null,
    odds_comparison: data?.oddsComparison ?? null,
    polymarket_odds: data?.polymarketOdds ?? null,
    home_manager: data?.homeManager ?? null,
    away_manager: data?.awayManager ?? null,
    bsd_prediction: data?.bsdPrediction ?? null,
    refereeData: data?.refereeData ?? null,
    refereeVolatility: data?.refereeVolatility ?? null,
    metadata: data?.metadata ?? null,
    metadataInsights: data?.metadataInsights ?? null,
    eventContext: data?.eventContext ?? null,
    venue: data?.venue ?? null,
    playerStats: cappedArray(data?.playerStats, MAX_PLAYER_STAT_GROUPS),
    deepPlayerIntel: data?.deepPlayerIntel ?? null,
  };
}

export const FIXTURE_META_LIMITS = Object.freeze({
  standings: MAX_STANDINGS_ROWS,
  form: MAX_FORM_ROWS,
  h2h: MAX_H2H_ROWS,
  events: MAX_EVENT_ROWS,
  playerStatGroups: MAX_PLAYER_STAT_GROUPS,
});
