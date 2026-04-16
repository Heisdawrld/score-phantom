import db from '../config/database.js';
import dotenv from 'dotenv';
import {
  fetchSeasons,
  fetchFixturesBySeason,
  normaliseBsdEventToFixture,
  extractOddsFromEvent,
} from '../services/bsd.js';

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

async function ensureColumns() {
  const cols = [
    'ALTER TABLE fixtures ADD COLUMN match_status TEXT DEFAULT \"NS\"',
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

async function getLeagueIdsFromDb(maxLeagues) {
  const r = await db.execute({
    sql: `SELECT DISTINCT tournament_id as league_id FROM fixtures WHERE tournament_id IS NOT NULL AND TRIM(tournament_id) != '' LIMIT ?`,
    args: [maxLeagues],
  });
  return (r.rows || []).map(x => x.league_id).filter(Boolean);
}

async function insertEvents(events) {
  let inserted = 0;
  let oddsWritten = 0;

  for (const event of events) {
    const f = normaliseBsdEventToFixture(event);
    if (!f) continue;

    await db.batch([
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
        sql: `INSERT OR IGNORE INTO fixtures
                (id, home_team_id, away_team_id, tournament_id,
                 home_team_name, away_team_name, tournament_name, category_name,
                 match_date, match_url, match_status, home_score, away_score,
                 home_team_logo, away_team_logo,
                 bsd_league_id, bsd_home_api_id, bsd_away_api_id, bsd_event_api_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }

  return { inserted, oddsWritten };
}

async function main() {
  await ensureColumns();

  const args = parseArgs(process.argv);
  const seasonsToBackfill = Math.max(1, parseInt(args.seasons || '3', 10));
  const maxLeagues = Math.max(1, parseInt(args.max_leagues || '20', 10));
  const leagueIds = args.league
    ? [String(args.league)]
    : (args.leagues ? String(args.leagues).split(',').map(s => s.trim()).filter(Boolean) : await getLeagueIdsFromDb(maxLeagues));

  const today = new Date().toISOString().slice(0, 10);
  let totalInserted = 0;
  let totalOdds = 0;

  for (const leagueId of leagueIds) {
    const seasons = await fetchSeasons({ leagueId });
    const completed = (seasons || [])
      .filter((s) => !s.is_current && s.end_date && String(s.end_date) < today)
      .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))
      .slice(0, seasonsToBackfill);

    if (completed.length === 0) continue;

    for (const season of completed) {
      const events = await fetchFixturesBySeason(season.id, { status: 'finished' });
      if (!events.length) continue;
      const { inserted, oddsWritten } = await insertEvents(events);
      totalInserted += inserted;
      totalOdds += oddsWritten;
      await sleep(300);
    }
  }

  console.log(`[HistorySeeder] Done. Inserted fixtures: ${totalInserted} | Odds written: ${totalOdds}`);
}

main().catch((e) => {
  console.error('[HistorySeeder] Failed:', e.message);
  process.exit(1);
});
