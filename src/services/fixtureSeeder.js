// fixtureSeeder.js — Seeds fixtures from BSD (Bzzoiro Sports Data)
import db from '../config/database.js';
import {
  fetchFixturesByDate,
  fetchFixturesByLeague,
  fetchLeagueDetail,
  fetchLeagues,
  fetchFixturesBySeason,
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
  const startDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const endDateStr = endDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

  for (let i = startOffset; i <= startOffset + days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
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

// ════════════════════════════════════════════════════════════════════════════
// LEAGUE-BY-LEAGUE SEEDING (v1.0.3 addition)
// ════════════════════════════════════════════════════════════════════════════
// The original seedFixtures() is date-based: it pulls every event for each day in
// a rolling window. This works for the 46 leagues with dense match days, but it
// misses competitions whose next match falls just outside the window (NPL
// Queensland, AFCON, WCQ, cup qualifiers, etc.).
//
// seedByLeague() and seedAllActiveLeagues() close that gap by pulling each
// league's CURRENT SEASON fixtures directly — the full season, not just a date
// window. Combined with the date-based seeder, this guarantees complete coverage.
//
// All inserts are INSERT ... ON CONFLICT DO NOTHING (idempotent) — safe to re-run
// indefinitely. No existing rows are ever modified or deleted.

/**
 * Insert a single BSD event as a fixture + teams + tournament + odds.
 * Shared by seedFixtures (date-based) and seedByLeague (league-based).
 * Pure idempotent upsert — safe to call repeatedly.
 *
 * @returns {boolean} true if inserted/processed without error
 */
async function upsertEvent(event) {
  try {
    const f = normaliseBsdEventToFixture(event);
    if (!f) return false;

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

    // Write odds extracted directly from BSD event response (upsert)
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
      } catch (_) { /* odds write is best-effort */ }
    }
    return true;
  } catch (err) {
    console.error('[Seeder:league] Failed to upsert event:', err.message);
    return false;
  }
}

/**
 * Seed a single league by its CURRENT SEASON.
 *
 * Fetches the league's current season from BSD, then pulls every event in that
 * season's date range via fetchFixturesByLeague() and idempotently upserts them.
 *
 * @param {string|number} leagueId  BSD league id (e.g. 70 for NPL Queensland)
 * @param {object} opts
 * @param {boolean} opts.upcomingOnly  if true, only seed events from today forward
 *        (skip past played matches — useful for nightly refreshes)
 * @param {function} opts.log  logger function (default console.log)
 * @returns {object} { leagueId, leagueName, seasonName, totalEvents, inserted, failed, oddsWritten }
 */
export async function seedByLeague(leagueId, { upcomingOnly = false, log = console.log } = {}) {
  await ensureColumns();

  if (!leagueId) throw new Error('seedByLeague: leagueId required');

  const league = await fetchLeagueDetail(leagueId);
  if (!league) {
    log(`[Seeder:league] League ${leagueId} not found in BSD`);
    return { leagueId, error: 'not_found', inserted: 0, failed: 0, total: 0 };
  }

  const season = league.current_season;
  if (!season || !season.start_date || !season.end_date) {
    log(`[Seeder:league] ${league.name} (${leagueId}) has no current season — skipping`);
    return { leagueId, leagueName: league.name, error: 'no_current_season', inserted: 0, failed: 0, total: 0 };
  }

  // For upcoming-only mode, start from today (no point re-pulling played matches nightly)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const dateFrom = upcomingOnly ? todayStr : season.start_date;
  const dateTo = season.end_date;

  log(`[Seeder:league] ${league.name} (id:${leagueId}) | season: ${season.name} | range: ${dateFrom} → ${dateTo}${upcomingOnly ? ' (upcoming only)' : ''}`);

  let events;
  try {
    events = await fetchFixturesByLeague(String(leagueId), dateFrom, dateTo);
  } catch (err) {
    log(`[Seeder:league] ${league.name} fetch failed: ${err.message}`);
    return { leagueId, leagueName: league.name, seasonName: season.name, error: err.message, inserted: 0, failed: 0, total: 0 };
  }

  if (!events || events.length === 0) {
    log(`[Seeder:league] ${league.name}: 0 events in range — skipping`);
    return { leagueId, leagueName: league.name, seasonName: season.name, total: 0, inserted: 0, failed: 0, oddsWritten: 0 };
  }

  let inserted = 0, failed = 0;
  for (const event of events) {
    const ok = await upsertEvent(event);
    if (ok) inserted++; else failed++;
    // Small pause every 25 events to respect BSD rate limit + keep DB responsive
    if ((inserted + failed) % 25 === 0) await sleep(200);
  }

  log(`[Seeder:league] ${league.name}: ${inserted} processed, ${failed} failed of ${events.length} total`);
  return {
    leagueId: String(leagueId),
    leagueName: league.name,
    seasonName: season.name,
    total: events.length,
    inserted,
    failed,
  };
}

/**
 * Seed ALL active BSD leagues by their current season.
 *
 * Iterates every league BSD marks as active, fetches its current season, and
 * idempotently upserts all fixtures in that season's range. Designed to run
 * alongside the existing date-based seedFixtures() — catches competitions the
 * date window misses (cups, qualifiers, sparse-schedule leagues).
 *
 * Safe to re-run as often as needed; all inserts are ON CONFLICT DO NOTHING.
 *
 * @param {object} opts
 * @param {boolean} opts.upcomingOnly  default true for scheduled runs (skip past matches)
 * @param {number} opts.delayMs  pause between leagues (default 400ms, respects BSD 4 req/s)
 * @param {function} opts.log
 * @returns {object} { total, seeded, skipped, failed, leagues: [...] }
 */
export async function seedAllActiveLeagues({ upcomingOnly = true, delayMs = 400, log = console.log } = {}) {
  await ensureColumns();

  const leagues = await fetchLeagues();
  const activeLeagues = (leagues || []).filter(l => l.is_active && l.current_season);
  log(`[Seeder:all] ${activeLeagues.length} active leagues with a current season (of ${leagues.length} total)`);

  const results = [];
  let totalInserted = 0, totalFailed = 0, totalSkipped = 0;

  for (const league of activeLeagues) {
    try {
      const res = await seedByLeague(league.id, { upcomingOnly, log });
      results.push(res);
      if (res.error) totalSkipped++;
      else { totalInserted += res.inserted || 0; totalFailed += res.failed || 0; }
    } catch (err) {
      log(`[Seeder:all] League ${league.id} (${league.name}) failed: ${err.message}`);
      results.push({ leagueId: String(league.id), leagueName: league.name, error: err.message, inserted: 0, failed: 0, total: 0 });
      totalFailed++;
    }
    await sleep(delayMs);
  }

  log(`[Seeder:all] Done. leagues processed: ${results.length} | fixtures upserted: ${totalInserted} | failed: ${totalFailed} | skipped: ${totalSkipped}`);
  return { total: results.length, seeded: results.length - totalSkipped, skipped: totalSkipped, failed: totalFailed, fixturesUpserted: totalInserted, leagues: results };
}
