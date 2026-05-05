import { fetchApiSportsOdds } from '../services/apiSportsBasketball.js';
import { listBasketballGames } from '../storage/basketballDb.js';
import { saveApiSportsBasketballOdds } from '../storage/apiSportsOddsDb.js';
import { getApiSportsTopBasketballLeagues } from '../config/apiSportsTopLeagues.js';

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function apiSportsGameId(externalGameId = '') {
  const match = String(externalGameId || '').match(/apisports_(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function syncApiSportsBasketballOddsCached({ daysAhead = 2, date = null, leagueLimit = 12, maxGames = 40 } = {}) {
  const safeDays = Math.min(Math.max(Number(daysAhead || 2), 1), 2);
  const dates = date ? [date] : Array.from({ length: safeDays }, (_, i) => isoDate(i));
  const selectedLeagues = getApiSportsTopBasketballLeagues({ limit: leagueLimit });
  const allowedKeys = new Set(selectedLeagues.map((l) => l.key));

  let scannedGames = 0;
  let oddsRequests = 0;
  let savedMarkets = 0;
  let skipped = 0;
  let quota = null;
  const daily = [];

  for (const day of dates) {
    const from = `${day}T00:00:00`;
    const to = `${day}T23:59:59`;
    const games = await listBasketballGames({ from, to, limit: 500 });
    const targets = games
      .filter((game) => allowedKeys.has(String(game.league_key || '').toLowerCase()))
      .filter((game) => apiSportsGameId(game.external_game_id))
      .slice(0, Math.max(Number(maxGames || 40), 1));

    let dayRequests = 0;
    let daySaved = 0;
    let daySkipped = 0;

    for (const game of targets) {
      const gameId = apiSportsGameId(game.external_game_id);
      if (!gameId) continue;
      try {
        const payload = await fetchApiSportsOdds({ game: gameId });
        quota = payload.quota || quota;
        oddsRequests++;
        dayRequests++;
        const items = payload.data || [];
        if (!items.length) {
          daySkipped++;
          skipped++;
          continue;
        }
        for (const rawOdds of items) {
          const result = await saveApiSportsBasketballOdds(rawOdds, { leagueKey: game.league_key });
          savedMarkets += result.inserted;
          daySaved += result.inserted;
          skipped += result.skipped;
          daySkipped += result.skipped;
        }
      } catch (err) {
        daySkipped++;
        skipped++;
      }
    }

    scannedGames += targets.length;
    daily.push({ date: day, scannedGames: targets.length, oddsRequests: dayRequests, savedMarkets: daySaved, skipped: daySkipped });
  }

  return {
    provider: 'api_sports_basketball',
    role: 'selected_league_odds_cache',
    selectedLeagues,
    dates,
    scannedGames,
    oddsRequests,
    savedMarkets,
    skipped,
    quota,
    daily,
  };
}
