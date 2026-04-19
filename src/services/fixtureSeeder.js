// fixtureSeeder.js — Seeds fixtures from BSD (Bzzoiro Sports Data)
import db from '../config/database.js';
import {
  fetchFixturesByDate,
  normaliseBsdEventToFixture,
  extractOddsFromEvent,
} from './bsd.js';

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

// The 35 exact leagues officially covered by BSD for ML and advanced stats.
const BSD_PREMIUM_LEAGUES = new Set([
  'africa cup of nations 2025', 'caf champions league', 'pro league', 'brasileirão serie a',
  'brasileirão serie b', 'copa do brasil', 'parva liga', 'championship', 'premier league',
  'champions league', 'europa league', 'ligue 1', 'bundesliga', 'stoiximan super league',
  'international friendly games', 'world cup 2026', 'serie a', 'liga mx apertura',
  'liga mx clausura', 'eredivisie', 'nigeria premier football league', 'ekstraklasa',
  'liga portugal betclic', 'superliga', 'saudi pro league', 'scottish premiership',
  'copa libertadores', 'copa sudamericana', 'la liga', 'liga f', 'segunda división',
  'allsvenskan', 'super league', 'trendyol super lig', 'mls'
]);

export async function seedFixtures({ days = 7, startOffset = 0, clearFirst = false, log = console.log } = {}) {
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
  const allBsdEvents = [];
  const now = new Date();
  for (let i = startOffset; i <= startOffset + days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    const events = await fetchFixturesByDate(dateStr);
    log('[Seeder] ' + dateStr + ': ' + events.length + ' events from BSD');
    allBsdEvents.push(...events);
    await sleep(400);
  }

  log('[Seeder] Total: ' + allBsdEvents.length + ' events. Normalising + inserting...');
  let inserted = 0, failed = 0, oddsWritten = 0;

  for (const event of allBsdEvents) {
      try {
        const f = normaliseBsdEventToFixture(event);
        if (!f) continue;

        // LAYER 1 ELIGIBILITY: Only allow matches from the 35 officially covered leagues
        const tourneyName = (f.tournament_name || '').toLowerCase().trim();
        if (!BSD_PREMIUM_LEAGUES.has(tourneyName)) {
          continue; // Throw junk matches in the trash before DB insertion
        }

        await db.batch([
        {
          sql: 'INSERT INTO teams (id, name, short_name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
          args: [f.home_team_id, f.home_team_name, f.home_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT INTO teams (id, name, short_name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
          args: [f.away_team_id, f.away_team_name, f.away_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
          args: [f.tournament_id, f.tournament_name, f.category_name, ''],
        },
        {
          sql: `INSERT INTO fixtures (id, home_team_id, away_team_id, tournament_id,
                   home_team_name, away_team_name, tournament_name, category_name,
                   match_date, match_url, match_status, home_score, away_score,
                   home_team_logo, away_team_logo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          args: [
            f.match_id, f.home_team_id, f.away_team_id, f.tournament_id,
            f.home_team_name, f.away_team_name, f.tournament_name, f.category_name,
            f.match_date, f.match_url, f.match_status, f.home_score ?? null, f.away_score ?? null,
            f.home_team_logo || '', f.away_team_logo || '',
          ],
        },
      ]);

      // Write odds extracted directly from BSD event response
      const odds = extractOddsFromEvent(event, f.match_id);
      if (odds.home || odds.draw || odds.away) {
        try {
          await db.execute({
            sql: `INSERT OR REPLACE INTO fixture_odds
                    (fixture_id, home, draw, away, btts_yes, btts_no, over_under)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
              odds.fixture_id, odds.home, odds.draw, odds.away,
              odds.btts_yes, odds.btts_no, odds.over_under,
            ],
          });
          oddsWritten++;
        } catch (_) {}
      }

      inserted++;
    } catch (err) {
      console.error('[Seeder] Failed to insert event:', err.message);
      failed++;
    }
  }

  log(`[Seeder] Done! Inserted: ${inserted} | Odds written: ${oddsWritten} | Failed: ${failed}`);
  return { inserted, failed, oddsWritten, total: allBsdEvents.length };
}
