// fixtureSeeder.js - Seeds fixtures from SportAPI.ai (replaces LiveScore)
import db from '../config/database.js';
import { fetchFixturesByDate } from './sportapi.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureColumns() {
  const cols = [
    'ALTER TABLE fixtures ADD COLUMN country_flag TEXT DEFAULT ""',
    'ALTER TABLE fixtures ADD COLUMN home_team_logo TEXT DEFAULT ""',
    'ALTER TABLE fixtures ADD COLUMN away_team_logo TEXT DEFAULT ""',
    'ALTER TABLE fixtures ADD COLUMN odds_home REAL',
    'ALTER TABLE fixtures ADD COLUMN odds_draw REAL',
    'ALTER TABLE fixtures ADD COLUMN odds_away REAL',
    'ALTER TABLE fixtures ADD COLUMN home_score INTEGER',
    'ALTER TABLE fixtures ADD COLUMN away_score INTEGER',
    'ALTER TABLE fixtures ADD COLUMN match_status TEXT DEFAULT "NS"',
    'ALTER TABLE fixtures ADD COLUMN live_minute TEXT',
  ];
  for (const sql of cols) { try { await db.execute(sql); } catch (_) {} }
}

export async function seedFixtures({ days = 7, startOffset = 0, clearFirst = false, log = console.log } = {}) {
  const key = process.env.SPORTAPI_KEY;
  if (!key) throw new Error('SPORTAPI_KEY must be set in environment variables');
  await ensureColumns();
  if (clearFirst) {
    log('[Seeder] Clearing old fixture data (keeping users/payments/referrals/outcomes)...');
    await db.execute('DELETE FROM predictions_v2');
    await db.execute('DELETE FROM fixture_odds');
    await db.execute('DELETE FROM historical_matches');
    await db.execute('DELETE FROM fixtures');
    await db.execute('DELETE FROM teams');
    await db.execute('DELETE FROM tournaments');
  }
  const allFixtures = [];
  const now = new Date();
  for (let i = startOffset; i <= startOffset + days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    const fixtures = await fetchFixturesByDate(dateStr);
    log('[Seeder] ' + dateStr + ': ' + fixtures.length + ' fixtures');
    allFixtures.push(...fixtures);
    await sleep(400);
  }
  log('[Seeder] Total: ' + allFixtures.length + ' fixtures. Inserting...');
  let inserted = 0, failed = 0;
  for (const f of allFixtures) {
    try {
      await db.batch([
        { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.home_team_id, f.home_team_name, f.home_team_name.substring(0, 3).toUpperCase()] },
        { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.away_team_id, f.away_team_name, f.away_team_name.substring(0, 3).toUpperCase()] },
        { sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)', args: [f.tournament_id, f.tournament_name, f.category_name, ''] },
        { sql: 'INSERT OR IGNORE INTO fixtures (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, tournament_name, category_name, match_date, match_url, match_status, home_score, away_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [f.match_id, f.home_team_id, f.away_team_id, f.tournament_id, f.home_team_name, f.away_team_name, f.tournament_name, f.category_name, f.match_date, f.match_url, f.match_status || 'NS', f.home_score, f.away_score] },
      ]);
      inserted++;
    } catch (_) { failed++; }
  }
  log('[Seeder] Done! Inserted: ' + inserted + ' | Failed: ' + failed);
  return { inserted, failed, total: allFixtures.length };
}
