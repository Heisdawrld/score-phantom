import db from '../../config/database.js';

function toJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

export function getApiSportsLeagueKey(leagueId) {
  return `apisports_${leagueId || 'basketball'}`;
}

export function getApiSportsTeamKey(teamId, name = 'team') {
  if (teamId) return `apisports_${teamId}`;
  const slug = String(name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `apisports_${slug}`;
}

export async function initBasketballMetaTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS basketball_league_meta (
    league_key TEXT PRIMARY KEY,
    provider TEXT,
    provider_league_id TEXT,
    name TEXT,
    country TEXT,
    country_code TEXT,
    logo TEXT,
    flag TEXT,
    season INTEGER,
    raw_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS basketball_team_meta (
    team_key TEXT PRIMARY KEY,
    provider TEXT,
    provider_team_id TEXT,
    name TEXT,
    logo TEXT,
    country TEXT,
    league_key TEXT,
    raw_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function upsertBasketballLeagueMeta(meta) {
  if (!meta?.league_key) return null;
  await initBasketballMetaTables();
  return db.execute({
    sql: `INSERT INTO basketball_league_meta
      (league_key, provider, provider_league_id, name, country, country_code, logo, flag, season, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(league_key) DO UPDATE SET
        provider = COALESCE(EXCLUDED.provider, basketball_league_meta.provider),
        provider_league_id = COALESCE(EXCLUDED.provider_league_id, basketball_league_meta.provider_league_id),
        name = COALESCE(EXCLUDED.name, basketball_league_meta.name),
        country = COALESCE(EXCLUDED.country, basketball_league_meta.country),
        country_code = COALESCE(EXCLUDED.country_code, basketball_league_meta.country_code),
        logo = COALESCE(EXCLUDED.logo, basketball_league_meta.logo),
        flag = COALESCE(EXCLUDED.flag, basketball_league_meta.flag),
        season = COALESCE(EXCLUDED.season, basketball_league_meta.season),
        raw_json = COALESCE(EXCLUDED.raw_json, basketball_league_meta.raw_json),
        updated_at = EXCLUDED.updated_at`,
    args: [
      meta.league_key,
      meta.provider || null,
      meta.provider_league_id || null,
      meta.name || null,
      meta.country || null,
      meta.country_code || null,
      meta.logo || null,
      meta.flag || null,
      meta.season || null,
      toJson(meta.raw || meta),
      new Date().toISOString(),
    ],
  });
}

export async function upsertBasketballTeamMeta(meta) {
  if (!meta?.team_key || !meta?.name) return null;
  await initBasketballMetaTables();
  return db.execute({
    sql: `INSERT INTO basketball_team_meta
      (team_key, provider, provider_team_id, name, logo, country, league_key, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_key) DO UPDATE SET
        provider = COALESCE(EXCLUDED.provider, basketball_team_meta.provider),
        provider_team_id = COALESCE(EXCLUDED.provider_team_id, basketball_team_meta.provider_team_id),
        name = COALESCE(EXCLUDED.name, basketball_team_meta.name),
        logo = COALESCE(EXCLUDED.logo, basketball_team_meta.logo),
        country = COALESCE(EXCLUDED.country, basketball_team_meta.country),
        league_key = COALESCE(EXCLUDED.league_key, basketball_team_meta.league_key),
        raw_json = COALESCE(EXCLUDED.raw_json, basketball_team_meta.raw_json),
        updated_at = EXCLUDED.updated_at`,
    args: [
      meta.team_key,
      meta.provider || null,
      meta.provider_team_id || null,
      meta.name,
      meta.logo || null,
      meta.country || null,
      meta.league_key || null,
      toJson(meta.raw || meta),
      new Date().toISOString(),
    ],
  });
}

export async function cacheApiSportsGameMeta(rawGame) {
  const league = rawGame?.league || {};
  const country = rawGame?.country || {};
  const teams = rawGame?.teams || {};
  const leagueKey = getApiSportsLeagueKey(league.id);

  await upsertBasketballLeagueMeta({
    league_key: leagueKey,
    provider: 'api_sports_basketball',
    provider_league_id: league.id != null ? String(league.id) : null,
    name: league.name || 'Global Basketball',
    country: country.name || league.country || null,
    country_code: country.code || null,
    logo: league.logo || null,
    flag: country.flag || null,
    season: Number(league.season) || null,
    raw: { league, country },
  });

  for (const side of ['home', 'away']) {
    const team = teams?.[side];
    if (!team?.name) continue;
    await upsertBasketballTeamMeta({
      team_key: getApiSportsTeamKey(team.id, team.name),
      provider: 'api_sports_basketball',
      provider_team_id: team.id != null ? String(team.id) : null,
      name: team.name,
      logo: team.logo || null,
      country: country.name || league.country || null,
      league_key: leagueKey,
      raw: team,
    });
  }
}
