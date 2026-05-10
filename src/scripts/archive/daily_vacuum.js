import db from '../../config/database.js';
import dotenv from 'dotenv';
import { bsdFetchAll, normaliseBsdEventToFixture, extractOddsFromEvent } from '../../services/bsd.js';

dotenv.config();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Ensure the necessary columns exist (same as seed script)
async function ensureColumns() {
  const cols = [
    'ALTER TABLE fixtures ADD COLUMN match_status TEXT DEFAULT "NS"',
    'ALTER TABLE fixtures ADD COLUMN home_score INTEGER',
    'ALTER TABLE fixtures ADD COLUMN away_score INTEGER',
    'ALTER TABLE fixtures ADD COLUMN live_minute TEXT',
    'ALTER TABLE fixtures ADD COLUMN bsd_league_id INTEGER',
    'ALTER TABLE fixtures ADD COLUMN bsd_home_api_id INTEGER',
    'ALTER TABLE fixtures ADD COLUMN bsd_away_api_id INTEGER',
    'ALTER TABLE fixtures ADD COLUMN bsd_event_api_id INTEGER',
  ];
  for (const sql of cols) { try { await db.execute(sql); } catch (_) {} }
}

async function insertEvents(events) {
  let inserted = 0;
  let oddsWritten = 0;

  for (const event of events) {
    const f = normaliseBsdEventToFixture(event);
    if (!f) continue;

    try {
      await db.batch([
        {
          sql: 'INSERT INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.home_team_id, f.home_team_name, f.home_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.away_team_id, f.away_team_name, f.away_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)',
          args: [f.tournament_id, f.tournament_name, f.category_name, ''],
        },
        {
          sql: `INSERT INTO fixtures
                  (id, home_team_id, away_team_id, tournament_id,
                   home_team_name, away_team_name, tournament_name, category_name,
                   match_date, match_url, match_status, home_score, away_score,
                   home_team_logo, away_team_logo,
                   bsd_league_id, bsd_home_api_id, bsd_away_api_id, bsd_event_api_id, enriched)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT (id) DO UPDATE SET
                  home_score = EXCLUDED.home_score,
                  away_score = EXCLUDED.away_score,
                  match_status = EXCLUDED.match_status,
                  home_team_logo = EXCLUDED.home_team_logo,
                  away_team_logo = EXCLUDED.away_team_logo`,
          args: [
            f.match_id, f.home_team_id, f.away_team_id, f.tournament_id,
            f.home_team_name, f.away_team_name, f.tournament_name, f.category_name,
            f.match_date, f.match_url, f.match_status, f.home_score ?? null, f.away_score ?? null,
            f.home_team_logo || '', f.away_team_logo || '',
            f.bsd_league_id ?? null, f.bsd_home_api_id ?? null, f.bsd_away_api_id ?? null, f.bsd_event_api_id ?? null,
          ],
        },
      ]);
      inserted++;

      const odds = extractOddsFromEvent(event, f.match_id);
      if (odds.home || odds.draw || odds.away) {
        try {
          await db.execute({
            sql: `INSERT INTO fixture_odds
                    (fixture_id, home, draw, away, btts_yes, btts_no, over_under)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (fixture_id) DO UPDATE SET
                    home = EXCLUDED.home, draw = EXCLUDED.draw, away = EXCLUDED.away,
                    btts_yes = EXCLUDED.btts_yes, btts_no = EXCLUDED.btts_no,
                    over_under = EXCLUDED.over_under`,
            args: [
              odds.fixture_id, odds.home, odds.draw, odds.away,
              odds.btts_yes, odds.btts_no, JSON.stringify(odds.over_under || {}),
            ],
          });
          oddsWritten++;
        } catch (_) {}
      }
    } catch (e) {
      console.warn(`[DailyVacuum] Failed to insert event ${f.match_id}: ${e.message}`);
    }
  }

  return { inserted, oddsWritten };
}

async function main() {
  await ensureColumns();

  const args = parseArgs(process.argv);
  // Default to 365 days (1 year) backwards if not specified
  const daysToFetch = parseInt(args.days || '365', 10);
  
  // Start from yesterday
  let currentDate = new Date();
  currentDate.setDate(currentDate.getDate() - 1);
  
  console.log(`[DailyVacuum] Starting backward scrape for ${daysToFetch} days, beginning from ${currentDate.toISOString().slice(0, 10)}`);
  
  let totalInserted = 0;
  
  for (let i = 0; i < daysToFetch; i++) {
    const targetDate = currentDate.toISOString().slice(0, 10);
    console.log(`\n[DailyVacuum] [Day ${i+1}/${daysToFetch}] Scraping all matches for ${targetDate}...`);
    
    try {
      // bsdFetchAll automatically handles the pagination "next" loops for us
      const dailyEvents = await bsdFetchAll('/events/', {
        date_from: targetDate,
        date_to: targetDate,
        status: 'finished'
      });
      
      if (!dailyEvents || dailyEvents.length === 0) {
         console.log(`[DailyVacuum] No finished matches found for ${targetDate}.`);
      } else {
         console.log(`[DailyVacuum] Found ${dailyEvents.length} raw matches on ${targetDate}. Inserting...`);
         const { inserted } = await insertEvents(dailyEvents);
         totalInserted += inserted;
         console.log(`[DailyVacuum] ✓ Inserted ${inserted} matches into DB.`);
      }
      
    } catch (e) {
      console.error(`[DailyVacuum] Error fetching ${targetDate}:`, e.message);
    }
    
    // Move back one day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Sleep to avoid rate limits
    await sleep(500);
  }

  console.log(`\n[DailyVacuum] COMPLETE. Total historical matches vacuumed and inserted: ${totalInserted}`);
}

main().catch((e) => {
  console.error('[DailyVacuum] Fatal Error:', e.message);
  process.exit(1);
});
