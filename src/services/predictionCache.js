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
import { fetchPredictedLineup, bsdFetch } from './bsd.js';
// Odds are now sourced from fixture_odds table (written at seed time from BSD events)
// No external odds service needed.

// Cache is valid for 6 hours — predictions refresh each morning via automation
const CACHE_VALID_HOURS = 6;

// Bump this whenever the engine logic changes significantly.
// Any cached prediction built with a different version is automatically rebuilt.
const CURRENT_ENGINE_VERSION = '2.8.4'; // Bumped: Aggregate missing-player stats for stable xG dampening

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
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`,
    args: [fixtureId],
  });
  return result.rows || [];
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

// ── Core data assembly (used by all routes) ───────────────────────────────────

/**
 * Ensure a fixture is enriched and return the complete data bundle.
 * This is the single source of truth for all routes.
 */
export async function ensureFixtureData(fixtureId) {
  let fixture = await getFixtureById(fixtureId);
  if (!fixture) return null;

  let historyRows = await getHistoryRows(fixtureId);

  if (!fixture.enriched || !hasUsableHistory(historyRows)) {
    try {
      await enrichFixture(fixture);
      fixture = await getFixtureById(fixtureId);
      historyRows = await getHistoryRows(fixtureId);
    } catch (e) {
      console.error('[predictionCache] Enrichment failed:', e.message);
    }
  }

  // Odds are seeded from BSD at fixture seed time — just read from DB
  let odds = await getOdds(fixtureId);

  const meta = buildMetaFromFixtureAndHistory(fixture, historyRows);

  // ── INJECT LIVE INJURIES AND PREDICTED LINEUPS ──
  try {
    if (fixture.bsd_event_api_id) {
      const liveData = await bsdFetch(`/events/${fixture.id}/`);
      
      async function attachMissingPlayerStats(players = []) {
        return Promise.all(
          players.map(async (p) => {
            const playerId = p?.player?.id || p?.id || null;
            const stats = playerId ? await fetchPlayerStats(playerId) : null;
            return { ...p, stats };
          })
        );
      }

      if (liveData?.unavailable_players) {
        meta.unavailable_players = {
          home: await attachMissingPlayerStats(liveData.unavailable_players.home || []),
          away: await attachMissingPlayerStats(liveData.unavailable_players.away || []),
        };
      }

      const eventApiId = fixture.bsd_event_api_id || null;
      const lineupData = eventApiId ? await fetchPredictedLineup(eventApiId) : null;
      if (lineupData?.lineups) {
        meta.predicted_lineup = lineupData.lineups;
      }
    }
  } catch (err) {
    console.error(`[predictionCache] Failed to fetch injuries/lineup for ${fixtureId}:`, err.message);
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
    // Write prediction_json blob
    await db.execute({
      sql: `UPDATE predictions_v2 SET prediction_json = ? WHERE fixture_id = ?`,
      args: [
        JSON.stringify({ prediction, engineResult, engineVersion: CURRENT_ENGINE_VERSION }),
        String(fixtureId),
      ],
    });

    // Write flat columns used by ACCA builder
    await db.execute({
      sql: `UPDATE predictions_v2 SET
        best_pick_market      = ?,
        best_pick_selection   = ?,
        best_pick_probability = ?,
        best_pick_score       = ?,
        confidence_model      = ?,
        confidence_volatility = ?,
        script_primary        = ?,
        no_safe_pick          = ?,
        home_team             = ?,
        away_team             = ?,
        updated_at            = ?
      WHERE fixture_id = ?`,
      args: [
        noSafePick ? null : (bp?.marketKey || null),
        noSafePick ? null : (bp?.selection || null),
        noSafePick ? null : (bp?.modelProbability ?? null),
        noSafePick ? null : (bp?.finalScore ?? null),
        noSafePick ? null : (conf?.model || null),
        volStr,
        script.primary || null,
        noSafePick,
        engineResult?.homeTeam || rec.fixture?.homeTeam || null,
        engineResult?.awayTeam || rec.fixture?.awayTeam || null,
        new Date().toISOString(),
        String(fixtureId),
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
 * @returns {{ prediction, odds, meta, engineResult, fixture, fromCache }}
 */
export async function getOrBuildPrediction(fixtureId, { forceRefresh = false } = {}) {
  // ── Ensure fixture data (enrichment) ──────────────────────────────────────
  const bundle = await ensureFixtureData(fixtureId);
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
      };
    }
    console.log(`[predictionCache] Cache stale or empty for fixture ${fixtureId} — rebuilding`);
  }

  // ── Run the engine ────────────────────────────────────────────────────────
  const engineResult = await runPredictionEngine(fixtureId, bundle);

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
  };
}
