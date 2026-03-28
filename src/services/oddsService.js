import db from '../config/database.js';

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Map tournament names (lowercase) to Odds API sport keys
const LEAGUE_MAP = {
  // England
  'premier league': 'soccer_epl',
  'efl championship': 'soccer_efl_champ',
  'championship': 'soccer_efl_champ',
  'efl league one': 'soccer_england_league1',
  'league one': 'soccer_england_league1',
  'efl league two': 'soccer_england_league2',
  'league two': 'soccer_england_league2',
  'fa cup': 'soccer_fa_cup',
  'efl cup': 'soccer_league_cup',
  'league cup': 'soccer_league_cup',
  // Spain
  'la liga': 'soccer_spain_la_liga',
  'laliga': 'soccer_spain_la_liga',
  'segunda division': 'soccer_spain_segunda_division',
  'copa del rey': 'soccer_spain_copa_del_rey',
  // Germany
  'bundesliga': 'soccer_germany_bundesliga',
  '1. bundesliga': 'soccer_germany_bundesliga',
  '2. bundesliga': 'soccer_germany_bundesliga2',
  'dfb pokal': 'soccer_germany_dfb_pokal',
  // Italy
  'serie a': 'soccer_italy_serie_a',
  'serie b': 'soccer_italy_serie_b',
  'coppa italia': 'soccer_italy_coppa_italia',
  // France
  'ligue 1': 'soccer_france_ligue_one',
  'ligue 2': 'soccer_france_ligue_two',
  'coupe de france': 'soccer_france_coupe_de_france',
  // Netherlands
  'eredivisie': 'soccer_netherlands_eredivisie',
  'eerste divisie': 'soccer_netherlands_eerste_divisie',
  // Scotland
  'scottish premiership': 'soccer_scotland_premiership',
  'spfl premiership': 'soccer_scotland_premiership',
  // Portugal
  'primeira liga': 'soccer_portugal_primeira_liga',
  'liga nos': 'soccer_portugal_primeira_liga',
  // Belgium
  'jupiler pro league': 'soccer_belgium_first_div_a',
  'pro league': 'soccer_belgium_first_div_a',
  'first division a': 'soccer_belgium_first_div_a',
  // Turkey
  'süper lig': 'soccer_turkey_super_league',
  'super lig': 'soccer_turkey_super_league',
  // Greece
  'super league': 'soccer_greece_super_league',
  'super league 1': 'soccer_greece_super_league',
  // USA
  'mls': 'soccer_usa_mls',
  'major league soccer': 'soccer_usa_mls',
  // Brazil
  'brasileirao': 'soccer_brazil_campeonato',
  'serie a brasileira': 'soccer_brazil_campeonato',
  'brasileirão série a': 'soccer_brazil_campeonato',
  // Argentina
  'primera division': 'soccer_argentina_primera_division',
  'liga profesional': 'soccer_argentina_primera_division',
  // Australia
  'a-league': 'soccer_australia_aleague',
  // Mexico
  'liga mx': 'soccer_mexico_ligamx',
  'ligamx': 'soccer_mexico_ligamx',
  // UEFA
  'champions league': 'soccer_uefa_champs_league',
  'uefa champions league': 'soccer_uefa_champs_league',
  'europa league': 'soccer_uefa_europa_league',
  'uefa europa league': 'soccer_uefa_europa_league',
  'conference league': 'soccer_uefa_conference_league',
  'europa conference league': 'soccer_uefa_conference_league',
  // Austria
  'bundesliga austria': 'soccer_austria_bundesliga',
  'austrian bundesliga': 'soccer_austria_bundesliga',
  // Switzerland
  'super league switzerland': 'soccer_switzerland_superleague',
  'swiss super league': 'soccer_switzerland_superleague',
  // Denmark
  'superliga': 'soccer_denmark_superliga',
  'danish superliga': 'soccer_denmark_superliga',
  // Norway
  'eliteserien': 'soccer_norway_eliteserien',
  // Sweden
  'allsvenskan': 'soccer_sweden_allsvenskan',
  // Finland
  'veikkausliiga': 'soccer_finland_veikkausliiga',
  // Czech Republic
  'czech liga': 'soccer_czech_liga',
  'fortuna liga': 'soccer_czech_liga',
  // Poland
  'ekstraklasa': 'soccer_poland_ekstraklasa',
  // Romania
  'liga i': 'soccer_romania_liga_i',
  // Russia
  'premier league russia': 'soccer_russia_premier_league',
  // Ukraine
  'premier league ukraine': 'soccer_ukraine_premier_league',
  // Japan
  'j1 league': 'soccer_japan_j_league',
  'j league': 'soccer_japan_j_league',
  // South Korea
  'k league 1': 'soccer_south_korea_kleague1',
  // China
  'chinese super league': 'soccer_china_superleague',
};

async function ensureOddsTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS league_odds_cache (
        sport_key TEXT PRIMARY KEY,
        events_json TEXT NOT NULL,
        fetched_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fixture_odds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fixture_id TEXT NOT NULL,
        home REAL,
        draw REAL,
        away REAL,
        over_1_5 REAL,
        under_1_5 REAL,
        over_2_5 REAL,
        under_2_5 REAL,
        over_3_5 REAL,
        under_3_5 REAL,
        btts_yes REAL,
        btts_no REAL,
        over_under TEXT,
        fetched_at TEXT DEFAULT (datetime('now')),
        UNIQUE(fixture_id)
      )
    `);
    // Add columns if they don't exist (for existing tables)
    const cols = ['over_1_5','under_1_5','over_2_5','under_2_5','over_3_5','under_3_5'];
    for (const col of cols) {
      try { await db.execute(`ALTER TABLE fixture_odds ADD COLUMN ${col} REAL`); } catch {}
    }
  } catch (err) {
    console.error('[OddsService] Table init error:', err.message);
  }
}

function getSportKey(tournamentName) {
  if (!tournamentName) return null;
  const key = String(tournamentName).toLowerCase().trim();
  // Direct match
  if (LEAGUE_MAP[key]) return LEAGUE_MAP[key];
  // Partial match
  for (const [mapKey, sportKey] of Object.entries(LEAGUE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return sportKey;
  }
  return null;
}

function normalizeTeamName(name) {
  return String(name || '').toLowerCase()
    .replace(/\bfc\b/g, '').replace(/\baf c\b/g, '').replace(/\bsc\b/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function teamNamesMatch(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return true;
  // Check if either contains the other (for shortened names)
  if (na.length > 3 && nb.includes(na)) return true;
  if (nb.length > 3 && na.includes(nb)) return true;
  // Check first word match
  const wa = na.split(' ')[0];
  const wb = nb.split(' ')[0];
  if (wa.length > 4 && wa === wb) return true;
  return false;
}

async function fetchLeagueOdds(sportKey) {
  if (!ODDS_API_KEY) return null;
  
  // Check league-level cache first (shared across all fixtures in same league)
  try {
    const cached = await db.execute({
      sql: `SELECT events_json FROM league_odds_cache WHERE sport_key = ? AND fetched_at > datetime('now', '-4 hours') LIMIT 1`,
      args: [sportKey],
    });
    if (cached.rows?.[0]?.events_json) {
      const events = JSON.parse(cached.rows[0].events_json);
      console.log(`[OddsService] League cache HIT for ${sportKey} (${events.length} events)`);
      return events;
    }
  } catch {}

  // Cache miss — fetch from API
  try {
    const url = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[OddsService] API error ${res.status} for ${sportKey}`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data)) return null;

    // Store in league cache
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO league_odds_cache (sport_key, events_json, fetched_at) VALUES (?, ?, datetime('now'))`,
        args: [sportKey, JSON.stringify(data)],
      });
      console.log(`[OddsService] League cache STORED for ${sportKey} (${data.length} events)`);
    } catch (err) {
      console.error('[OddsService] League cache write error:', err.message);
    }

    return data;
  } catch (err) {
    console.error('[OddsService] Fetch error:', err.message);
    return null;
  }
}

function parseOddsFromEvent(event) {
  const result = { home: null, draw: null, away: null, over_1_5: null, under_1_5: null, over_2_5: null, under_2_5: null, over_3_5: null, under_3_5: null };
  
  if (!event || !Array.isArray(event.bookmakers) || !event.bookmakers.length) return result;
  
  // Use first available bookmaker
  const bookmaker = event.bookmakers[0];
  
  for (const market of (bookmaker.markets || [])) {
    if (market.key === 'h2h') {
      for (const outcome of (market.outcomes || [])) {
        const name = String(outcome.name || '').toLowerCase();
        if (name === 'draw') result.draw = outcome.price;
        else if (teamNamesMatch(outcome.name, event.home_team)) result.home = outcome.price;
        else if (teamNamesMatch(outcome.name, event.away_team)) result.away = outcome.price;
      }
    } else if (market.key === 'totals') {
      for (const outcome of (market.outcomes || [])) {
        const name = String(outcome.name || '').toLowerCase();
        const point = outcome.point;
        if (name === 'over' && point === 1.5) result.over_1_5 = outcome.price;
        if (name === 'under' && point === 1.5) result.under_1_5 = outcome.price;
        if (name === 'over' && point === 2.5) result.over_2_5 = outcome.price;
        if (name === 'under' && point === 2.5) result.under_2_5 = outcome.price;
        if (name === 'over' && point === 3.5) result.over_3_5 = outcome.price;
        if (name === 'under' && point === 3.5) result.under_3_5 = outcome.price;
      }
    }
  }
  
  return result;
}

export async function fetchAndCacheOddsForFixture(fixtureId, homeTeam, awayTeam, tournamentName) {
  if (!ODDS_API_KEY) {
    // Log once per process start, not every call
    if (!globalThis.__oddsKeyWarned) {
      console.warn('[OddsService] ODDS_API_KEY not set. Odds features disabled. Set it in Render dashboard.');
      globalThis.__oddsKeyWarned = true;
    }
    return null;
  }
  
  await ensureOddsTable();
  
  // Check if we have fresh cached odds for this fixture
  try {
    const cached = await db.execute({
      sql: `SELECT * FROM fixture_odds WHERE fixture_id = ? AND fetched_at > datetime('now', '-4 hours') LIMIT 1`,
      args: [String(fixtureId)],
    });
    if (cached.rows?.[0]) {
      const r = cached.rows[0];
      return {
        home: r.home, draw: r.draw, away: r.away,
        over_1_5: r.over_1_5, under_1_5: r.under_1_5,
        over_2_5: r.over_2_5, under_2_5: r.under_2_5,
        over_3_5: r.over_3_5, under_3_5: r.under_3_5,
      };
    }
  } catch {}
  
  const sportKey = getSportKey(tournamentName);
  if (!sportKey) return null;
  
  const events = await fetchLeagueOdds(sportKey);
  if (!events) return null;
  
  // Find matching event
  let matchedEvent = null;
  for (const event of events) {
    if (teamNamesMatch(event.home_team, homeTeam) && teamNamesMatch(event.away_team, awayTeam)) {
      matchedEvent = event;
      break;
    }
  }
  
  if (!matchedEvent) return null;
  
  const odds = parseOddsFromEvent(matchedEvent);
  const overUnder = JSON.stringify({ over_2_5: odds.over_2_5, under_2_5: odds.under_2_5, over_1_5: odds.over_1_5, under_1_5: odds.under_1_5, over_3_5: odds.over_3_5, under_3_5: odds.under_3_5 });
  
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO fixture_odds (fixture_id, home, draw, away, over_1_5, under_1_5, over_2_5, under_2_5, over_3_5, under_3_5, btts_yes, btts_no, over_under, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, datetime('now'))`,
      args: [String(fixtureId), odds.home, odds.draw, odds.away, odds.over_1_5, odds.under_1_5, odds.over_2_5, odds.under_2_5, odds.over_3_5, odds.under_3_5, overUnder],
    });
  } catch (err) {
    console.error('[OddsService] Cache write error:', err.message);
  }
  
  return odds;
}
