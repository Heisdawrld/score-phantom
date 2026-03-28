/**
 * fixtureSeeder.js
 * Shared seeding logic — uses the shared `db` module so it works both
 * on app startup (autoSeed) and via the admin /api/admin/seed endpoint.
 */
import axios from 'axios';
import db from '../config/database.js';

const KEY = process.env.LIVESCORE_API_KEY;
const SECRET = process.env.LIVESCORE_API_SECRET;
const BASE = 'https://livescore-api.com/api-client';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(path, params = {}) {
  await sleep(400);
  const res = await axios.get(`${BASE}${path}`, {
    params: { key: KEY, secret: SECRET, ...params },
    timeout: 15000,
  });
  return res.data;
}

async function fetchFixturesByDate(date) {
  const allFixtures = [];
  let page = 1;

  while (true) {
    try {
      // Correct endpoint: /fixtures/matches.json (NOT /fixtures/list.json)
      const data = await get('/fixtures/matches.json', { date, page });
      const fixtures = data.data?.fixtures || [];
      if (!fixtures.length) break;

      for (const f of fixtures) {
        // /fixtures/matches.json returns FLAT fields
        const homeName = f.home_name || f.home?.name || '';
        const awayName = f.away_name || f.away?.name || '';
        const homeId   = String(f.home_id || f.home?.id || f.id + '_h');
        const awayId   = String(f.away_id || f.away?.id || f.id + '_a');
        const competitionId   = String(f.competition?.id || f.competition_id || '0');
        const competitionName = f.competition?.name || f.competition_name || f.league_name || '';
        const countryName     = f.country?.name || f.competition?.country || f.location || '';

        allFixtures.push({
          match_id: String(f.id),
          home_team_id: homeId,
          home_team_name: homeName,
          home_team_short_name: homeName.substring(0, 3).toUpperCase() || '',
          away_team_id: awayId,
          away_team_name: awayName,
          away_team_short_name: awayName.substring(0, 3).toUpperCase() || '',
          tournament_id: competitionId,
          tournament_name: competitionName,
          category_name: countryName,
          match_date: f.date + 'T' + (f.time || '00:00:00'),
          match_url:            String(f.id),
          odds_home:            f.odds?.pre?.['1'] || null,
          odds_draw:            f.odds?.pre?.['X'] || null,
          odds_away:            f.odds?.pre?.['2'] || null,
        });
      }

      if (!data.data?.next_page) break;
      page++;
      await sleep(350);
    } catch (err) {
      console.error(`[Seeder] Fixtures failed for ${date} page ${page}:`, err.message);
      break;
    }
  }

  return allFixtures;
}

/**
 * Seed the database with fixtures for the next `days` days.
 * If `clearFirst` is true, existing fixture/historical data is wiped first.
 */
export async function seedFixtures({ days = 7, clearFirst = false, log = console.log } = {}) {
  if (!KEY || !SECRET) {
    throw new Error('LIVESCORE_API_KEY and LIVESCORE_API_SECRET must be set');
  }

  if (clearFirst) {
    log('[Seeder] Clearing old fixture data...');
    await db.execute('DELETE FROM predictions');
    await db.execute('DELETE FROM fixture_odds');
    await db.execute('DELETE FROM historical_matches');
    await db.execute('DELETE FROM fixtures');
    await db.execute('DELETE FROM teams');
    await db.execute('DELETE FROM tournaments');
  }

  const allFixtures = [];
  const now = new Date();

  for (let i = 0; i <= days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const fixtures = await fetchFixturesByDate(dateStr);
    log(`[Seeder] ${dateStr}: ${fixtures.length} fixtures`);
    allFixtures.push(...fixtures);
    await sleep(500);
  }

  log(`[Seeder] Total: ${allFixtures.length} fixtures. Inserting...`);

  let inserted = 0;
  let failed = 0;

  for (const f of allFixtures) {
    try {
      await db.batch([
        {
          sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.home_team_id, f.home_team_name, f.home_team_short_name],
        },
        {
          sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.away_team_id, f.away_team_name, f.away_team_short_name],
        },
        {
          sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)',
          args: [f.tournament_id, f.tournament_name, f.category_name, ''],
        },
        {
          sql: `INSERT OR IGNORE INTO fixtures
                  (id, home_team_id, away_team_id, tournament_id,
                   home_team_name, away_team_name, tournament_name,
                   category_name, match_date, match_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            f.match_id,
            f.home_team_id,
            f.away_team_id,
            f.tournament_id,
            f.home_team_name,
            f.away_team_name,
            f.tournament_name,
            f.category_name,
            f.match_date,
            f.match_url,
          ],
        },
      ]);
      // Save pre-match odds if available from fixture list
      if (f.odds_home || f.odds_draw || f.odds_away) {
        try {
          await db.execute({
            sql: `INSERT OR IGNORE INTO fixture_odds (fixture_id, home, draw, away)
                  VALUES (?, ?, ?, ?)`,
            args: [f.match_id, f.odds_home || null, f.odds_draw || null, f.odds_away || null],
          });
        } catch (_) {}
      }
      inserted++;
    } catch (err) {
      failed++;
    }
  }

  log(`[Seeder] Done! Inserted: ${inserted} | Failed: ${failed}`);
  return { inserted, failed, total: allFixtures.length };
}
