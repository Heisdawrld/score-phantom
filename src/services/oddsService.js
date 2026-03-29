/**
 * oddsService.js — Odds-API.io integration
 * Uses country + tournament name for accurate league slug matching
 * Bookmakers: SportyBet (primary) + Bet365 (fallback)
 */
import db from '../config/database.js';

const ODDS_API_KEY  = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.odds-api.io/v3';
const BOOKMAKERS    = 'SportyBet,Bet365';
const LEAGUE_CACHE_HOURS  = 6;
const FIXTURE_CACHE_HOURS = 4;

// ── Exact mapping: "Country|TournamentName" → odds-api.io slug ──────────────
// Built by cross-referencing live DB data with odds-api.io /v3/leagues endpoint
const EXACT_MAP = {
  // England
  'England|Premier League':           'england-premier-league',
  'England|Championship':             'england-championship',
  'England|League One':               'england-league-one',
  'England|League Two':               'england-league-two',
  'England|National League':          'england-national-league',
  'England|FA Cup':                   'england-fa-cup',
  'England|League Cup':               'england-league-cup',
  // Spain
  'Spain|La Liga':                    'spain-la-liga',
  'Spain|Segunda Division':           'spain-segunda-division',
  'Spain|Segunda B':                  'spain-segunda-federacion',
  'Spain|Copa del Rey':               'spain-copa-del-rey',
  // Germany
  'Germany|Bundesliga':               'germany-bundesliga',
  'Germany|2. Bundesliga':            'germany-2-bundesliga',
  'Germany|DFB Pokal':                'germany-dfb-pokal',
  // Italy
  'Italy|Serie A':                    'italy-serie-a',
  'Italy|Serie B':                    'italy-serie-b',
  'Italy|Serie C':                    'italy-coppa-italia-serie-c',
  'Italy|Coppa Italia':               'italy-coppa-italia',
  // France
  'France|Ligue 1':                   'france-ligue-1',
  'France|Ligue 2':                   'france-ligue-2',
  'France|National':                  'france-national',
  'France|National Football League 2':'france-national',
  // Netherlands
  'Netherlands|Eredivisie':           'netherlands-eredivisie',
  // Portugal
  'Portugal|Primeira Liga':           'portugal-primeira-liga',
  'Portugal|Liga Portugal':           'portugal-liga-portugal',
  'Portugal|Liga 3':                  'portugal-liga-3',
  'Portugal|Segunda Liga':            'portugal-liga-portugal-2',
  // Belgium
  'Belgium|Jupiler Pro League':       'belgium-pro-league',
  'Belgium|Pro League':               'belgium-pro-league',
  // Turkey
  'Turkey|Süper Lig':                 'turkey-super-lig',
  'Turkey|Super Lig':                 'turkey-super-lig',
  'Turkey|2nd Lig':                   'turkey-tff-1-lig',
  // Scotland
  'Scotland|Premiership':             'scotland-premiership',
  'Scotland|Championship':            'scotland-championship',
  // Greece
  'Greece|Super League':              'greece-super-league',
  'Greece|Super League 2':            'greece-super-league-2',
  // Switzerland
  'Switzerland|Super League':         'switzerland-super-league',
  'Switzerland|1. Liga Promotion':    'switzerland-promotion-league',
  // Austria
  'Austria|Bundesliga':               'austria-bundesliga',
  // Denmark
  'Denmark|Superliga':                'denmark-superliga',
  'Denmark|2nd Division':             'denmark-2nd-division',
  // Sweden
  'Sweden|Allsvenskan':               'sweden-allsvenskan',
  // Norway
  'Norway|Eliteserien':               'norway-eliteserien',
  // Poland
  'Poland|Ekstraklasa':               'poland-ekstraklasa',
  'Poland|2nd Liga':                  'poland-i-liga',
  // Russia
  'Russia|Premier League':            'russia-premier-league',
  'Russia|Football National League':  'russia-1-liga',
  'Russia|National Football League 2':'russia-1-liga',
  // Ukraine
  'Ukraine|Premier League':           'ukraine-premier-league',
  // Slovenia
  'Slovenia|2nd SNL':                 'slovenia-2-liga',
  // Croatia
  'Croatia|Prva HNL':                 'croatia-1-hnl',
  'Croatia|2nd League':               'croatia-2-hnl',
  // Czech Republic
  'Czech Republic|Fortuna Liga':      'czechia-1-liga',
  'Czech Republic|1. Liga':           'czechia-1-liga',
  // Hungary
  'Hungary|OTP Bank Liga':            'hungary-otp-bank-liga',
  // Romania
  'Romania|Liga I':                   'romania-liga-i',
  // Bulgaria
  'Bulgaria|First League':            'bulgaria-first-league',
  'Bulgaria|Second Professional League': 'bulgaria-second-professional-league',
  // Serbia
  'Serbia|Super Liga':                'serbia-super-liga',
  // Bosnia
  'Bosnia and Herzegovina|Premijer Liga': 'bosnia-&-herzegovina-premijer-liga',
  // UEFA
  'UEFA|Champions League':            'international-clubs-uefa-champions-league',
  'UEFA|Europa League':               'international-clubs-uefa-europa-league',
  'UEFA|Conference League':           'international-clubs-uefa-conference-league',
  'International|Champions League':   'international-clubs-uefa-champions-league',
  'International|Europa League':      'international-clubs-uefa-europa-league',
  // South America
  'Argentina|Liga Profesional':       'argentina-liga-profesional',
  'Argentina|Primera Division':       'argentina-liga-profesional',
  'Argentina|Primera B Metropolitana':'argentina-primera-b',
  'Argentina|Primera Nacional':       'argentina-primera-nacional',
  'Argentina|Primera B':              'argentina-primera-b',
  'Argentina|Copa Argentina':         'argentina-copa-argentina',
  'Argentina|Torneo Federal A':       'argentina-torneo-federal-a',
  'Brazil|Brasileirao':               'brazil-brasileiro-serie-a',
  'Brazil|Serie A':                   'brazil-brasileiro-serie-a',
  'Brazil|Série A':                   'brazil-brasileiro-serie-a',
  'Brazil|Serie B':                   'brazil-brasileiro-serie-b',
  'Brazil|Serie C':                   'brazil-brasileiro-serie-c',
  'Brazil|Copa do Nordeste':          'brazil-copa-do-nordeste',
  'Uruguay|Primera Division':         'uruguay-primera-division',
  'Colombia|Primera A':               'colombia-primera-a-clausura',
  'Chile|Primera B':                  'chile-primera-b',
  'Paraguay|Division Profesional':    'paraguay-division-de-honor-apertura',
  // North/Central America
  'USA|MLS':                          'usa-mls',
  'USA|USL Championship':             'usa-usl-championship',
  'USA|USL League One':               'usa-usl-league-one',
  'Mexico|Liga MX':                   'mexico-liga-mx-clausura',
  'Mexico|Liga de Expansión MX':      'mexico-liga-de-expansion-mx-clausura',
  'Guatemala|Liga Nacional':          'guatemala-liga-nacional-clausura',
  'Panama|LPF':                       'panama-liga-panamena-de-futbol-clausura',
  'Trinidad and Tobago|TT Premier League': 'trinidad-and-tobago-tt-premier-league',
  // Asia
  'Japan|J. League':                  'japan-jleague',
  'Japan|J. League 2':                'japan-jleague-2',
  'Republic of Korea|K-League 1':     'republic-of-korea-k-league-1',
  'Republic of Korea|K-League 2':     'republic-of-korea-k-league-2',
  'Republic of Korea|K3 League':      'republic-of-korea-k3-league',
  'Iran|Azadegan League':             'iran-azadegan-league',
  'Philippines|PFL':                  'philippines-philippines-footb-league',
  // Australia
  'Australia|A-League':               'australia-a-league',
  'Australia|Queensland NPL':         'australia-queensland-npl',
  'Australia|New South Wales':        'australia-nsw-npl-1',
  // Africa
  'Nigeria|NPFL':                     'nigeria-premier-league',
  'Nigeria|Nigerian Professional Football League': 'nigeria-premier-league',
  'Ghana|Premier League':             'ghana-premier-league',
  'Ghana|Division One':               'ghana-division-one',
  'Cameroon|Elite ONE':               'cameroon-elite-one',
  'Kenya|Super League':               'kenya-super-league',
  // Other
  'Iceland|Cup':                      'iceland-cup',
  'Wales|Welsh Premier League':       'wales-cymru-premier',
  'Denmark|2nd Division':             'denmark-2nd-division',
};

// ── Fallback fuzzy map by tournament name only ──────────────────────────────
// Used when exact country match fails
const FUZZY_MAP = {
  'champions league':   'international-clubs-uefa-champions-league',
  'europa league':      'international-clubs-uefa-europa-league',
  'conference league':  'international-clubs-uefa-conference-league',
  'premier league':     'england-premier-league',
  'la liga':            'spain-la-liga',
  'bundesliga':         'germany-bundesliga',
  'serie a':            'italy-serie-a',
  'ligue 1':            'france-ligue-1',
  'eredivisie':         'netherlands-eredivisie',
};

// ── DB tables ───────────────────────────────────────────────────────────────
async function ensureTables() {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS odds_league_cache (league_slug TEXT PRIMARY KEY, events_json TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
    await db.execute(`CREATE TABLE IF NOT EXISTS fixture_odds (id INTEGER PRIMARY KEY AUTOINCREMENT, fixture_id TEXT NOT NULL UNIQUE, home REAL, draw REAL, away REAL, over_1_5 REAL, under_1_5 REAL, over_2_5 REAL, under_2_5 REAL, over_3_5 REAL, under_3_5 REAL, btts_yes REAL, btts_no REAL, over_under TEXT, bookmaker TEXT DEFAULT 'SportyBet', fetched_at TEXT DEFAULT (datetime('now')))`);
    for (const col of ['over_1_5','under_1_5','over_2_5','under_2_5','over_3_5','under_3_5','btts_yes','btts_no','bookmaker']) {
      try { await db.execute(`ALTER TABLE fixture_odds ADD COLUMN ${col} ${col==='bookmaker'?"TEXT DEFAULT 'SportyBet'":'REAL'}`); } catch {}
    }
  } catch (err) { console.error('[OddsService] Table init:', err.message); }
}
ensureTables();

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalize(name) {
  return String(name||'').toLowerCase().replace(/\bfc\b|\baf c\b|\bsc\b|\bac\b|\bcf\b/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}

function teamMatch(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return true;
  if (na.length > 4 && nb.includes(na)) return true;
  if (nb.length > 4 && na.includes(nb)) return true;
  const wa = na.split(' ').find(w => w.length >= 5);
  const wb = nb.split(' ').find(w => w.length >= 5);
  if (wa && wb && wa === wb) return true;
  return false;
}

function getLeagueSlug(tournamentName, countryName) {
  if (!tournamentName) return null;
  // Try exact country+tournament match first
  const exactKey = `${countryName||''}|${tournamentName}`;
  if (EXACT_MAP[exactKey]) return EXACT_MAP[exactKey];
  // Try without country
  const nameOnly = Object.entries(EXACT_MAP).find(([k]) => k.split('|')[1] === tournamentName);
  if (nameOnly) return nameOnly[1];
  // Fuzzy fallback for top leagues only
  const lower = tournamentName.toLowerCase();
  for (const [key, slug] of Object.entries(FUZZY_MAP)) {
    if (lower.includes(key)) return slug;
  }
  return null;
}

function parseBookmakerOdds(markets) {
  const r = { home:null,draw:null,away:null,over_1_5:null,under_1_5:null,over_2_5:null,under_2_5:null,over_3_5:null,under_3_5:null,btts_yes:null,btts_no:null };
  if (!Array.isArray(markets)) return r;
  for (const market of markets) {
    const name = String(market.name||'').toLowerCase();
    const odds = Array.isArray(market.odds) ? market.odds : [];
    if (name==='ml'||name==='1x2'||name==='match result') {
      const row=odds[0]||{};
      if (row.home) r.home=parseFloat(row.home);
      if (row.draw) r.draw=parseFloat(row.draw);
      if (row.away) r.away=parseFloat(row.away);
    }
    if (name==='totals'||name==='goals over/under'||name==='total goals') {
      for (const row of odds) {
        const hdp=parseFloat(row.hdp);
        if (hdp===1.5){if(row.over)r.over_1_5=parseFloat(row.over);if(row.under)r.under_1_5=parseFloat(row.under);}
        if (hdp===2.5){if(row.over)r.over_2_5=parseFloat(row.over);if(row.under)r.under_2_5=parseFloat(row.under);}
        if (hdp===3.5){if(row.over)r.over_3_5=parseFloat(row.over);if(row.under)r.under_3_5=parseFloat(row.under);}
      }
    }
    if (name==='both teams to score'||name==='btts'||name==='gg/ng') {
      const row=odds[0]||{};
      if(row.yes)r.btts_yes=parseFloat(row.yes);
      if(row.no)r.btts_no=parseFloat(row.no);
    }
  }
  return r;
}

async function fetchLeagueEvents(leagueSlug) {
  if (!ODDS_API_KEY) return [];
  try {
    const cached = await db.execute({ sql:`SELECT events_json FROM odds_league_cache WHERE league_slug=? AND fetched_at>datetime('now','-${LEAGUE_CACHE_HOURS} hours') LIMIT 1`, args:[leagueSlug] });
    if (cached.rows?.[0]?.events_json) { console.log(`[OddsService] Cache HIT: ${leagueSlug}`); return JSON.parse(cached.rows[0].events_json); }
  } catch {}
  try {
    const url=`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${encodeURIComponent(leagueSlug)}&limit=100`;
    const res=await fetch(url);
    if (!res.ok) { console.error(`[OddsService] Events ${res.status} for ${leagueSlug}`); return []; }
    const data=await res.json();
    const events=(Array.isArray(data)?data:(data.data||[])).filter(e=>e.status==='upcoming'||e.status==='pending'||!e.status);
    await db.execute({ sql:`INSERT OR REPLACE INTO odds_league_cache (league_slug,events_json,fetched_at) VALUES (?,?,datetime('now'))`, args:[leagueSlug,JSON.stringify(events)] });
    console.log(`[OddsService] Fetched ${events.length} events for ${leagueSlug}`);
    return events;
  } catch (err) { console.error('[OddsService] fetchLeagueEvents:', err.message); return []; }
}

async function fetchEventOdds(eventId) {
  if (!ODDS_API_KEY||!eventId) return null;
  try {
    const url=`${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${encodeURIComponent(BOOKMAKERS)}`;
    const res=await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchAndCacheOddsForFixture(fixtureId, homeTeam, awayTeam, tournamentName, countryName) {
  if (!ODDS_API_KEY) {
    if (!globalThis.__oddsKeyWarned) { console.warn('[OddsService] ODDS_API_KEY not set'); globalThis.__oddsKeyWarned=true; }
    return null;
  }
  // Check fixture cache
  try {
    const cached=await db.execute({ sql:`SELECT * FROM fixture_odds WHERE fixture_id=? AND fetched_at>datetime('now','-${FIXTURE_CACHE_HOURS} hours') LIMIT 1`, args:[String(fixtureId)] });
    if (cached.rows?.[0]?.home) {
      const r=cached.rows[0];
      return {home:r.home,draw:r.draw,away:r.away,over_1_5:r.over_1_5,under_1_5:r.under_1_5,over_2_5:r.over_2_5,under_2_5:r.under_2_5,over_3_5:r.over_3_5,under_3_5:r.under_3_5,btts_yes:r.btts_yes,btts_no:r.btts_no};
    }
  } catch {}

  const leagueSlug=getLeagueSlug(tournamentName, countryName);
  if (!leagueSlug) { console.log(`[OddsService] No slug for: ${countryName}|${tournamentName}`); return null; }

  const events=await fetchLeagueEvents(leagueSlug);
  if (!events.length) return null;

  const matched=events.find(ev=>teamMatch(ev.home,homeTeam)&&teamMatch(ev.away,awayTeam));
  if (!matched) { console.log(`[OddsService] No match: ${homeTeam} vs ${awayTeam} in ${leagueSlug}`); return null; }

  console.log(`[OddsService] Matched ${matched.id}: ${matched.home} vs ${matched.away}`);
  const oddsData=await fetchEventOdds(matched.id);
  if (!oddsData) return null;

  const bkData=oddsData.bookmakers||{};
  const markets=bkData['SportyBet']||bkData['Bet365'];
  const bookmakerUsed=bkData['SportyBet']?'SportyBet':bkData['Bet365']?'Bet365':null;
  if (!markets) return null;

  const odds=parseBookmakerOdds(markets);
  const overUnder=JSON.stringify({over_2_5:odds.over_2_5,under_2_5:odds.under_2_5,over_1_5:odds.over_1_5,under_1_5:odds.under_1_5,over_3_5:odds.over_3_5,under_3_5:odds.under_3_5});
  try {
    await db.execute({ sql:`INSERT OR REPLACE INTO fixture_odds (fixture_id,home,draw,away,over_1_5,under_1_5,over_2_5,under_2_5,over_3_5,under_3_5,btts_yes,btts_no,over_under,bookmaker,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`, args:[String(fixtureId),odds.home,odds.draw,odds.away,odds.over_1_5,odds.under_1_5,odds.over_2_5,odds.under_2_5,odds.over_3_5,odds.under_3_5,odds.btts_yes,odds.btts_no,overUnder,bookmakerUsed||'SportyBet'] });
    console.log(`[OddsService] Cached odds for ${fixtureId} (${bookmakerUsed}) 1X2:${odds.home}/${odds.draw}/${odds.away}`);
  } catch (err) { console.error('[OddsService] DB write:', err.message); }
  return odds;
}
