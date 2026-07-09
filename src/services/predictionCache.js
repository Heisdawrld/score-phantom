/**
 * predictionCache.js
 *
 * Single point of truth for generating and caching predictions.
 * ALL routes (/predict, /acca, /explain, /chat) MUST go through this module.
 *
 * This ensures:
 *  - Every route uses the same enriched data and engine output
 *  - No contradictions between routes for the same fixture
 *  - Engine runs only once per fixture per cache window
 *  - Data fetched is exactly what the engine uses
 */

import db from '../config/database.js';
import { runPredictionEngine } from '../engine/runPredictionEngine.js';
import { adaptResponseFormat } from '../api/responseAdapter.js';
import { enrichFixture } from '../enrichment/enrichOne.js';
import { fetchPredictedLineup, fetchPlayerStats, fetchBestOdds } from './bsd.js';
import { insertPredictionPickIfMaterialChange } from '../storage/predictionPicks.js';
// Odds are now sourced from fixture_odds table and live BSD v2 odds as fallback.

// Cache is valid for 6 hours — predictions refresh each morning via automation
const CACHE_VALID_HOURS = 6;

/** Re-fetch BSD enrichment (form/H2H → historical_matches) even when enriched=1 */
const ENRICHMENT_REFRESH_HOURS = Number(process.env.ENRICHMENT_REFRESH_HOURS || CACHE_VALID_HOURS);

/** Fixtures kicking off sooner get tighter enrichment TTL */
const ENRICHMENT_IMMINENT_HOURS = Number(process.env.ENRICHMENT_IMMINENT_HOURS || 36);

// Bump this whenever the engine logic changes significantly.
// Any cached prediction built with a different version is automatically rebuilt.
const CURRENT_ENGINE_VERSION = '5.1.0'; // v5.1.0: engine transplant + verdict ladder contract fixes

// ── DB helpers ────────────────────────────────────────────────────────────────

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasAnyOdds(odds) {
  if (!odds) return false;
  if (Number(odds.home) > 1 || Number(odds.draw) > 1 || Number(odds.away) > 1) return true;
  if (Number(odds.btts_yes) > 1 || Number(odds.btts_no) > 1) return true;
  const ou = odds.over_under || {};
  return Object.values(ou).some(v => Number(v) > 1);
}

function mapBestOddsToFixtureOdds(bestOdds) {
  if (!bestOdds) return null;
  const mapped = {
    home: bestOdds.home_win ?? bestOdds.home ?? null,
    draw: bestOdds.draw ?? null,
    away: bestOdds.away_win ?? bestOdds.away ?? null,
    btts_yes: bestOdds.btts_yes ?? null,
    btts_no: bestOdds.btts_no ?? null,
    over_under: {
      over_1_5: bestOdds.over_15 ?? bestOdds.over_15_goals ?? null,
      over_2_5: bestOdds.over_25 ?? bestOdds.over_25_goals ?? null,
      over_3_5: bestOdds.over_35 ?? bestOdds.over_35_goals ?? null,
      under_1_5: bestOdds.under_15 ?? bestOdds.under_15_goals ?? null,
      under_2_5: bestOdds.under_25 ?? bestOdds.under_25_goals ?? null,
      under_3_5: bestOdds.under_35 ?? bestOdds.under_35_goals ?? null,
    },
    betLinkSportybet: null,
    betLinkBet365: null,
  };
  return hasAnyOdds(mapped) ? mapped : null;
}

async function upsertFixtureOdds(fixtureId, odds) {
  if (!fixtureId || !hasAnyOdds(odds)) return;
  try {
    await db.execute({
      sql: `INSERT INTO fixture_odds
              (fixture_id, home, draw, away, btts_yes, btts_no, over_under)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (fixture_id) DO UPDATE SET
              home = COALESCE(EXCLUDED.home, fixture_odds.home),
              draw = COALESCE(EXCLUDED.draw, fixture_odds.draw),
              away = COALESCE(EXCLUDED.away, fixture_odds.away),
              btts_yes = COALESCE(EXCLUDED.btts_yes, fixture_odds.btts_yes),
              btts_no = COALESCE(EXCLUDED.btts_no, fixture_odds.btts_no),
              over_under = EXCLUDED.over_under`,
      args: [
        String(fixtureId),
        odds.home ?? null,
        odds.draw ?? null,
        odds.away ?? null,
        odds.btts_yes ?? null,
        odds.btts_no ?? null,
        JSON.stringify(odds.over_under || {}),
      ],
    });
  } catch (err) {
    console.warn(`[predictionCache] Failed to persist live BSD odds for ${fixtureId}:`, err.message);
  }
}

function mapHistoryRow(row) {
  return {
    home: row.home_team,
    away: row.away_team,
    score:
      row.home_goals != null && row.away_goals != null
        ? `${row.home_goals}-${row.away_goals}`
        : null,
    date: row.date,
  };
}

function buildMetaFromFixtureAndHistory(fixture, historyRows) {
  const meta = safeJsonParse(fixture.meta, {});

  meta.homeForm = historyRows
    .filter((m) => m.type === 'home_form')
    .map(mapHistoryRow);

  meta.awayForm = historyRows
    .filter((m) => m.type === 'away_form')
    .map(mapHistoryRow);

  meta.h2h = historyRows
    .filter((m) => m.type === 'h2h')
    .map(mapHistoryRow);

  if (!Array.isArray(meta.standings)) {
    meta.standings = [];
  }

  meta.standings = meta.standings.map((r, idx) => {
    const wins = Number(r.wins || 0);
    const draws = Number(r.draws || 0);
    const losses = Number(r.losses || 0);
    const computedPlayed = wins + draws + losses;
    const played = Number(r.played || r.games || r.matches || 0) || computedPlayed;

    return {
      ...r,
      position: Number(r.position || idx + 1),
      played,
      games: played,
      matches: played,
      wins,
      draws,
      losses,
      won: wins,
      drawn: draws,
      lost: losses,
      points: Number(r.points || 0),
    };
  });

  // Ensure fixture date is available for rest day / fatigue / season stage computation
  if (fixture.match_date) {
    meta.matchDate = fixture.match_date;
    meta.fixture_date = fixture.match_date;
  }

  return meta;
}

export async function getFixtureById(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM fixtures WHERE id = ?`,
    args: [fixtureId],
  });
  return result.rows?.[0] || null;
}

export async function getHistoryRows(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ?`,
    args: [fixtureId],
  });
  return sortHistoryRowsChronologically(result.rows || []);
}

export async function getOdds(fixtureId) {
  try {
    const result = await db.execute({
      sql: `SELECT home, draw, away, btts_yes, btts_no, over_under, bet_link_sportybet, bet_link_bet365 FROM fixture_odds WHERE fixture_id = ? LIMIT 1`,
      args: [fixtureId],
    });
    const oddsRow = result.rows?.[0] || null;
    if (!oddsRow) return null;

    return {
      home: oddsRow.home,
      draw: oddsRow.draw,
      away: oddsRow.away,
      btts_yes: oddsRow.btts_yes,
      btts_no: oddsRow.btts_no,
      over_under: oddsRow.over_under ? safeJsonParse(oddsRow.over_under, {}) : {},
      betLinkSportybet: oddsRow.bet_link_sportybet || null,
      betLinkBet365: oddsRow.bet_link_bet365 || null,
    };
  } catch {
    return null;
  }
}

function hasUsableHistory(historyRows) {
  const homeCount = historyRows.filter((m) => m.type === 'home_form').length;
  const awayCount = historyRows.filter((m) => m.type === 'away_form').length;
  return homeCount > 0 && awayCount > 0;
}

function rowDateMs(d) {
  const t = new Date(d || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Match engine + UI: newest form/H2H first per section (string dates can collation-wobble in SQL-only sorts). */
function sortHistoryRowsChronologically(rows) {
  const list = rows || [];
  const desc = (a, b) => rowDateMs(b.date) - rowDateMs(a.date);
  const byType = (t) => list.filter((r) => r.type === t).sort(desc);
  return [...byType('away_form'), ...byType('h2h'), ...byType('home_form')];
}

function fixtureKickoffMs(fixture) {
  const t = new Date(fixture?.match_date || 0).getTime();
  return Number.isNaN(t) ? null : t;
}

function needsEnrichmentRefresh(fixture, historyRows) {
  if (!fixture.enriched || !hasUsableHistory(historyRows)) return true;

  const meta = safeJsonParse(fixture?.meta, {});
  const ts = meta?.dataFreshness?.refreshedAt || meta?.enrichedAt || meta?.bsdRefreshedAt;
  if (!ts) {
    console.log(`[predictionCache] No enrichment timestamp on fixture ${fixture.id} — refreshing`);
    return true;
  }
  const parsed = new Date(ts).getTime();
  if (Number.isNaN(parsed)) {
    console.log(`[predictionCache] Bad enrichment timestamp on fixture ${fixture.id} — refreshing`);
    return true;
  }
  const age = (Date.now() - parsed) / 3600000;
  const maxAge = ENRICHMENT_REFRESH_HOURS;
  if (age >= maxAge) {
    console.log(`[predictionCache] Enrichment stale (${age.toFixed(1)}h >= ${maxAge}h) for fixture ${fixture.id}`);
    return true;
  }
  const kick = fixtureKickoffMs(fixture);
  const soon =
    kick != null &&
    kick > Date.now() &&
    kick - Date.now() < ENRICHMENT_IMMINENT_HOURS * 3600000;
  const imminentTtl = Math.min(maxAge, Math.max(2, Number(process.env.ENRICHMENT_IMMINENT_REFRESH_HOURS || 3)));
  if (soon && age >= imminentTtl) {
    console.log(`[predictionCache] Enrichment imminent-kickoff refresh (${age.toFixed(1)}h >= ${imminentTtl}h) for fixture ${fixture.id}`);
    return true;
  }
  return false;
}

// ── Cache check ───────────────────────────────────────────────────────────────

async function isCacheFresh(fixtureId) {
  try {
    const r = await db.execute({
      sql: `SELECT updated_at FROM predictions_v2 WHERE fixture_id = ? LIMIT 1`,
      args: [String(fixtureId)],
    });
    if (!r.rows?.[0]?.updated_at) return false;
    const updated = new Date(r.rows[0].updated_at);
    const ageHours = (Date.now() - updated.getTime()) / 3600000;
    return ageHours < CACHE_VALID_HOURS;
  } catch {
    return false;
  }
}

// ── Enrichment in-flight dedup + failure cooldown ─────────────────────────────
//
// Problem (observed in production logs):
//   1. When enrichFixture() throws (e.g., DB batch HeadersTimeoutError), storeEnrichment()
//      never runs, so the refreshedAt timestamp in fixtures.meta is never bumped. Every
//      subsequent request re-triggers enrichment → fail → re-trigger. A fixture stuck
//      for 575.8h was observed in production logs.
//   2. No in-flight deduplication: two concurrent requests for the same fixture both
//      pass needsEnrichmentRefresh() (neither has bumped the timestamp yet) and both
//      call enrichFixture() → 2× the 40+ BSD API calls (duplicate "Enriching X vs Y"
//      log lines observed in production).
//
// Solution:
//   - enrichmentInFlight: Map<fixtureId, Promise> — concurrent calls share the same
//     Promise, so enrichment runs at most once per fixture at a time.
//   - enrichmentFailureCooldown: Map<fixtureId, timestamp> — after a failed enrichment,
//     skip re-enrichment for ENRICHMENT_FAILURE_COOLDOWN_MS (30 min) to break the
//     stale-loop vicious cycle and save Render compute + BSD API budget.
const enrichmentInFlight = new Map();
const enrichmentFailureCooldown = new Map();
const ENRICHMENT_FAILURE_COOLDOWN_MS = 30 * 60 * 1000; // 30 min

async function enrichFixtureDedup(fixture) {
  const fixtureId = String(fixture.id);

  // Cooldown check — if enrichment recently failed, skip to break the stale-loop.
  const lastFail = enrichmentFailureCooldown.get(fixtureId);
  if (lastFail && Date.now() - lastFail < ENRICHMENT_FAILURE_COOLDOWN_MS) {
    const minsAgo = ((Date.now() - lastFail) / 60000).toFixed(1);
    console.log(`[predictionCache] Enrichment cooldown for fixture ${fixtureId} (failed ${minsAgo}min ago, cooldown 30min) — skipping re-enrichment, engine will use existing history`);
    return null;
  }

  // In-flight dedup — if enrichment is already running for this fixture, await the same Promise.
  if (enrichmentInFlight.has(fixtureId)) {
    console.log(`[predictionCache] Enrichment already in-flight for fixture ${fixtureId} — awaiting shared Promise`);
    return enrichmentInFlight.get(fixtureId);
  }

  // Start enrichment, store the Promise for dedup, and set cooldown on failure.
  const promise = enrichFixture(fixture)
    .finally(() => {
      enrichmentInFlight.delete(fixtureId);
    })
    .then(result => {
      // Success — clear any stale cooldown from a previous failure.
      enrichmentFailureCooldown.delete(fixtureId);
      return result;
    })
    .catch(err => {
      // Failure — set cooldown to prevent the stale-loop vicious cycle.
      enrichmentFailureCooldown.set(fixtureId, Date.now());
      throw err;
    });

  enrichmentInFlight.set(fixtureId, promise);
  return promise;
}

// ── Core data assembly (used by all routes) ───────────────────────────────────

/**
 * Ensure a fixture is enriched and return the complete data bundle.
 * This is the single source of truth for all routes.
 *
 * @param {string} fixtureId
 * @param {object} opts
 * @param {boolean} opts.skipEnrichment - if true, NEVER call enrichFixtureDedup().
 *   The engine runs on whatever data is already in the DB (historical_matches,
 *   stored odds, etc.). Used by the TopPicks background generation fast-pass so
 *   picks appear in 1-3s instead of 10-30s. The 15-min cron still does full
 *   enrichment for higher quality.
 */
export async function ensureFixtureData(fixtureId, { skipEnrichment = false } = {}) {
  let fixture = await getFixtureById(fixtureId);
  if (!fixture) return null;

  let historyRows = await getHistoryRows(fixtureId);

  if (!skipEnrichment && (!fixture.enriched || !hasUsableHistory(historyRows) || needsEnrichmentRefresh(fixture, historyRows))) {
    try {
      await enrichFixtureDedup(fixture);
      fixture = await getFixtureById(fixtureId);
      historyRows = await getHistoryRows(fixtureId);
    } catch (e) {
      console.error('[predictionCache] Enrichment failed:', e.message);
    }
  } else if (skipEnrichment) {
    console.log(`[predictionCache] skipEnrichment=true for fixture ${fixtureId} — using existing DB data (fast-pass)`);
  }

  // Read DB odds first, then fall back to live BSD v2 odds below.
  let odds = await getOdds(fixtureId);

  const meta = buildMetaFromFixtureAndHistory(fixture, historyRows);

  // ── INJECT LIVE INJURIES, LINEUPS AND BEST ODDS ──
  // BSD v1 /predictions is intentionally not called here. It is optional, slow under load,
  // and must never block ScorePhantom's own engine. The engine uses BSD v2 data + our model.
  try {
    const bsdInternalEventId = fixture.id ? String(fixture.id) : null;

    if (bsdInternalEventId) {
      async function attachMissingPlayerStats(players = []) {
        return Promise.all(
          players.map(async (p) => {
            const playerId = p?.player?.id || p?.player_id || p?.id || null;
            const stats = playerId ? await fetchPlayerStats(playerId) : null;
            return { ...p, stats };
          })
        );
      }

      const [lineupData, bestOdds] = await Promise.all([
        fetchPredictedLineup(bsdInternalEventId),
        fetchBestOdds(bsdInternalEventId),
      ]);

      if (lineupData?.lineups) meta.predicted_lineup = lineupData.lineups;
      if (lineupData?.unavailable_players) {
        meta.unavailable_players = {
          home: await attachMissingPlayerStats(lineupData.unavailable_players.home || []),
          away: await attachMissingPlayerStats(lineupData.unavailable_players.away || []),
        };
      }

      const liveOdds = mapBestOddsToFixtureOdds(bestOdds);
      if (liveOdds) {
        meta.best_odds = bestOdds;
        if (!hasAnyOdds(odds)) {
          odds = liveOdds;
          console.log(`[predictionCache] Using live BSD odds fallback for fixture ${fixtureId}`);
        }
        await upsertFixtureOdds(fixtureId, liveOdds);
      }
    }
  } catch (err) {
    console.error(`[predictionCache] Failed to fetch injuries/lineup/odds for ${fixtureId}:`, err.message);
  }

  return { fixture, historyRows, odds, meta };
}

// ── Cache storage helpers ─────────────────────────────────────────────────────

async function savePredictionToCache(fixtureId, prediction, engineResult) {
  const rec = prediction || {};
  const bp = engineResult?.bestPick || null;
  const conf = engineResult?.confidence || {};
  const script = engineResult?.script || {};
  const volStr = String(conf.volatility || 'medium').toLowerCase();
  const noSafePick = !bp || engineResult?.noSafePick ? 1 : 0;

  try {
    // Single atomic UPDATE — prediction_json + flat columns in one statement
    // to prevent concurrent reads seeing partially-updated data
    const now = new Date().toISOString();
    // BUG FIX: Use INSERT ... ON CONFLICT DO UPDATE (upsert) instead of UPDATE-only.
    // The old UPDATE-only approach silently failed for first-time predictions
    // because no row existed yet, causing the cache to never be populated.
    await db.execute({
      sql: `INSERT INTO predictions_v2 (
          fixture_id, prediction_json,
          best_pick_market, best_pick_selection, best_pick_probability, best_pick_score,
          confidence_model, confidence_volatility, script_primary,
          no_safe_pick, pick_id, home_team, away_team, model_version, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (fixture_id) DO UPDATE SET
          prediction_json       = EXCLUDED.prediction_json,
          best_pick_market      = EXCLUDED.best_pick_market,
          best_pick_selection   = EXCLUDED.best_pick_selection,
          best_pick_probability = EXCLUDED.best_pick_probability,
          best_pick_score       = EXCLUDED.best_pick_score,
          confidence_model      = EXCLUDED.confidence_model,
          confidence_volatility = EXCLUDED.confidence_volatility,
          script_primary        = EXCLUDED.script_primary,
          no_safe_pick          = EXCLUDED.no_safe_pick,
          pick_id               = EXCLUDED.pick_id,
          home_team             = EXCLUDED.home_team,
          away_team             = EXCLUDED.away_team,
          model_version         = EXCLUDED.model_version,
          updated_at            = EXCLUDED.updated_at`,
      args: [
        String(fixtureId),
        JSON.stringify({ prediction, engineResult, engineVersion: CURRENT_ENGINE_VERSION }),
        noSafePick ? null : (bp?.marketKey || null),
        noSafePick ? null : (bp?.selection || null),
        noSafePick ? null : (bp?.modelProbability ?? null),
        noSafePick ? null : (bp?.finalScore ?? null),
        noSafePick ? null : (conf?.model || null),
        volStr,
        script.primary || null,
        noSafePick,
        engineResult?.pickId ?? null,
        engineResult?.homeTeam || rec.fixture?.homeTeam || null,
        engineResult?.awayTeam || rec.fixture?.awayTeam || null,
        CURRENT_ENGINE_VERSION,
        now,
      ],
    });
  } catch (err) {
    console.error(`[predictionCache] Error saving prediction ${fixtureId}:`, err.message);
  }
}

async function loadCachedPrediction(fixtureId) {
  try {
    const r = await db.execute({
      sql: `SELECT prediction_json FROM predictions_v2 WHERE fixture_id = ? LIMIT 1`,
      args: [String(fixtureId)],
    });
    const row = r.rows?.[0];
    if (!row?.prediction_json) return null;
    const cached = JSON.parse(row.prediction_json);
    // Invalidate if built with a different engine version — forces a fresh rebuild
    if (cached.engineVersion !== CURRENT_ENGINE_VERSION) {
      console.log(`[predictionCache] Engine version mismatch for ${fixtureId} (stored: ${cached.engineVersion}, current: ${CURRENT_ENGINE_VERSION}) — forcing rebuild`);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Get or build a prediction for a fixture.
 *
 * Returns the full adapted prediction response (same shape as what routes return).
 * Checks predictions_v2 cache first (valid for CACHE_VALID_HOURS).
 * If stale or missing, runs the full engine pipeline.
 *
 * @param {string} fixtureId
 * @param {object} options
 * @param {boolean} options.forceRefresh - skip cache check
 * @param {boolean} options.staleWhileRevalidate - if true, return ANY cached prediction
 *   immediately (even if stale) and trigger background enrichment+rebuild. This makes
 *   individual match clicks feel instant. Only blocks if NO cached prediction exists.
 * @param {boolean} options.skipEnrichment - if true, never call enrichFixtureDedup().
 *   The engine runs on existing DB data only. Used by TopPicks fast-pass.
 * @returns {{ prediction, odds, meta, engineResult, fixture, fromCache, stale }}
 */
export async function getOrBuildPrediction(fixtureId, { forceRefresh = false, staleWhileRevalidate = false, skipEnrichment = false } = {}) {
  // ── Stale-while-revalidate fast path ───────────────────────────────────────
  // PROBLEM: ensureFixtureData() is called BEFORE the cache check, and it may trigger
  // enrichFixtureDedup() which does 40+ BSD API calls (10-30s). Users clicking into a
  // match wait this long even when a perfectly good cached prediction exists.
  //
  // SOLUTION: When staleWhileRevalidate is true, check the cache FIRST. If any cached
  // prediction exists (any age), return it immediately with stale=true. Trigger
  // enrichment + rebuild in the background (fire-and-forget). The next request picks
  // up the fresh data.
  if (staleWhileRevalidate && !forceRefresh) {
    try {
      const cachedAny = await loadCachedPrediction(fixtureId);
      if (cachedAny?.prediction) {
        console.log(`[predictionCache] SWR fast-path HIT for fixture ${fixtureId} — returning cached, triggering background refresh`);

        // Back-fill tier if missing from old cached predictions
        if (cachedAny.prediction?.dataQuality && cachedAny.prediction.dataQuality.tier == null) {
          const s = cachedAny.prediction.dataQuality.completenessScore ?? 0.5;
          if (s >= 0.8)       cachedAny.prediction.dataQuality.tier = 'rich';
          else if (s >= 0.55) cachedAny.prediction.dataQuality.tier = 'good';
          else if (s >= 0.35) cachedAny.prediction.dataQuality.tier = 'partial';
          else                cachedAny.prediction.dataQuality.tier = 'thin';
        }

        // Fetch fixture + odds + meta WITHOUT triggering enrichment (fast DB reads)
        const fixture = await getFixtureById(fixtureId);
        const odds = await getOdds(fixtureId);
        const historyRows = await getHistoryRows(fixtureId);
        const meta = fixture ? buildMetaFromFixtureAndHistory(fixture, historyRows) : {};

        // Fire-and-forget background refresh (enrichment + engine rebuild if needed).
        // Use a self-healing IIFE that never throws to the caller.
        (async () => {
          try {
            // Check if enrichment is actually needed before doing the heavy work
            if (fixture && (needsEnrichmentRefresh(fixture, historyRows) || !fixture.enriched || !hasUsableHistory(historyRows))) {
              console.log(`[predictionCache] SWR background enrichment for fixture ${fixtureId}`);
              await enrichFixtureDedup(fixture).catch(e => console.error(`[predictionCache] SWR enrich failed ${fixtureId}:`, e.message));
            }
            // If the cache is stale (> CACHE_VALID_HOURS), rebuild the prediction
            const cacheFresh = await isCacheFresh(fixtureId);
            if (!cacheFresh) {
              console.log(`[predictionCache] SWR background rebuild for fixture ${fixtureId}`);
              // Recursive call with staleWhileRevalidate=false to do the real rebuild
              await getOrBuildPrediction(fixtureId, { staleWhileRevalidate: false }).catch(e => console.error(`[predictionCache] SWR rebuild failed ${fixtureId}:`, e.message));
            }
          } catch (err) {
            console.error(`[predictionCache] SWR background error for ${fixtureId}:`, err.message);
          }
        })();

        return {
          prediction: cachedAny.prediction,
          odds,
          meta,
          engineResult: cachedAny.engineResult,
          fixture,
          fromCache: true,
          stale: true,
        };
      }
    } catch (swrErr) {
      console.error(`[predictionCache] SWR fast-path error for ${fixtureId}:`, swrErr.message);
      // Fall through to normal path
    }
  }

  // ── Ensure fixture data (enrichment) ──────────────────────────────────────
  const bundle = await ensureFixtureData(fixtureId, { skipEnrichment });
  if (!bundle) return null;

  const { fixture, odds, meta } = bundle;

  // ── Check predictions_v2 cache ────────────────────────────────────────────
  if (!forceRefresh && await isCacheFresh(fixtureId)) {
    const cached = await loadCachedPrediction(fixtureId);
    if (cached) {
      console.log(`[predictionCache] Cache HIT for fixture ${fixtureId} — returning stored prediction`);

      // Back-fill tier if missing from old cached predictions
      if (cached.prediction?.dataQuality && cached.prediction.dataQuality.tier == null) {
        const s = cached.prediction.dataQuality.completenessScore ?? 0.5;
        if (s >= 0.8)       cached.prediction.dataQuality.tier = 'rich';
        else if (s >= 0.55) cached.prediction.dataQuality.tier = 'good';
        else if (s >= 0.35) cached.prediction.dataQuality.tier = 'partial';
        else                cached.prediction.dataQuality.tier = 'thin';
      }

      return {
        prediction: cached.prediction,
        odds,
        meta,
        engineResult: cached.engineResult,
        fixture,
        fromCache: true,
        stale: false,
      };
    }
    console.log(`[predictionCache] Cache stale or empty for fixture ${fixtureId} — rebuilding`);
  }

  // ── Run the engine ────────────────────────────────────────────────────────
  const engineResult = await runPredictionEngine(fixtureId, bundle);

  if (engineResult && !engineResult.noSafePick && engineResult.bestPick) {
    const kickoffDate = fixture?.match_date ? new Date(fixture.match_date) : null;
    const kickoffAt = kickoffDate && !isNaN(kickoffDate.getTime()) ? kickoffDate.toISOString() : null;
    const now = new Date();
    const generatedAt = now.toISOString();
    const predictionSource = kickoffAt && now.getTime() < new Date(kickoffAt).getTime() ? 'pre_match' : 'post_match_backfill';

    const bp = engineResult.bestPick;
    const insertedId = await insertPredictionPickIfMaterialChange({
      fixture_id: String(fixtureId),
      engine_version: CURRENT_ENGINE_VERSION,
      prediction_source: predictionSource,
      generated_at: generatedAt,
      kickoff_at: kickoffAt,
      market_key: bp.marketKey || '',
      selection: bp.selection || '',
      bookmaker_odds: bp.bookmakerOdds ?? null,
      implied_probability: bp.impliedProbability ?? null,
      edge: bp.edge ?? null,
      model_probability: bp.modelProbability ?? null,
      model_confidence: engineResult?.confidence?.model || null,
      phantom_score: null,
      volatility_score: engineResult?.script?.volatilityScore ?? null,
    });

    if (insertedId != null) engineResult.pickId = insertedId;
  }

  const homeTeam = engineResult.homeTeam || fixture.home_team_name || '';
  const awayTeam = engineResult.awayTeam || fixture.away_team_name || '';
  const prediction = adaptResponseFormat(engineResult, homeTeam, awayTeam);

  // ── Store full prediction in cache ────────────────────────────────────────
  await savePredictionToCache(fixtureId, prediction, engineResult).catch(err =>
    console.error('[predictionCache] Cache save failed:', err.message)
  );

  return {
    prediction,
    odds,
    meta,
    engineResult,
    fixture,
    fromCache: false,
    stale: false,
  };
}
