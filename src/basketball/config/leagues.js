export const BASKETBALL_LEAGUES = {
  nba: {
    key: 'nba',
    label: 'NBA',
    sportName: 'Basketball',
    oddsSportKey: 'basketball_nba',
    ballDontLieBaseUrl: 'https://api.balldontlie.io/v1',
    dataSource: 'balldontlie_nba',
    enabled: true,
    launchTier: 'v1',
    minDataQuality: 0.55,
    gates: {
      moneylineEdge: 0.04,
      spreadEdgePoints: 3.5,
      totalEdgePoints: 5.5,
      minModelProbability: 0.56,
    },
  },
  ncaab: {
    key: 'ncaab',
    label: 'NCAAB',
    sportName: 'College Basketball',
    oddsSportKey: 'basketball_ncaab',
    ballDontLieBaseUrl: null,
    dataSource: 'odds_api_first',
    enabled: true,
    launchTier: 'v1',
    minDataQuality: 0.65,
    gates: {
      moneylineEdge: 0.06,
      spreadEdgePoints: 5.5,
      totalEdgePoints: 7.5,
      minModelProbability: 0.58,
    },
  },
  wnba: {
    key: 'wnba',
    label: 'WNBA',
    sportName: 'Basketball',
    oddsSportKey: 'basketball_wnba',
    ballDontLieBaseUrl: 'https://api.balldontlie.io/wnba/v1',
    dataSource: 'odds_api_first',
    enabled: true,
    launchTier: 'v1',
    minDataQuality: 0.60,
    gates: {
      moneylineEdge: 0.05,
      spreadEdgePoints: 4.5,
      totalEdgePoints: 6.5,
      minModelProbability: 0.57,
    },
  },
  ncaaw: {
    key: 'ncaaw',
    label: 'NCAAW',
    sportName: 'Women College Basketball',
    oddsSportKey: 'basketball_wncaab',
    ballDontLieBaseUrl: null,
    dataSource: 'odds_api_first',
    enabled: false,
    launchTier: 'v2',
    minDataQuality: 0.68,
    gates: {
      moneylineEdge: 0.07,
      spreadEdgePoints: 6.0,
      totalEdgePoints: 8.0,
      minModelProbability: 0.59,
    },
  },
};

const API_SPORTS_LEAGUE_OVERRIDES = {
  apisports_12: {
    label: 'NBA',
    sportName: 'Basketball',
    minDataQuality: 0.55,
    gates: {
      moneylineEdge: 0.04,
      spreadEdgePoints: 3.5,
      totalEdgePoints: 5.5,
      minModelProbability: 0.56,
    },
  },
  apisports_120: {
    label: 'EuroLeague',
    sportName: 'Basketball',
    minDataQuality: 0.58,
    gates: {
      moneylineEdge: 0.05,
      spreadEdgePoints: 4.5,
      totalEdgePoints: 6.0,
      minModelProbability: 0.57,
    },
  },
};

export function isApiSportsLeagueKey(leagueKey = '') {
  return String(leagueKey || '').toLowerCase().startsWith('apisports_');
}

export function getApiSportsGenericLeague(leagueKey = 'apisports_basketball') {
  const key = String(leagueKey || 'apisports_basketball').toLowerCase();
  const override = API_SPORTS_LEAGUE_OVERRIDES[key] || null;
  return {
    key,
    label: override?.label || 'Global Basketball',
    sportName: override?.sportName || 'Basketball',
    oddsSportKey: null,
    ballDontLieBaseUrl: null,
    dataSource: 'api_sports_basketball',
    enabled: true,
    launchTier: override ? 'v1-targeted' : 'v1-global',
    minDataQuality: override?.minDataQuality ?? 0.42,
    gates: override?.gates || {
      moneylineEdge: 0.05,
      spreadEdgePoints: 5.0,
      totalEdgePoints: 7.0,
      minModelProbability: 0.57,
    },
  };
}

export function getBasketballLeague(leagueKey = 'nba') {
  const key = String(leagueKey || 'nba').toLowerCase();
  if (BASKETBALL_LEAGUES[key]) return BASKETBALL_LEAGUES[key];
  if (isApiSportsLeagueKey(key)) return getApiSportsGenericLeague(key);
  return null;
}

export function getEnabledBasketballLeagues() {
  return Object.values(BASKETBALL_LEAGUES).filter((league) => league.enabled);
}

export function assertEnabledBasketballLeague(leagueKey = 'nba') {
  const league = getBasketballLeague(leagueKey);
  if (!league) {
    const err = new Error(`Unknown basketball league: ${leagueKey}`);
    err.statusCode = 404;
    throw err;
  }
  if (!league.enabled) {
    const err = new Error(`${league.label} is mapped but not enabled for Basketball V1 yet`);
    err.statusCode = 403;
    throw err;
  }
  return league;
}
