import { fetchApiSportsGames, normalizeApiSportsGame } from '../services/apiSportsBasketball.js';
import { initBasketballTables, upsertBasketballGame } from '../storage/basketballDb.js';
import { initBasketballMetaTables, cacheApiSportsGameMeta } from '../storage/basketballMetaDb.js';

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function syncApiSportsBasketballGamesCached({ daysAhead = 7, date = null } = {}) {
  await initBasketballTables();
  await initBasketballMetaTables();

  const safeDays = Math.min(Math.max(Number(daysAhead || 7), 1), 14);
  const dates = date ? [date] : Array.from({ length: safeDays }, (_, i) => isoDate(i));

  let fetched = 0;
  let saved = 0;
  let metaSaved = 0;
  let quota = null;
  const daily = [];
  const leagueMap = new Map();

  for (const day of dates) {
    try {
      const payload = await fetchApiSportsGames({ date: day });
      quota = payload.quota || quota;
      const games = payload.data || [];
      fetched += games.length;
      let daySaved = 0;
      let dayMeta = 0;

      for (const raw of games) {
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

      daily.push({ date: day, fetched: games.length, saved: daySaved, metaSaved: dayMeta });
    } catch (err) {
      daily.push({ date: day, error: err.message, statusCode: err.statusCode || 500 });
    }
  }

  return {
    provider: 'api_sports_basketball',
    role: 'premium_schedule_with_cached_meta',
    daysAhead: date ? null : safeDays,
    dates,
    fetched,
    saved,
    metaSaved,
    daily,
    leagues: Array.from(leagueMap.values()).sort((a, b) => b.games - a.games),
    quota,
  };
}
