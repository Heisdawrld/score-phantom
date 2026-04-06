import axios from "axios";
import db from "../config/database.js";

const BASE = "https://api.sportmonks.com/v3/football";
const getKey = () => process.env.SPORTMONKS_API_KEY;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path, params, retries) {
  params = params || {}; retries = retries || 2;
  const key = getKey();
  if (!key) throw new Error("SPORTMONKS_API_KEY not set");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sleep(200 + Math.random() * 100);
      const res = await axios.get(BASE + path, { params: Object.assign({ api_token: key }, params), timeout: 15000 });
      return res.data;
    } catch (err) {
      const status = err && err.response && err.response.status;
      if ((status === 429 || status === 503) && attempt < retries) { await sleep(2000 * Math.pow(2, attempt)); continue; }
      throw err;
    }
  }
}

function mapStatus(s) {
  s = (s || "").toUpperCase();
  if (["FT","AET","FT_PEN","AWD","WO","CANC","POSTP","SUSP","ABD"].includes(s)) return "FT";
  if (["LIVE","INPLAY","HT","1H","2H","ET","BREAK","PEN_LIVE","INT"].includes(s)) return "LIVE";
  return "NS";
}
function extractScore(scores, location) {
  if (!Array.isArray(scores)) return null;
  const sc = scores.find(function(s){ return s.description === "CURRENT" && s.score && s.score.participant === location; });
  return sc && sc.score ? sc.score.goals : null;
}
function normalizeFixture(f) {
  const parts = f.participants || [];
  const home = parts.find(function(p){ return p.meta && p.meta.location === "home"; }) || {};
  const away = parts.find(function(p){ return p.meta && p.meta.location === "away"; }) || {};
  const stateName = (f.state && (f.state.short_name || f.state.developer_name)) || "NS";
  const lg = f.league || {};
  return {
    match_id: String(f.id), home_team_id: String(home.id || ""),
    home_team_name: home.short_name || home.name || "",
    away_team_id: String(away.id || ""), away_team_name: away.short_name || away.name || "",
    tournament_id: String(f.league_id || "0"), tournament_name: lg.name || "",
    category_name: (lg.country && lg.country.name) || "",
    match_date: f.starting_at || "", match_url: String(f.id),
    match_status: mapStatus(stateName),
    home_score: extractScore(f.scores, "home"), away_score: extractScore(f.scores, "away"),
    home_team_logo: home.image_path || "", away_team_logo: away.image_path || "",
    country_flag: lg.image_path || "",
    live_minute: (f.state && f.state.clock && f.state.clock.current) ? String(f.state.clock.current) : null,
  };
}

async function ensureCache() {
  try { await db.execute("CREATE TABLE IF NOT EXISTS sportmonks_cache (cache_key TEXT PRIMARY KEY, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL)"); } catch(_){}
}
async function getCached(key) {
  try {
    const res = await db.execute({ sql: "SELECT data_json, expires_at FROM sportmonks_cache WHERE cache_key = ? LIMIT 1", args: [key] });
    const row = res.rows && res.rows[0];
    if (!row || new Date(row.expires_at) < new Date()) return null;
    return JSON.parse(row.data_json);
  } catch(_) { return null; }
}
async function setCached(key, data, ttlMs) {
  try {
    const now = new Date().toISOString();
    const exp = new Date(Date.now() + ttlMs).toISOString();
    await db.execute({ sql: "INSERT OR REPLACE INTO sportmonks_cache (cache_key,data_json,fetched_at,expires_at) VALUES (?,?,?,?)", args: [key, JSON.stringify(data), now, exp] });
  } catch(_){}
}

export async function fetchFixturesByDate(dateStr) {
  await ensureCache();
  const ck = "fixtures_date_" + dateStr;
  const cached = await getCached(ck);
  if (cached) { console.log("[Sportmonks] Cache hit: " + ck); return cached; }
  try {
    const res = await get("/fixtures", { filters: "fixturesBetween:" + dateStr + ";" + dateStr, include: "participants;scores;state;league", per_page: 150 });
    const fixtures = (res.data || []).map(normalizeFixture);
    console.log("[Sportmonks] " + dateStr + ": " + fixtures.length + " fixtures");
    await setCached(ck, fixtures, 4 * 60 * 60 * 1000);
    return fixtures;
  } catch(err) { console.error("[Sportmonks] fetchFixturesByDate failed:", err.message); return []; }
}

export async function fetchLiveScores() {
  await ensureCache();
  const cached = await getCached("live_scores");
  if (cached) return cached;
  try {
    const res = await get("/livescores/inplay", { include: "participants;scores;state;league" });
    const fixtures = (res.data || []).map(normalizeFixture);
    await setCached("live_scores", fixtures, 60 * 1000);
    return fixtures;
  } catch(err) { console.error("[Sportmonks] fetchLiveScores failed:", err.message); return []; }
}

export async function fetchMatchDetail(fixtureId) {
  await ensureCache();
  const ck = "match_detail_" + fixtureId;
  const cached = await getCached(ck);
  if (cached) return cached;
  try {
    const res = await get("/fixtures/" + fixtureId, { include: "participants;scores;state;league;statistics;lineups;events;h2h" });
    const f = res.data;
    if (!f) return null;
    const norm = normalizeFixture(f);
    const detail = { fixture: norm, statistics: f.statistics || [], lineups: f.lineups || [], events: f.events || [], h2h: f.h2h || [], state: f.state || {}, league: f.league || {} };
    await setCached(ck, detail, norm.match_status === "FT" ? 24*60*60*1000 : 5*60*1000);
    return detail;
  } catch(err) { console.error("[Sportmonks] fetchMatchDetail failed for " + fixtureId + ":", err.message); return null; }
}

export async function fetchMatchOdds(fixtureId) {
  await ensureCache();
  const ck = "match_odds_" + fixtureId;
  const cached = await getCached(ck);
  if (cached) return cached;
  try {
    const res = await get("/fixtures/" + fixtureId, { include: "odds" });
    const odds = (res.data && res.data.odds) || [];
    await setCached(ck, odds, 15 * 60 * 1000);
    return odds;
  } catch(err) { console.error("[Sportmonks] fetchMatchOdds failed:", err.message); return []; }
}

