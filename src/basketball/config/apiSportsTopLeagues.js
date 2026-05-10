const DEFAULT_TOP_LEAGUES = [
  { id: 12, key: 'apisports_12', name: 'NBA', country: 'USA', priority: 100 },
  { id: 120, key: 'apisports_120', name: 'Euroleague', country: 'Europe', priority: 95 },
  { id: 31, key: 'apisports_31', name: 'CBA', country: 'China', priority: 88 },
  { id: 91, key: 'apisports_91', name: 'KBL', country: 'South Korea', priority: 86 },
  { id: 104, key: 'apisports_104', name: 'Super Ligi', country: 'Turkey', priority: 84 },
  { id: 2, key: 'apisports_2', name: 'LNB', country: 'France', priority: 82 },
  { id: 45, key: 'apisports_45', name: 'Basket League', country: 'Greece', priority: 80 },
  { id: 60, key: 'apisports_60', name: 'LKL', country: 'Lithuania', priority: 78 },
  { id: 51, key: 'apisports_51', name: 'Super League', country: 'Israel', priority: 76 },
  { id: 72, key: 'apisports_72', name: 'Energa Basket Liga', country: 'Poland', priority: 74 },
  { id: 198, key: 'apisports_198', name: 'ABA League', country: 'Europe', priority: 72 },
  { id: 26, key: 'apisports_26', name: 'NBB', country: 'Brazil', priority: 70 },
  { id: 424, key: 'apisports_424', name: 'Asia Champions League', country: 'Asia', priority: 68 },
  { id: 426, key: 'apisports_426', name: 'MPBL', country: 'Philippines', priority: 66 },
  { id: 275, key: 'apisports_275', name: 'Superliga', country: 'Venezuela', priority: 64 },
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

  const safeLimit = Math.min(Math.max(Number(limit || process.env.BASKETBALL_APISPORTS_LEAGUE_LIMIT || 12), 1), 15);
  return selected
    .filter((league) => Number.isFinite(Number(league.id)) && Number(league.id) > 0)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, safeLimit);
}

export function isSelectedApiSportsLeague(leagueId) {
  const id = Number(leagueId);
  return Number.isFinite(id) && id > 0 && getApiSportsTopBasketballLeagues({ limit: 15 }).some((l) => l.id === id);
}
