import db from '../config/database.js';
import { safeNum } from '../utils/math.js';
import { computeFormFeatures } from './computeFormFeatures.js';
import { computeSplitFeatures } from './computeSplitFeatures.js';
import { computeH2HFeatures } from './computeH2HFeatures.js';
import { computeTeamStrength } from './computeTeamStrength.js';
import { computeContextFeatures } from './computeContextFeatures.js';
import { computeVolatilityFeatures } from './computeVolatilityFeatures.js';
import { computeMarketFeatures } from './computeMarketFeatures.js';

async function getMatches(fixtureId, type) {
  const result = await db.execute({
    sql: 'SELECT * FROM historical_matches WHERE fixture_id = ? AND type = ? ORDER BY date DESC',
    args: [fixtureId, type],
  });
  return result.rows || [];
}

async function getFixtureMeta(fixtureId) {
  try {
    const result = await db.execute({
      sql: 'SELECT meta FROM fixtures WHERE id = ? LIMIT 1',
      args: [fixtureId],
    });
    const row = result.rows?.[0];
    if (!row?.meta) return {};
    return typeof row.meta === 'object' ? row.meta : JSON.parse(row.meta);
  } catch { return {}; }
}

function buildStandingsMap(standings = []) {
  const map = new Map();
  for (const row of standings) { if (row?.team) map.set(row.team, row); }
  return map;
}

function buildTableContext(homeTeamName, awayTeamName, standings, homeMomentum, awayMomentum) {
  const homeRow = standings.find(r => r.team === homeTeamName);
  const awayRow = standings.find(r => r.team === awayTeamName);
  const homePos = safeNum(homeRow?.position, null);
  const awayPos = safeNum(awayRow?.position, null);
  const homePts = safeNum(homeRow?.points, null);
  const awayPts = safeNum(awayRow?.points, null);
  const positionGap = (homePos !== null && awayPos !== null) ? awayPos - homePos : 0;
  const pointsGap = (homePts !== null && awayPts !== null) ? homePts - awayPts : 0;

  function classify(position, total = standings.length || 20) {
    if (position === null) return 'unknown';
    if (position <= 2) return 'title';
    if (position <= 4) return 'ucl';
    if (position <= 6) return 'europe';
    if (position >= total - 2) return 'relegation';
    if (position >= total - 4) return 'danger';
    return 'midtable';
  }

  return {
    available: !!homeRow && !!awayRow,
    home_position: homePos,
    away_position: awayPos,
    home_points: homePts,
    away_points: awayPts,
    position_gap: positionGap,
    points_gap: pointsGap,
    home_context: classify(homePos),
    away_context: classify(awayPos),
    home_momentum: safeNum(homeMomentum, 0),
    away_momentum: safeNum(awayMomentum, 0),
    momentum_gap: safeNum(homeMomentum, 0) - safeNum(awayMomentum, 0),
  };
}

export async function buildFeatureVector(fixtureId, homeTeamName, awayTeamName, odds = null) {
  const [h2hRaw, homeFormRaw, awayFormRaw, meta] = await Promise.all([
    getMatches(fixtureId, 'h2h'),
    getMatches(fixtureId, 'home_form'),
    getMatches(fixtureId, 'away_form'),
    getFixtureMeta(fixtureId),
  ]);

  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const standingsMap = buildStandingsMap(standings);

  const tableContext = buildTableContext(homeTeamName, awayTeamName, standings, meta?.homeMomentum, meta?.awayMomentum);

  // 1. Form features
  const homeFormFeatures = computeFormFeatures(homeFormRaw, homeTeamName, standingsMap);
  const awayFormFeatures = computeFormFeatures(awayFormRaw, awayTeamName, standingsMap);

  // 2. Venue split features
  const splitFeatures = computeSplitFeatures(homeFormFeatures, awayFormFeatures);

  // 3. H2H features
  const h2hFeatures = computeH2HFeatures(h2hRaw, homeTeamName, awayTeamName);

  // 4. Team strength
  const teamStrength = computeTeamStrength(homeFormFeatures, awayFormFeatures, tableContext, standings);

  // 5. Context features
  const contextFeatures = computeContextFeatures(tableContext, standings);

  // 6. Volatility features (NEW)
  const volatilityFeatures = computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures);

  // 7. Market features
  const marketFeatures = computeMarketFeatures(odds);

  // Clean internal _teamGoals before returning
  delete homeFormFeatures._teamGoals;
  delete awayFormFeatures._teamGoals;

  return {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeFormFeatures,
    awayFormFeatures,
    splitFeatures,
    h2hFeatures,
    teamStrength,
    tableContext,
    contextFeatures,
    volatilityFeatures,
    marketFeatures,
  };
}
