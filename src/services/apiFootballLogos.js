/**
 * apiFootballLogos.js
 *
 * Fetches team logos from API-Football (v3.football.api-sports.io).
 * Caches results permanently in the `team_logos` DB table.
 *
 * Free tier: 100 calls/day.
 * Strategy: search once per unique team name, store forever.
 *           Logo image CDN calls are FREE and don't count against quota.
 */
import db from '../config/database.js';
import axios from 'axios';

const API_BASE  = 'https://v3.football.api-sports.io';
const API_KEY   = process.env.APIFOOTBALL_KEY || '';

// ── DB setup ──────────────────────────────────────────────────────────────────

export async function ensureTeamLogosTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS team_logos (
        team_name TEXT PRIMARY KEY COLLATE NOCASE,
        logo_url  TEXT,
        fetched_at TEXT DEFAULT (datetime('now'))
      )
    `);
  } catch (_) {}
}

// ── Cache read ─────────────────────────────────────────────────────────────────

async function getCachedLogo(teamName) {
  try {
    const r = await db.execute({
      sql: `SELECT logo_url FROM team_logos WHERE team_name = ? COLLATE NOCASE LIMIT 1`,
      args: [teamName],
    });
    const row = r.rows?.[0];
    if (!row) return undefined;        // not in cache yet
    return row.logo_url || null;       // null = confirmed no logo
  } catch { return undefined; }
}

async function cacheLogo(teamName, logoUrl) {
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO team_logos (team_name, logo_url, fetched_at) VALUES (?, ?, datetime('now'))`,
      args: [teamName, logoUrl || null],
    });
  } catch (_) {}
}

// ── API call ──────────────────────────────────────────────────────────────────

/**
 * Search API-Football for a team by name.
 * Returns the best-matching logo URL, or null if not found.
 * Uses countryHint to disambiguate teams with the same name in different countries.
 */
async function fetchLogoFromApi(teamName, countryHint = '') {
  if (!API_KEY) {
    console.warn('[ApiFootballLogos] APIFOOTBALL_KEY not set — skipping logo fetch');
    return null;
  }
  try {
    const res = await axios.get(`${API_BASE}/teams`, {
      params: { search: teamName },
      headers: { 'x-apisports-key': API_KEY },
      timeout: 8000,
    });
    const results = res.data?.response || [];
    if (!results.length) return null;

    // Step 1: exact name + country match (gold standard)
    if (countryHint) {
      const countryLower = countryHint.toLowerCase();
      const best = results.find(r =>
        r.team?.name?.toLowerCase() === teamName.toLowerCase() &&
        r.team?.country?.toLowerCase() === countryLower
      );
      if (best) return best.team.logo || null;
    }

    // Step 2: exact name match (any country)
    const exact = results.find(r =>
      r.team?.name?.toLowerCase() === teamName.toLowerCase()
    );
    if (exact) return exact.team.logo || null;

    // Step 3: take first result — API search is generally reliable enough
    // Better to show a close logo than a letter avatar for most teams
    return results[0].team?.logo || null;
  } catch (err) {
    console.warn(`[ApiFootballLogos] Fetch failed for "${teamName}":`, err.message);
    return null;
  }
}

// ── Public: resolve logo for one team ─────────────────────────────────────────

/**
 * Get a logo URL for a team. Checks cache first, falls back to API.
 * @param {string} teamName
 * @param {string} countryHint  - country name to disambiguate (e.g. 'England')
 * @param {boolean} allowApiCall - set false to cache-only (no quota spend)
 */
export async function resolveTeamLogo(teamName, countryHint = '', allowApiCall = true) {
  if (!teamName) return null;
  await ensureTeamLogosTable();

  const cached = await getCachedLogo(teamName);
  if (cached !== undefined) return cached; // cache hit (even null = "no logo")

  if (!allowApiCall) return null; // don't burn quota

  // Not cached — call API with country hint, store result
  const logoUrl = await fetchLogoFromApi(teamName, countryHint);
  await cacheLogo(teamName, logoUrl);
  return logoUrl;
}

// ── Public: bulk enrich logos for today's fixtures ────────────────────────────

/**
 * Scan today's fixtures for missing logos and fill them in.
 * Respects the daily quota: processes at most `maxNewLookups` unknown teams per run.
 * Safe to call from a cron job or admin route.
 */
export async function bulkFillLogos({ maxNewLookups = 10, log = console.log } = {}) {
  await ensureTeamLogosTable();
  if (!API_KEY) {
    log('[ApiFootballLogos] APIFOOTBALL_KEY not set — skipping bulk fill');
    return { filled: 0, skipped: 0 };
  }

  // Fetch fixtures missing at least one logo, include category_name for country context
  const r = await db.execute(`
    SELECT DISTINCT id, home_team_name, away_team_name, home_team_logo, away_team_logo, category_name
    FROM fixtures
    WHERE (home_team_logo IS NULL OR home_team_logo = '')
       OR (away_team_logo IS NULL OR away_team_logo = '')
    LIMIT 200
  `);
  const fixtures = r.rows || [];

  // Collect unique team names that need logo lookup
  const needsLookup = new Set();
  for (const f of fixtures) {
    if (!f.home_team_logo) needsLookup.add(f.home_team_name);
    if (!f.away_team_logo) needsLookup.add(f.away_team_name);
  }

  // Filter to only those NOT already cached
  // Build team→country map for disambiguation
  const VENUE_KEYWORDS_CHECK = (s) => ['park','stadium','arena','ground','road','lane'].some(k => s.toLowerCase().includes(k));
  const teamCountry = new Map();
  for (const f of fixtures) {
    const country = (f.category_name || '').trim();
    if (country && !VENUE_KEYWORDS_CHECK(country)) {
      if (!teamCountry.has(f.home_team_name)) teamCountry.set(f.home_team_name, country);
      if (!teamCountry.has(f.away_team_name)) teamCountry.set(f.away_team_name, country);
    }
  }

  const toFetch = [];
  for (const name of needsLookup) {
    const cached = await getCachedLogo(name);
    if (cached === undefined) toFetch.push(name); // not yet in cache
    if (toFetch.length >= maxNewLookups) break;   // respect quota
  }

  log(`[ApiFootballLogos] ${toFetch.length} new team lookups (quota budget: ${maxNewLookups})`);

  let filled = 0;
  for (const teamName of toFetch) {
    const country = teamCountry.get(teamName) || '';
    const logoUrl = await fetchLogoFromApi(teamName, country);
    await cacheLogo(teamName, logoUrl);
    if (logoUrl) filled++;
    // Small delay to respect rate limits (30 req/min)
    await new Promise(r => setTimeout(r, 2100));
  }

  // Now update fixtures table with resolved logos from cache
  const allCached = new Map();
  for (const name of needsLookup) {
    const logo = await getCachedLogo(name);
    if (logo) allCached.set(name.toLowerCase(), logo);
  }

  let updated = 0;
  for (const f of fixtures) {
    const homeLogo = !f.home_team_logo ? allCached.get(f.home_team_name?.toLowerCase()) : null;
    const awayLogo = !f.away_team_logo ? allCached.get(f.away_team_name?.toLowerCase()) : null;
    if (homeLogo || awayLogo) {
      await db.execute({
        sql: `UPDATE fixtures SET
              home_team_logo = CASE WHEN home_team_logo IS NULL OR home_team_logo = '' THEN ? ELSE home_team_logo END,
              away_team_logo = CASE WHEN away_team_logo IS NULL OR away_team_logo = '' THEN ? ELSE away_team_logo END
              WHERE id = ?`,
        args: [homeLogo || null, awayLogo || null, f.id],
      });
      updated++;
    }
  }

  log(`[ApiFootballLogos] Done — ${filled} new logos fetched, ${updated} fixtures updated`);
  return { filled, updated, skipped: needsLookup.size - toFetch.length };
}
