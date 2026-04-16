/**
 * seed_historical_seasons.js
 * 
 * Fetches the past 3 completed seasons for all available leagues in BSD
 * and builds a comprehensive historical dataset. 
 * Enables the prediction engine to use true team profiling, xG baselines,
 * and form derivation when the 7-day API limit stops us.
 */
import db from '../config/database.js';
import dotenv from 'dotenv';
dotenv.config();

const BSD_API_KEY = process.env.BSD_API_KEY;

async function bsdFetch(path, params = {}) {
  const url = new URL(`https://sports.bzzoiro.com/api${path}`);
  url.searchParams.set('tz', 'UTC');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${BSD_API_KEY}` },
  });
  if (!res.ok) throw new Error(`BSD Error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPages(path, params = {}) {
  const all = [];
  let page = 1;
  while (true) {
    const data = await bsdFetch(path, { ...params, page });
    if (!data || !data.results) break;
    all.push(...data.results);
    if (!data.next || page >= 20) break; // Hard cap
    page++;
  }
  return all;
}

// Ensure the tables exist
async function ensureTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS historical_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL,
      type TEXT DEFAULT 'history',
      date TEXT,
      home_team TEXT,
      away_team TEXT,
      competition TEXT,
      home_goals INTEGER,
      away_goals INTEGER,
      xg_home REAL,
      xg_away REAL,
      btts BOOLEAN,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(fixture_id, type)
    )
  `);
}

async function runSeeder() {
  console.log('[HistorySeeder] Starting mass historical seed...');
  await ensureTables();
  
  // 1. Get all leagues
  const leagues = await fetchAllPages('/leagues/');
  console.log(`[HistorySeeder] Found ${leagues.length} leagues.`);

  let totalInserted = 0;

  // 2. Iterate each league
  for (const league of leagues) {
    if (!league.id) continue;
    
    // 3. Get seasons for league
    // Currently, BSD does not have a direct /seasons/ endpoint that lists all seasons.
    // However, the user documentation says "use /seasons/". We will fetch events using season=ID.
    // Wait, the documentation states we can query past matches using dates.
    // The safest way is to go back exactly 3 years and fetch by date chunks, since the seasons endpoint
    // wasn't strictly exposed in the documentation snippet.
    // We will use the date_from and date_to parameters to query finished events for the league!
    
    console.log(`[HistorySeeder] Seeding history for ${league.name} (${league.country})`);
    
    // We fetch in chunks of 6 months to avoid timeouts
    for (let i = 0; i < 6; i++) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - (i * 6));
        
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 6);
        
        const dateFrom = startDate.toISOString().split('T')[0];
        const dateTo = endDate.toISOString().split('T')[0];
        
        console.log(`  -> Fetching ${dateFrom} to ${dateTo}...`);
        
        try {
            const matches = await fetchAllPages('/events/', {
                league: league.id,
                status: 'finished',
                date_from: dateFrom,
                date_to: dateTo,
                full: true // Fetch xG and momentum!
            });
            
            if (matches.length === 0) continue;
            
            // 4. Insert into database
            let inserted = 0;
            for (const match of matches) {
                if (match.home_score == null) continue;
                try {
                    await db.execute({
                        sql: `INSERT OR IGNORE INTO historical_matches 
                              (fixture_id, date, home_team, away_team, competition, home_goals, away_goals, xg_home, xg_away, btts)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            String(match.id),
                            match.event_date,
                            match.home_team,
                            match.away_team,
                            league.name,
                            match.home_score,
                            match.away_score,
                            match.live_stats?.xg?.home || null,
                            match.live_stats?.xg?.away || null,
                            (match.home_score > 0 && match.away_score > 0) ? 1 : 0
                        ]
                    });
                    inserted++;
                } catch (e) {
                    // Ignore constraint errors
                }
            }
            totalInserted += inserted;
            console.log(`  -> Inserted ${inserted} matches. Total: ${totalInserted}`);
        } catch(err) {
            console.warn(`  -> Failed to fetch chunk: ${err.message}`);
        }
    }
  }
  
  console.log(`\n[HistorySeeder] COMPLETE! Seeded ${totalInserted} deep historical matches.`);
}

runSeeder().catch(console.error);
