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
      const data = await get('/fixtures/matches.json', { date, page });
      const fixtures = data.data?.fixtures || [];
      if (!fixtures.length) break;

      for (const f of fixtures) {
        allFixtures.push({
          match_id: String(f.id),
          home_team_id: String(f.home_id),
          home_team_name: f.home_name,
          home_team_short_name: f.home_name?.substring(0, 3).toUpperCase() || '',
          away_team_id: String(f.away_id),
          away_team_name: f.away_name,
          away_team_short_name: f.away_name?.substring(0, 3).toUpperCase() || '',
          tournament_id: String(f.competition_id),
          tournament_name: f.competition?.name || f.competition_name || '',
          category_name: f.competition?.country || f.country || '',
          match_date: f.date + 'T' + (f.time || '00:00:00'),
          match_url: String(f.id),
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
      inserted++;
    } catch (err) {
      failed++;
    }
  }

  log(`[Seeder] Done! Inserted: ${inserted} | Failed: ${failed}`);
  return { inserted, failed, total: allFixtures.length };
}
