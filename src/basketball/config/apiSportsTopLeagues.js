const DEFAULT_TOP_LEAGUES = [
  // Keep API-Sports focused on the single non-US premium league we actually want.
  // NBA / WNBA / NCAAB already have dedicated flows elsewhere in the stack.
  { id: 120, key: 'apisports_120', name: 'Euroleague', country: 'Europe', priority: 100 },
];

function parseIds(value = '') {
  return String(value || '')
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function getApiSportsTopBasketballLeagues({ limit = 12 } = {}) {
  const envIds = parseIds(process.env.BASKETBALL_APISPORTS_LEAGUE_IDS);
  const selected = envIds.length
    ? envIds.map((id, index) => {
        const known = DEFAULT_TOP_LEAGUES.find((l) => l.id === id);
        return known || { id, key: `apisports_${id}`, name: `League ${id}`, country: null, priority: 50 - index };
      })
    : DEFAULT_TOP_LEAGUES;

  const safeLimit = Math.min(Math.max(Number(limit || process.env.BASKETBALL_APISPORTS_LEAGUE_LIMIT || 1), 1), 15);
  return selected
    .filter((league) => Number.isFinite(Number(league.id)) && Number(league.id) > 0)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, safeLimit);
}

export function isSelectedApiSportsLeague(leagueId) {
  const id = Number(leagueId);
  return Number.isFinite(id) && id > 0 && getApiSportsTopBasketballLeagues({ limit: 15 }).some((l) => l.id === id);
}
