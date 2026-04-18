import dotenv from 'dotenv';
import { bsdFetchAll, normaliseBsdEventToFixture, extractOddsFromEvent } from '../../services/bsd.js';

dotenv.config();

const TURSO_URL = 'https://scorephantom-heisdawrld.aws-eu-west-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzUyODg3NjEsImlkIjoiMDE5Y2YyM2EtNzkwMS03MTFhLWI5NDItYWU0ZDBlY2JkYjkxIiwicmlkIjoiZmNiZjE0ZTItZWJmYS00MzMyLWIxOTktN2RmZmIyOWUzYmJhIn0.XVNBBygoogICZz8ZpWKLzaqKUjHs-ZDRRrV_7YJMf_ScJgUT202uNmjZU4Wai1zzZ0z1PYqzGJ90hgYP-pceDw';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Function to execute SQL using Turso's HTTP API directly (bypasses TCP firewall)
async function executeHttpSQL(statements) {
  const requests = statements.map(stmt => ({
    type: 'execute',
    stmt: {
      sql: stmt.sql,
      args: stmt.args ? stmt.args.map(a => {
        if (a === null || a === undefined) return { type: 'null' };
        if (typeof a === 'number') {
          // If it's a float, Turso HTTP needs it as float type, not integer.
          if (!Number.isInteger(a)) return { type: 'float', value: a };
          return { type: 'integer', value: a.toString() };
        }
        return { type: 'text', value: String(a) };
      }) : []
    }
  }));

  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Turso HTTP Error: ${res.status} ${txt}`);
  }
  return await res.json();
}

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
  for (const sql of cols) { 
    try { await executeHttpSQL([{ sql }]); } catch (_) {} 
  }
}

async function insertEvents(events) {
  let inserted = 0;
  let oddsWritten = 0;
  
  // We batch them in chunks of 50 to avoid hitting HTTP payload limits
  const chunkSize = 50;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    const statements = [];
    
    for (const event of chunk) {
      const f = normaliseBsdEventToFixture(event);
      if (!f) continue;
      
      statements.push(
        {
          sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.home_team_id, f.home_team_name, f.home_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
          args: [f.away_team_id, f.away_team_name, f.away_team_name.substring(0, 3).toUpperCase()],
        },
        {
          sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)',
          args: [f.tournament_id, f.tournament_name, f.category_name, ''],
        },
        {
          sql: `INSERT OR REPLACE INTO fixtures
                  (id, home_team_id, away_team_id, tournament_id,
                   home_team_name, away_team_name, tournament_name, category_name,
                   match_date, match_url, match_status, home_score, away_score,
                   home_team_logo, away_team_logo,
                   bsd_league_id, bsd_home_api_id, bsd_away_api_id, bsd_event_api_id, enriched)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          args: [
            f.match_id, f.home_team_id, f.away_team_id, f.tournament_id,
            f.home_team_name, f.away_team_name, f.tournament_name, f.category_name,
            f.match_date, f.match_url, f.match_status, f.home_score ?? null, f.away_score ?? null,
            f.home_team_logo || '', f.away_team_logo || '',
            f.bsd_league_id ?? null, f.bsd_home_api_id ?? null, f.bsd_away_api_id ?? null, f.bsd_event_api_id ?? null,
          ],
        }
      );
      inserted++;

      const odds = extractOddsFromEvent(event, f.match_id);
      if (odds.home || odds.draw || odds.away) {
        statements.push({
          sql: `INSERT OR REPLACE INTO fixture_odds
                  (fixture_id, home, draw, away, btts_yes, btts_no, over_under)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            odds.fixture_id, odds.home, odds.draw, odds.away,
            odds.btts_yes, odds.btts_no, JSON.stringify(odds.over_under || {}),
          ],
        });
        oddsWritten++;
      }
    }
    
    if (statements.length > 0) {
       try {
         await executeHttpSQL(statements);
       } catch(e) {
         console.warn(`[DailyVacuum] Failed to insert batch: ${e.message}`);
       }
    }
  }

  return { inserted, oddsWritten };
}

async function main() {
  await ensureColumns();

  const args = parseArgs(process.argv);
  // Let's run a quick 7-day test run first to verify
  const daysToFetch = parseInt(args.days || '7', 10);
  
  // Start from yesterday
  let currentDate = new Date();
  currentDate.setDate(currentDate.getDate() - 1);
  
  console.log(`[DailyVacuum HTTP] Starting backward scrape for ${daysToFetch} days, beginning from ${currentDate.toISOString().slice(0, 10)}`);
  
  let totalInserted = 0;
  
  for (let i = 0; i < daysToFetch; i++) {
    const targetDate = currentDate.toISOString().slice(0, 10);
    console.log(`\n[DailyVacuum] [Day ${i+1}/${daysToFetch}] Scraping all matches for ${targetDate}...`);
    
    try {
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

  console.log(`\n[DailyVacuum HTTP] COMPLETE. Total historical matches vacuumed and inserted: ${totalInserted}`);
}

main().catch((e) => {
  console.error('[DailyVacuum HTTP] Fatal Error:', e.message);
  process.exit(1);
});
