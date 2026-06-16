// fixtureSeeder.js — Seeds fixtures from BSD (Bzzoiro Sports Data)
import db from '../config/database.js';
import {
  fetchFixturesByDate,
  fetchFixturesByLeague,
  fetchLeagues,
  normaliseBsdEventToFixture,
  extractOddsFromEvent,
} from './bsd.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureColumns() {
  const info = await db.execute(`PRAGMA table_info('fixtures')`);
  const columns = new Set((info.rows || []).map((row) => row.name));
  const defs = [
    ['country_flag', `TEXT DEFAULT ''`],
    ['home_team_logo', `TEXT DEFAULT ''`],
    ['away_team_logo', `TEXT DEFAULT ''`],
    ['odds_home', `REAL`],
    ['odds_draw', `REAL`],
    ['odds_away', `REAL`],
    ['home_score', `INTEGER`],
    ['away_score', `INTEGER`],
    ['match_status', `TEXT DEFAULT 'NS'`],
    ['live_minute', `TEXT`],
  ];
  for (const [name, def] of defs) {
    if (!columns.has(name)) {
      await db.execute(`ALTER TABLE fixtures ADD COLUMN ${name} ${def}`);
    }
  }
}

function getAllowedLeagueIds() {
  return new Set(
    String(process.env.BSD_ALLOWED_LEAGUE_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function getAllowedLeagueNames() {
  return new Set(
    String(process.env.BSD_ALLOWED_LEAGUES || '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isLeagueAllowed(tournamentName, tournamentId, allowedNames, allowedIds) {
  // If NEITHER filter is set, allow everything
  if ((!allowedNames || allowedNames.size === 0) && (!allowedIds || allowedIds.size === 0)) return true;

  // Check by league ID first (most reliable — IDs never change)
  if (allowedIds && allowedIds.size > 0 && allowedIds.has(String(tournamentId))) return true;

  // Then check by exact name match
  const name = String(tournamentName || '').toLowerCase().trim();
  if (allowedNames && allowedNames.size > 0) {
    if (allowedNames.has(name)) return true;
    // Fuzzy fallback: check if any allowed name is a substring of the tournament name or vice versa
    for (const allowed of allowedNames) {
      if (name.includes(allowed) || allowed.includes(name)) return true;
    }
  }

  return false;
}

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

  const allowedNames = getAllowedLeagueNames();
  const allowedIds = getAllowedLeagueIds();
  if (allowedIds.size > 0) {
    log('[Seeder] BSD_ALLOWED_LEAGUE_IDS active — ' + allowedIds.size + ' IDs: ' + [...allowedIds].join(', '));
  }
  if (allowedNames.size > 0) {
    log('[Seeder] BSD_ALLOWED_LEAGUES active — ' + allowedNames.size + ' names');
  }
  if (allowedIds.size === 0 && allowedNames.size === 0) {
    log('[Seeder] No league filter set — seeding ALL leagues from BSD.');
  }

  const allBsdEvents = [];
  const seenEventIds = new Set();
  const now = new Date();

  // === Strategy 1: Date-based bulk fetch ===
  const startDate = new Date(now);
  startDate.setDate(now.getDate() + startOffset);
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + startOffset + days);
  const TZ = process.env.TIMEZONE || 'Africa/Lagos';
  const startDateStr = startDate.toLocaleDateString('en-CA', { timeZone: TZ });
  const endDateStr = endDate.toLocaleDateString('en-CA', { timeZone: TZ });

  for (let i = startOffset; i <= startOffset + days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const events = await fetchFixturesByDate(dateStr);
    for (const e of events) {
      const eid = String(e.id || '');
      if (eid && !seenEventIds.has(eid)) { seenEventIds.add(eid); allBsdEvents.push(e); }
    }
    log('[Seeder] ' + dateStr + ': ' + events.length + ' events from BSD');
    await sleep(400);
  }

  // === Strategy 2: Per-league fetch fallback ===
  // If the date-based fetch returned very few events, it means BSD's date index
  // is incomplete. Fall back to querying each league individually.
  if (allBsdEvents.length < 10) {
    log('[Seeder] ⚠ Only ' + allBsdEvents.length + ' events from date query — activating per-league fallback...');
    try {
      const leagues = await fetchLeagues();
      const leagueIds = allowedIds.size > 0
        ? [...allowedIds]
        : (leagues || []).map(l => String(l.id)).filter(Boolean);

      log('[Seeder] Scanning ' + leagueIds.length + ' leagues for fixtures (' + startDateStr + ' to ' + endDateStr + ')...');
      let leagueHits = 0;
      for (const lid of leagueIds) {
        try {
          const leagueEvents = await fetchFixturesByLeague(lid, startDateStr, endDateStr);
          let added = 0;
          for (const e of leagueEvents) {
            const eid = String(e.id || '');
            if (eid && !seenEventIds.has(eid)) { seenEventIds.add(eid); allBsdEvents.push(e); added++; }
          }
          if (added > 0) {
            leagueHits++;
            log('[Seeder]   League ' + lid + ': +' + added + ' new events');
          }
          await sleep(300);
        } catch (err) {
          log('[Seeder]   League ' + lid + ' failed: ' + err.message);
        }
      }
      log('[Seeder] Per-league fallback done: ' + leagueHits + ' leagues had events, total now ' + allBsdEvents.length);
    } catch (err) {
      log('[Seeder] Per-league fallback failed: ' + err.message);
    }
  }

  log('[Seeder] Total: ' + allBsdEvents.length + ' events. Normalising + inserting...');
  let inserted = 0, failed = 0, oddsWritten = 0, skippedByLeagueFilter = 0;
  const skippedLeagueNames = new Set();

  for (const event of allBsdEvents) {
      try {
        const f = normaliseBsdEventToFixture(event);
        if (!f) continue;

        if (!isLeagueAllowed(f.tournament_name, f.tournament_id, allowedNames, allowedIds)) {
          skippedByLeagueFilter++;
          skippedLeagueNames.add(`${f.tournament_name} (id:${f.tournament_id})`);
          continue;
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
            sql: `INSERT INTO fixture_odds
                    (fixture_id, home, draw, away, btts_yes, btts_no, over_under)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (fixture_id) DO UPDATE SET
                    home = EXCLUDED.home, draw = EXCLUDED.draw, away = EXCLUDED.away,
                    btts_yes = EXCLUDED.btts_yes, btts_no = EXCLUDED.btts_no,
                    over_under = EXCLUDED.over_under`,
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

  log(`[Seeder] Done! Inserted: ${inserted} | Odds written: ${oddsWritten} | Failed: ${failed} | Skipped by league filter: ${skippedByLeagueFilter}`);
  if (skippedLeagueNames.size > 0) {
    log(`[Seeder] Skipped leagues: ${[...skippedLeagueNames].join(', ')}`);
  }
  return { inserted, failed, oddsWritten, skippedByLeagueFilter, total: allBsdEvents.length };
}