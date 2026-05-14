import db from '../config/database.js';

const KEEP_LEAGUES = ['nba', 'ncaab', 'wnba', 'apisports_120'];

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function count(sql, args = []) {
  const r = await db.execute({ sql, args });
  return Number(r.rows?.[0]?.c || 0);
}

async function remove(sql, args = []) {
  const r = await db.execute({ sql, args });
  return Number(r.rowsAffected || 0);
}

async function main() {
  const keep = KEEP_LEAGUES;
  const keepList = placeholders(keep);
  const gameIdsResult = await db.execute({
    sql: `SELECT id FROM basketball_games WHERE league_key NOT IN (${keepList})`,
    args: keep,
  });
  const staleGameIds = (gameIdsResult.rows || []).map((row) => Number(row.id)).filter(Number.isFinite);

  const before = {
    games: await count('SELECT COUNT(*) AS c FROM basketball_games'),
    odds: await count('SELECT COUNT(*) AS c FROM basketball_odds'),
    predictions: await count('SELECT COUNT(*) AS c FROM basketball_predictions'),
    leagueMeta: await count('SELECT COUNT(*) AS c FROM basketball_league_meta'),
    teamMeta: await count('SELECT COUNT(*) AS c FROM basketball_team_meta'),
  };

  let removedOddsByGame = 0;
  let removedPredictionsByGame = 0;
  if (staleGameIds.length) {
    const gamePlaceholders = placeholders(staleGameIds);
    removedOddsByGame = await remove(`DELETE FROM basketball_odds WHERE game_id IN (${gamePlaceholders})`, staleGameIds);
    removedPredictionsByGame = await remove(`DELETE FROM basketball_predictions WHERE game_id IN (${gamePlaceholders})`, staleGameIds);
  }

  const removedOddsByLeague = await remove(`DELETE FROM basketball_odds WHERE league_key NOT IN (${keepList})`, keep);
  const removedPredictionsByLeague = await remove(`DELETE FROM basketball_predictions WHERE league_key NOT IN (${keepList})`, keep);
  const removedGames = await remove(`DELETE FROM basketball_games WHERE league_key NOT IN (${keepList})`, keep);
  const removedLeagueMeta = await remove(`DELETE FROM basketball_league_meta WHERE league_key NOT IN (${keepList})`, keep);
  const removedTeamMeta = await remove(`DELETE FROM basketball_team_meta WHERE league_key NOT IN (${keepList})`, keep);

  const after = {
    games: await count('SELECT COUNT(*) AS c FROM basketball_games'),
    odds: await count('SELECT COUNT(*) AS c FROM basketball_odds'),
    predictions: await count('SELECT COUNT(*) AS c FROM basketball_predictions'),
    leagueMeta: await count('SELECT COUNT(*) AS c FROM basketball_league_meta'),
    teamMeta: await count('SELECT COUNT(*) AS c FROM basketball_team_meta'),
  };

  console.log(JSON.stringify({
    keep,
    before,
    removed: {
      staleGameIds: staleGameIds.length,
      oddsByGame: removedOddsByGame,
      predictionsByGame: removedPredictionsByGame,
      oddsByLeague: removedOddsByLeague,
      predictionsByLeague: removedPredictionsByLeague,
      games: removedGames,
      leagueMeta: removedLeagueMeta,
      teamMeta: removedTeamMeta,
    },
    after,
  }, null, 2));
}

main().catch((err) => {
  console.error('[pruneBasketballScope] failed:', err);
  process.exitCode = 1;
});
