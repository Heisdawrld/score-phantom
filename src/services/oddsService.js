/**
 * oddsService.js — Odds-API.io integration
 *
 * API: https://api.odds-api.io/v3
 * Auth: apiKey query param
 * Bookmakers: SportyBet + Bet365 (user-configured)
 * Rate limit: 100 calls/hr
 *
 * Strategy:
 *   1. Cache league events for 6 hours (one call per league per session)
 *   2. Cache fixture-level odds for 4 hours
 *   3. Fuzzy-match team names from LiveScore vs odds-api event names
 *   4. Parse ML (1X2), Totals (over/under), BTTS into our internal format
 */

import db from '../config/database.js';

const ODDS_API_KEY  = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.odds-api.io/v3';
const BOOKMAKERS    = 'SportyBet,Bet365';   // configurable

// ── Cache TTLs ────────────────────────────────────────────────────────────────
const LEAGUE_CACHE_HOURS   = 6;   // how long to cache the full league event list
const FIXTURE_CACHE_HOURS  = 4;   // how long to cache per-fixture odds

// ── League slug map (LiveScore tournament name → odds-api.io league slug) ────
// Slugs confirmed from /v3/leagues endpoint
const LEAGUE_SLUG_MAP = {
  // England
  'premier league':            'england-premier-league',
  'efl championship':          'england-championship',
  'championship':              'england-championship',
  'efl league one':            'england-league-one',
  'league one':                'england-league-one',
  'efl league two':            'england-league-two',
  'league two':                'england-league-two',
  'fa cup':                    'england-fa-cup',
  'efl cup':                   'england-league-cup',
  'league cup':                'england-league-cup',
  // Spain
  'la liga':                   'spain-la-liga',
  'laliga':                    'spain-la-liga',
  'segunda division':          'spain-segunda-division',
  'copa del rey':              'spain-copa-del-rey',
  // Germany
  'bundesliga':                'germany-bundesliga',
  '1. bundesliga':             'germany-bundesliga',
  '2. bundesliga':             'germany-2-bundesliga',
  'dfb pokal':                 'germany-dfb-pokal',
  // Italy
  'serie a':                   'italy-serie-a',
  'serie b':                   'italy-serie-b',
  'coppa italia':              'italy-coppa-italia',
  // France
  'ligue 1':                   'france-ligue-1',
  'ligue 2':                   'france-ligue-2',
  // Netherlands
  'eredivisie':                'netherlands-eredivisie',
  // Portugal
  'primeira liga':             'portugal-primeira-liga',
  'liga nos':                  'portugal-primeira-liga',
  // Belgium
  'jupiler pro league':        'belgium-jupiler-pro-league',
  'pro league':                'belgium-jupiler-pro-league',
  // Turkey
  'süper lig':                 'turkey-super-lig',
  'super lig':                 'turkey-super-lig',
  // Scotland
  'scottish premiership':      'scotland-premiership',
  'spfl premiership':          'scotland-premiership',
  // Greece
  'super league 1':            'greece-super-league',
  // USA
  'mls':                       'usa-mls',
  'major league soccer':       'usa-mls',
  // Brazil
  'brasileirao':               'brazil-serie-a',
  'brasileirão série a':       'brazil-serie-a',
  // Argentina
  'liga profesional':          'argentina-liga-profesional',
  'primera division':          'argentina-primera-division',
  // Mexico
  'liga mx':                   'mexico-liga-mx',
  // Australia
  'a-league':                  'australia-a-league',
  // Nigeria
  'npfl':                      'nigeria-npfl',
  'nigeria professional football league': 'nigeria-npfl',
  // South Africa
  'dstv premiership':          'south-africa-premiership',
  // UEFA
  'champions league':          'international-clubs-uefa-champions-league',
  'uefa champions league':     'international-clubs-uefa-champions-league',
  'europa league':             'international-clubs-uefa-europa-league',
  'uefa europa league':        'international-clubs-uefa-europa-league',
  'conference league':         'international-clubs-uefa-conference-league',
};

// ── DB setup ──────────────────────────────────────────────────────────────────
async function ensureTables() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS odds_league_cache (
        league_slug TEXT PRIMARY KEY,
        events_json TEXT NOT NULL,
        fetched_at  TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fixture_odds (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fixture_id  TEXT NOT NULL,
        home        REAL,
        draw        REAL,
        away        REAL,
        over_1_5    REAL,
        under_1_5   REAL,
        over_2_5    REAL,
        under_2_5   REAL,
        over_3_5    REAL,
        under_3_5   REAL,
        btts_yes    REAL,
        btts_no     REAL,
        over_under  TEXT,
        bookmaker   TEXT DEFAULT 'SportyBet',
        fetched_at  TEXT DEFAULT (datetime('now')),
        UNIQUE(fixture_id)
      )
    `);
    // add bookmaker col if missing
    try { await db.execute(`ALTER TABLE fixture_odds ADD COLUMN bookmaker TEXT DEFAULT 'SportyBet'`); } catch {}
    // Ensure over/under cols exist for older tables
    for (const col of ['over_1_5','under_1_5','over_2_5','under_2_5','over_3_5','under_3_5','btts_yes','btts_no']) {
      try { await db.execute(`ALTER TABLE fixture_odds ADD COLUMN ${col} REAL`); } catch {}
    }
  } catch (err) {
    console.error('[OddsService] Table init error:', err.message);
  }
}
ensureTables();

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalize(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bfc\b|\baf c\b|\bsc\b|\bac\b|\bif\b|\bcf\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.length > 4 && nb.includes(na)) return true;
  if (nb.length > 4 && na.includes(nb)) return true;
  // first meaningful word match (≥5 chars)
  const wa = na.split(' ').find(w => w.length >= 5);
  const wb = nb.split(' ').find(w => w.length >= 5);
  if (wa && wb && wa === wb) return true;
  return false;
}

function getLeagueSlug(tournamentName) {
  if (!tournamentName) return null;
  const key = String(tournamentName).toLowerCase().trim();
  if (LEAGUE_SLUG_MAP[key]) return LEAGUE_SLUG_MAP[key];
  // partial match
  for (const [mapKey, slug] of Object.entries(LEAGUE_SLUG_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return slug;
  }
  return null;
}

// ── Parse odds from odds-api.io bookmaker market array ───────────────────────
function parseBookmakerOdds(bookmakerMarkets) {
  const result = {
    home: null, draw: null, away: null,
    over_1_5: null, under_1_5: null,
    over_2_5: null, under_2_5: null,
    over_3_5: null, under_3_5: null,
    btts_yes: null, btts_no: null,
  };

  if (!Array.isArray(bookmakerMarkets)) return result;

  for (const market of bookmakerMarkets) {
    const name = String(market.name || '').toLowerCase();
    const odds = Array.isArray(market.odds) ? market.odds : [];

    // 1X2 / ML
    if (name === 'ml' || name === '1x2' || name === 'match result') {
      const row = odds[0] || {};
      if (row.home) result.home = parseFloat(row.home);
      if (row.draw) result.draw = parseFloat(row.draw);
      if (row.away) result.away = parseFloat(row.away);
    }

    // Totals / Goals Over Under
    if (name === 'totals' || name === 'goals over/under' || name === 'total goals') {
      for (const row of odds) {
        const hdp = parseFloat(row.hdp);
        if (hdp === 1.5) {
          if (row.over)  result.over_1_5  = parseFloat(row.over);
          if (row.under) result.under_1_5 = parseFloat(row.under);
        }
        if (hdp === 2.5) {
          if (row.over)  result.over_2_5  = parseFloat(row.over);
          if (row.under) result.under_2_5 = parseFloat(row.under);
        }
        if (hdp === 3.5) {
          if (row.over)  result.over_3_5  = parseFloat(row.over);
          if (row.under) result.under_3_5 = parseFloat(row.under);
        }
      }
    }

    // BTTS
    if (name === 'both teams to score' || name === 'btts' || name === 'gg/ng') {
      const row = odds[0] || {};
      if (row.yes) result.btts_yes = parseFloat(row.yes);
      if (row.no)  result.btts_no  = parseFloat(row.no);
    }
  }

  return result;
}

// ── Fetch league event list (cached 6h) ───────────────────────────────────────
async function fetchLeagueEvents(leagueSlug) {
  if (!ODDS_API_KEY) return [];

  // Check DB cache
  try {
    const cached = await db.execute({
      sql: `SELECT events_json FROM odds_league_cache WHERE league_slug = ? AND fetched_at > datetime('now', '-${LEAGUE_CACHE_HOURS} hours') LIMIT 1`,
      args: [leagueSlug],
    });
    if (cached.rows?.[0]?.events_json) {
      console.log(`[OddsService] Cache HIT for league: ${leagueSlug}`);
      return JSON.parse(cached.rows[0].events_json);
    }
  } catch {}

  // Fetch from API
  try {
    const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${encodeURIComponent(leagueSlug)}&limit=100`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[OddsService] Events API error ${res.status} for league: ${leagueSlug}`);
      return [];
    }
    const data = await res.json();
    const events = Array.isArray(data) ? data : (data.data || []);

    // Filter to upcoming only for caching (pending/upcoming status)
    const relevant = events.filter(e => e.status === 'upcoming' || e.status === 'pending' || !e.status);

    // Store in cache
    await db.execute({
      sql: `INSERT OR REPLACE INTO odds_league_cache (league_slug, events_json, fetched_at) VALUES (?, ?, datetime('now'))`,
      args: [leagueSlug, JSON.stringify(relevant)],
    });
    console.log(`[OddsService] Fetched ${relevant.length} upcoming events for league: ${leagueSlug}`);
    return relevant;
  } catch (err) {
    console.error('[OddsService] fetchLeagueEvents error:', err.message);
    return [];
  }
}

// ── Fetch odds for a specific event ID ───────────────────────────────────────
async function fetchEventOdds(eventId) {
  if (!ODDS_API_KEY || !eventId) return null;

  try {
    const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${encodeURIComponent(BOOKMAKERS)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[OddsService] Odds API error ${res.status} for eventId: ${eventId}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[OddsService] fetchEventOdds error:', err.message);
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Fetch and cache odds for a fixture.
 * Returns { home, draw, away, over_1_5, under_1_5, over_2_5, under_2_5, over_3_5, under_3_5, btts_yes, btts_no }
 * or null if unavailable.
 */
export async function fetchAndCacheOddsForFixture(fixtureId, homeTeam, awayTeam, tournamentName) {
  if (!ODDS_API_KEY) {
    if (!globalThis.__oddsKeyWarned) {
      console.warn('[OddsService] ODDS_API_KEY not set. Odds features disabled.');
      globalThis.__oddsKeyWarned = true;
    }
    return null;
  }

  // 1. Check fixture-level cache first
  try {
    const cached = await db.execute({
      sql: `SELECT * FROM fixture_odds WHERE fixture_id = ? AND fetched_at > datetime('now', '-${FIXTURE_CACHE_HOURS} hours') LIMIT 1`,
      args: [String(fixtureId)],
    });
    if (cached.rows?.[0]) {
      const r = cached.rows[0];
      // Only return if we have at least 1X2 odds
      if (r.home) {
        return {
          home: r.home, draw: r.draw, away: r.away,
          over_1_5: r.over_1_5, under_1_5: r.under_1_5,
          over_2_5: r.over_2_5, under_2_5: r.under_2_5,
          over_3_5: r.over_3_5, under_3_5: r.under_3_5,
          btts_yes: r.btts_yes, btts_no: r.btts_no,
        };
      }
    }
  } catch {}

  // 2. Get league slug
  const leagueSlug = getLeagueSlug(tournamentName);
  if (!leagueSlug) {
    console.log(`[OddsService] No league slug for tournament: ${tournamentName}`);
    return null;
  }

  // 3. Fetch league events (cached 6h — cheap!)
  const events = await fetchLeagueEvents(leagueSlug);
  if (!events.length) return null;

  // 4. Fuzzy-match the fixture
  const matched = events.find(ev =>
    teamMatch(ev.home, homeTeam) && teamMatch(ev.away, awayTeam)
  );

  if (!matched) {
    console.log(`[OddsService] No match found for: ${homeTeam} vs ${awayTeam} in ${leagueSlug}`);
    return null;
  }

  console.log(`[OddsService] Matched event ${matched.id}: ${matched.home} vs ${matched.away}`);

  // 5. Fetch odds for this event (costs 1 API call)
  const oddsData = await fetchEventOdds(matched.id);
  if (!oddsData) return null;

  // 6. Parse — prefer SportyBet, fall back to Bet365
  const bookmakerData = oddsData.bookmakers || {};
  const sportyMarkets = bookmakerData['SportyBet'];
  const bet365Markets = bookmakerData['Bet365'];
  const markets = sportyMarkets || bet365Markets;
  const bookmakerUsed = sportyMarkets ? 'SportyBet' : (bet365Markets ? 'Bet365' : null);

  if (!markets) {
    console.log(`[OddsService] No bookmaker data returned for event ${matched.id}`);
    return null;
  }

  const odds = parseBookmakerOdds(markets);

  // 7. Store in DB cache
  const overUnder = JSON.stringify({
    over_2_5: odds.over_2_5, under_2_5: odds.under_2_5,
    over_1_5: odds.over_1_5, under_1_5: odds.under_1_5,
    over_3_5: odds.over_3_5, under_3_5: odds.under_3_5,
  });

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO fixture_odds
            (fixture_id, home, draw, away, over_1_5, under_1_5, over_2_5, under_2_5, over_3_5, under_3_5, btts_yes, btts_no, over_under, bookmaker, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        String(fixtureId),
        odds.home, odds.draw, odds.away,
        odds.over_1_5, odds.under_1_5,
        odds.over_2_5, odds.under_2_5,
        odds.over_3_5, odds.under_3_5,
        odds.btts_yes, odds.btts_no,
        overUnder,
        bookmakerUsed || 'SportyBet',
      ],
    });
    console.log(`[OddsService] Cached odds for fixture ${fixtureId} (${bookmakerUsed}) — 1X2: ${odds.home}/${odds.draw}/${odds.away} | Over2.5: ${odds.over_2_5} | BTTS: ${odds.btts_yes}`);
  } catch (err) {
    console.error('[OddsService] DB write error:', err.message);
  }

  return odds;
}
