import db from '../config/database.js';
import { resolveBasketballTeamLogo } from '../basketball/utils/teamLogos.js';

function safeParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function main() {
  const rows = await db.execute(`
    SELECT id, league_key, home_team, away_team, home_team_abbr, away_team_abbr, home_team_logo, away_team_logo, raw_json
    FROM basketball_games
    WHERE home_team_logo IS NULL OR home_team_logo = '' OR away_team_logo IS NULL OR away_team_logo = ''
  `);

  let updated = 0;
  for (const row of rows.rows || []) {
    const raw = safeParse(row.raw_json, null) || {};
    const teams = raw?.teams || raw?.raw?.teams || {};
    const homeLogo = row.home_team_logo || raw?.homeTeamLogo || teams?.home?.logo || resolveBasketballTeamLogo({
      leagueKey: row.league_key,
      teamName: row.home_team,
      teamAbbr: row.home_team_abbr,
    });
    const awayLogo = row.away_team_logo || raw?.awayTeamLogo || teams?.away?.logo || resolveBasketballTeamLogo({
      leagueKey: row.league_key,
      teamName: row.away_team,
      teamAbbr: row.away_team_abbr,
    });

    if (!homeLogo && !awayLogo) continue;

    await db.execute({
      sql: `UPDATE basketball_games
            SET home_team_logo = COALESCE(?, home_team_logo),
                away_team_logo = COALESCE(?, away_team_logo),
                updated_at = ?
            WHERE id = ?`,
      args: [homeLogo || null, awayLogo || null, new Date().toISOString(), row.id],
    });
    updated++;
  }

  console.log(JSON.stringify({
    scanned: Number(rows.rows?.length || 0),
    updated,
  }, null, 2));
}

main().catch((err) => {
  console.error('[backfillBasketballLogos] failed:', err);
  process.exitCode = 1;
});
