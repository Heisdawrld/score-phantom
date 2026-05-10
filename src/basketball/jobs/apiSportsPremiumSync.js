import { fetchApiSportsGames, normalizeApiSportsGame } from '../services/apiSportsBasketball.js';
import { initBasketballTables, upsertBasketballGame } from '../storage/basketballDb.js';
import { initBasketballMetaTables, cacheApiSportsGameMeta } from '../storage/basketballMetaDb.js';
import { isSelectedApiSportsLeague, getApiSportsTopBasketballLeagues } from '../config/apiSportsTopLeagues.js';

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function syncApiSportsBasketballGamesCached({ daysAhead = 7, date = null, selectedOnly = true } = {}) {
  await initBasketballTables();
  await initBasketballMetaTables();

  const safeDays = Math.min(Math.max(Number(daysAhead || 7), 1), 14);
  const dates = date ? [date] : Array.from({ length: safeDays }, (_, i) => isoDate(i));

  let fetched = 0;
  let considered = 0;
  let skippedByLeague = 0;
  let saved = 0;
  let metaSaved = 0;
  let quota = null;
  const daily = [];
  const leagueMap = new Map();
  const selectedLeagues = getApiSportsTopBasketballLeagues({ limit: 15 });

  for (const day of dates) {
    try {
      const payload = await fetchApiSportsGames({ date: day });
      quota = payload.quota || quota;
      const games = payload.data || [];
      fetched += games.length;
      let daySaved = 0;
      let dayMeta = 0;
      let daySkipped = 0;

      for (const raw of games) {
        const leagueId = Number(raw?.league?.id);
        if (selectedOnly && !isSelectedApiSportsLeague(leagueId)) {
          skippedByLeague++;
          daySkipped++;
          continue;
        }

        considered++;
        const normalized = normalizeApiSportsGame(raw);
        if (!normalized.external_game_id || !normalized.home_team || !normalized.away_team) continue;

        await cacheApiSportsGameMeta(raw);
        dayMeta++;
        metaSaved++;

        await upsertBasketballGame(normalized);
        daySaved++;
        saved++;

        const league = raw?.league || {};
        const country = raw?.country || {};
        const id = String(league.id || 'unknown');
        if (!leagueMap.has(id)) {
          leagueMap.set(id, {
            id: league.id || null,
            key: normalized.league_key,
            name: league.name || 'Unknown League',
            country: country.name || league.country || null,
            logo: league.logo || null,
            flag: country.flag || null,
            games: 0,
          });
        }
        leagueMap.get(id).games++;
      }

      daily.push({ date: day, fetched: games.length, considered: games.length - daySkipped, saved: daySaved, metaSaved: dayMeta, skippedByLeague: daySkipped });
    } catch (err) {
      daily.push({ date: day, error: err.message, statusCode: err.statusCode || 500 });
    }
  }

  return {
    provider: 'api_sports_basketball',
    role: selectedOnly ? 'selected_league_schedule_with_cached_meta' : 'premium_schedule_with_cached_meta',
    selectedOnly,
    selectedLeagues,
    daysAhead: date ? null : safeDays,
    dates,
    fetched,
    considered,
    skippedByLeague,
    saved,
    metaSaved,
    daily,
    leagues: Array.from(leagueMap.values()).sort((a, b) => b.games - a.games),
    quota,
  };
}
