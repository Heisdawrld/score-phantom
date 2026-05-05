import db from '../../config/database.js';
import { initBasketballTables } from './basketballDb.js';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePoint(value = '') {
  const match = String(value || '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? asNumber(match[0]) : null;
}

function marketKeyFromBetName(name = '') {
  const s = String(name || '').toLowerCase();
  if (s.includes('home/away') || s.includes('winner') || s.includes('match winner') || s === '1x2') return 'h2h';
  if (s.includes('handicap') || s.includes('spread')) return 'spreads';
  if (s.includes('over/under') || s.includes('total')) return 'totals';
  if (s.includes('team total') || s.includes('team points')) return 'team_totals';
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'market';
}

function selectionFromValue(value = '') {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (lower === 'home' || lower === '1') return 'home';
  if (lower === 'away' || lower === '2') return 'away';
  if (lower.includes('over')) return 'over';
  if (lower.includes('under')) return 'under';
  if (lower.includes('draw')) return 'draw';
  return text;
}

export function normalizeApiSportsOddsRows(rawOdds, { leagueKey } = {}) {
  const gameId = rawOdds?.game?.id || rawOdds?.fixture?.id || rawOdds?.id || rawOdds?.game_id;
  const externalGameId = gameId ? `apisports_${gameId}` : null;
  const resolvedLeagueKey = leagueKey || `apisports_${rawOdds?.league?.id || 'basketball'}`;
  const rows = [];

  const bookmakers = Array.isArray(rawOdds?.bookmakers) ? rawOdds.bookmakers : [];
  for (const bookmaker of bookmakers) {
    const bookmakerName = bookmaker?.name || bookmaker?.title || bookmaker?.key || `bookmaker_${bookmaker?.id || 'unknown'}`;
    const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];

    for (const bet of bets) {
      const marketName = bet?.name || bet?.key || bet?.label || 'Market';
      const marketKey = marketKeyFromBetName(marketName);
      const values = Array.isArray(bet?.values) ? bet.values : Array.isArray(bet?.outcomes) ? bet.outcomes : [];

      for (const outcome of values) {
        const outcomeValue = outcome?.value ?? outcome?.name ?? outcome?.label ?? outcome?.selection;
        const price = asNumber(outcome?.odd ?? outcome?.price ?? outcome?.odds);
        if (!price || price <= 1) continue;

        rows.push({
          league_key: resolvedLeagueKey,
          external_game_id: externalGameId,
          odds_event_id: externalGameId,
          bookmaker: String(bookmaker?.id || bookmakerName).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          bookmaker_title: bookmakerName,
          market_key: marketKey,
          market_name: marketName,
          selection: selectionFromValue(outcomeValue),
          raw_selection: String(outcomeValue || ''),
          price,
          point: normalizePoint(outcomeValue),
          last_update: rawOdds?.update || rawOdds?.updated || rawOdds?.last_update || null,
          raw: { bookmaker, bet, outcome },
        });
      }
    }
  }

  return rows;
}

async function findGameByExternalId(leagueKey, externalGameId) {
  if (!leagueKey || !externalGameId) return null;
  const result = await db.execute({
    sql: `SELECT id FROM basketball_games WHERE league_key = ? AND external_game_id = ? LIMIT 1`,
    args: [leagueKey, externalGameId],
  });
  return result.rows?.[0] || null;
}

export async function saveApiSportsBasketballOdds(rawOdds, { leagueKey } = {}) {
  await initBasketballTables();
  const rows = normalizeApiSportsOddsRows(rawOdds, { leagueKey });
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const game = await findGameByExternalId(row.league_key, row.external_game_id);
    if (!game?.id) {
      skipped++;
      continue;
    }

    const implied = row.price > 1 ? 1 / row.price : null;
    try {
      if (row.point === null || row.point === undefined) {
        await db.execute({
          sql: `DELETE FROM basketball_odds
                WHERE league_key = ? AND game_id = ? AND bookmaker = ? AND market_key = ? AND selection = ? AND point IS NULL`,
          args: [row.league_key, game.id, row.bookmaker, row.market_key, row.selection],
        });
      } else {
        await db.execute({
          sql: `DELETE FROM basketball_odds
                WHERE league_key = ? AND game_id = ? AND bookmaker = ? AND market_key = ? AND selection = ? AND point = ?`,
          args: [row.league_key, game.id, row.bookmaker, row.market_key, row.selection, row.point],
        });
      }

      await db.execute({
        sql: `INSERT INTO basketball_odds
          (league_key, game_id, odds_event_id, bookmaker, bookmaker_title, market_key, selection, price, point, implied_probability, last_update, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          row.league_key,
          game.id,
          row.odds_event_id,
          row.bookmaker,
          row.bookmaker_title,
          row.market_key,
          row.selection,
          row.price,
          row.point,
          implied,
          row.last_update,
          new Date().toISOString(),
        ],
      });
      inserted++;
    } catch (err) {
      skipped++;
      console.warn('[apiSportsBasketballOdds] save failed:', err.message);
    }
  }

  return { inserted, skipped, rows: rows.length };
}
