import { Router } from "express";
import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { predict } from "../predictions/poissonEngine.js";
import { evaluatePrediction } from "../evaluations/groqEvaluator.js";
import { explainPrediction, chatAboutMatch } from "../explanations/groqExplainer.js";
import { enrichFixture } from "../enrichment/enrichOne.js";
import { fetchAndCacheOddsForFixture } from "../services/oddsService.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'scorephantom_secret_2026';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;

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
    .filter((m) => m.type === "home_form")
    .map(mapHistoryRow);

  meta.awayForm = historyRows
    .filter((m) => m.type === "away_form")
    .map(mapHistoryRow);

  meta.h2h = historyRows
    .filter((m) => m.type === "h2h")
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
      points: Number(r.points || 0),
    };
  });

  return meta;
}

// ─── Auth / Access helpers ────────────────────────────────────────────────────

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

async function getCurrentUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.execute({
      sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
      args: [decoded.id],
    });
    return result.rows?.[0] || null;
  } catch {
    return null;
  }
}

function computeAccessStatus(user) {
  const now = new Date();

  const trialEnds = user?.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const trialActive = trialEnds && trialEnds > now;

  const subExpires = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at)
    : null;
  const subActive = subExpires && subExpires > now;

  let status = 'expired';
  if (subActive) status = 'active';
  else if (trialActive) status = 'trial';

  const trialDaysLeft = trialActive
    ? Math.max(0, Math.ceil((trialEnds - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const isPremium = !!subActive;
  const isTrial = !!trialActive && !subActive;

  return {
    status,
    is_premium: isPremium,
    is_trial: isTrial,
    trial_active: !!trialActive,
    subscription_active: !!subActive,
    has_full_access: !!trialActive || !!subActive,
    trial_days_left: trialDaysLeft,
    features: {
      ai_chat: isPremium,
      full_predictions: isPremium,
      all_matches: isPremium,
    },
  };
}

/**
 * Build the standard `access` object included in every authenticated response.
 */
function buildAccessPayload(access) {
  return {
    status: access.status,
    is_premium: access.is_premium,
    is_trial: access.is_trial,
    trial_days_left: access.trial_days_left,
    features: access.features,
  };
}

// ─── Middleware: requireAuth ──────────────────────────────────────────────────
// Just verifies JWT and attaches user + access info to `req`.
// Does NOT enforce any subscription / trial state.

async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const access = computeAccessStatus(user);
  req.user = user;
  req.access = access;

  next();
}

// ─── Middleware: requirePremiumAccess ─────────────────────────────────────────
// Requires an active subscription (NOT trial). Use for premium-only endpoints.

async function requirePremiumAccess(req, res, next) {
  // If auth was already resolved by a previous middleware, reuse it
  if (!req.user) {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const access = computeAccessStatus(user);
    req.user = user;
    req.access = access;
  }

  if (!req.access.is_premium) {
    return res.status(403).json({
      error: 'Premium subscription required',
      code: 'premium_required',
      access: buildAccessPayload(req.access),
      subscription_code: req.user.subscription_code || null,
    });
  }

  next();
}

// ─── Middleware: requireTrialOrPremium ────────────────────────────────────────
// Requires at least an active trial OR subscription.

async function requireTrialOrPremium(req, res, next) {
  if (!req.user) {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const access = computeAccessStatus(user);
    req.user = user;
    req.access = access;
  }

  if (!req.access.has_full_access) {
    return res.status(403).json({
      error: 'Subscription required',
      code: 'subscription_required',
      access: buildAccessPayload(req.access),
      subscription_code: req.user.subscription_code || null,
    });
  }

  next();
}

// ─── Prediction Cache ─────────────────────────────────────────────────────────
// Cache predictions in DB so they're stable and fast. TTL = 2 hours.

const PREDICTION_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

async function getCachedPrediction(fixtureId) {
  try {
    const result = await db.execute({
      sql: `SELECT * FROM predictions WHERE fixture_id = ? ORDER BY generated_at DESC LIMIT 1`,
      args: [fixtureId],
    });
    const row = result.rows?.[0];
    if (!row) return null;

    const age = Date.now() - new Date(row.generated_at).getTime();
    if (age > PREDICTION_CACHE_TTL_MS) return null;

    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function cachePrediction(fixtureId, prediction) {
  try {
    await db.execute({
      sql: `DELETE FROM predictions WHERE fixture_id = ?`,
      args: [fixtureId],
    });
    await db.execute({
      sql: `INSERT INTO predictions (fixture_id, market, value, probability, confidence, generated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        fixtureId,
        prediction.predictions?.recommendation?.market || 'unknown',
        JSON.stringify(prediction),
        prediction.predictions?.recommendation?.probability || 0,
        prediction.predictions?.recommendation?.confidence || 'LOW',
      ],
    });
  } catch (err) {
    console.error('[Cache] Failed to cache prediction:', err.message);
  }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function getFixtureById(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM fixtures WHERE id = ?`,
    args: [fixtureId],
  });

  if (!result.rows.length) return null;
  return result.rows[0];
}

async function getHistoryRows(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`,
    args: [fixtureId],
  });

  return result.rows;
}

async function getOdds(fixtureId) {
  try {
    const result = await db.execute({
      sql: `SELECT home, draw, away, btts_yes, btts_no, over_under FROM fixture_odds WHERE fixture_id = ? LIMIT 1`,
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
    };
  } catch (err) {
    console.error("[Odds] Failed:", err.message);
    return null;
  }
}

function hasUsableHistory(historyRows) {
  const h2hCount = historyRows.filter((m) => m.type === "h2h").length;
  const homeCount = historyRows.filter((m) => m.type === "home_form").length;
  const awayCount = historyRows.filter((m) => m.type === "away_form").length;

  return h2hCount > 0 && homeCount > 0 && awayCount > 0;
}

async function ensureFixtureData(fixtureId) {
  let fixture = await getFixtureById(fixtureId);
  if (!fixture) return null;

  let historyRows = await getHistoryRows(fixtureId);

  if (!fixture.enriched || !hasUsableHistory(historyRows)) {
    try {
      await enrichFixture(fixture);
      fixture = await getFixtureById(fixtureId);
      historyRows = await getHistoryRows(fixtureId);
    } catch (e) {
      console.error("[Enrich] Failed:", e.message);
    }
  }

  // Try to fetch live odds from Odds API first, fall back to cached DB odds
  let odds = null;
  try {
    const meta0 = safeJsonParse(fixture.meta, {});
    const tournamentName = fixture.tournament_name || meta0.tournament_name || '';
    odds = await fetchAndCacheOddsForFixture(
      fixtureId,
      fixture.home_team_name,
      fixture.away_team_name,
      tournamentName
    );
  } catch {}
  if (!odds) odds = await getOdds(fixtureId);
  const meta = buildMetaFromFixtureAndHistory(fixture, historyRows);

  return {
    fixture,
    historyRows,
    odds,
    meta,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health — public
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ScorePhantom API" });
});

// ─── GET /access — lightweight access check ──────────────────────────────────
router.get("/access", requireAuth, (req, res) => {
  res.json({
    access: buildAccessPayload(req.access),
  });
});

// ─── GET /fixtures — auth required; trial users get limited results ──────────
router.get("/fixtures", requireAuth, async (req, res) => {
  try {
    const { date, tournament, enriched, limit = 2000, offset = 0 } = req.query;

    let query = `SELECT * FROM fixtures WHERE 1=1`;
    const args = [];

    if (date) {
      query += ` AND match_date LIKE ?`;
      args.push(`%${date}%`);
    }

    if (tournament) {
      query += ` AND tournament_name LIKE ?`;
      args.push(`%${tournament}%`);
    }

    if (enriched !== undefined) {
      query += ` AND enriched = ?`;
      args.push(enriched === "true" ? 1 : 0);
    }

    query += ` ORDER BY match_date ASC LIMIT ? OFFSET ?`;
    args.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.execute({ sql: query, args });
    const fixtures = result.rows;

    // All users see all fixtures — predictions are gated, not fixture listing

    res.json({
      total: fixtures.length,
      fixtures,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// ─── GET /fixtures/:id — auth required; trial users only see "free" fixtures ─
router.get("/fixtures/:id", requireAuth, async (req, res) => {
  try {
    // Require at least trial or premium
    if (!req.access.has_full_access) {
      return res.status(403).json({
        error: "Subscription required",
        code: "subscription_required",
        access: buildAccessPayload(req.access),
      });
    }

    const bundle = await ensureFixtureData(req.params.id);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, meta } = bundle;

    // Trial users: only allow fixtures flagged as free (or first fixture)
    if (req.access.is_trial) {
      const fixtureMeta = safeJsonParse(fixture.meta, {});
      if (fixtureMeta.premium_only) {
        return res.status(403).json({
          error: "This fixture is not available on trial",
          code: "trial_restricted",
          access: buildAccessPayload(req.access),
        });
      }
    }

    res.json({
      fixture,
      h2h: meta.h2h || [],
      homeForm: meta.homeForm || [],
      awayForm: meta.awayForm || [],
      history: {
        h2h: meta.h2h || [],
        homeForm: meta.homeForm || [],
        awayForm: meta.awayForm || [],
      },
      meta,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixture", detail: err.message });
  }
});

// ─── GET /predict/:fixtureId — trial OR premium (trial = basic prediction only)
router.get("/predict/:fixtureId", requireAuth, requireTrialOrPremium, async (req, res) => {
  try {
    const fixtureId = req.params.fixtureId;

    // Check cache first for stable predictions
    const cached = await getCachedPrediction(fixtureId);
    if (cached) {
      const response = {
        ...cached,
        access: buildAccessPayload(req.access),
        _cached: true,
      };

      // Trial users: keep confidence_detail but strip detailed analysis
      if (req.access.is_trial) {
        delete response.detailed_analysis;
        delete response.reasoning;
        delete response.value_bets;
        if (response.predictions) {
          delete response.predictions.rejected_picks;
          // Keep recommendation.confidence_detail for trial users — it's useful
          // Only strip full reasons list (premium perk)
          if (response.predictions.recommendation) {
            delete response.predictions.recommendation.reasons;
          }
        }
        response.trial_limited = true;
      }

      return res.json(response);
    }

    const bundle = await ensureFixtureData(fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;

    // Step 1: Poisson engine computes all probabilities and ranks markets
    let prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta,
      odds
    );

    // Step 2: Groq evaluator reviews the ranked markets and selects best angle
    // This is the "thinking" layer that considers 30+ football factors
    try {
      prediction = await evaluatePrediction(prediction);
    } catch (evalErr) {
      console.error('[Evaluator] Failed, using Poisson recommendation:', evalErr.message);
      // Poisson engine's recommendation is still valid as fallback
    }

    // Compute model-implied odds for leagues without bookmaker coverage
    let modelImpliedOdds = null;
    if (!odds && prediction?.predictions) {
      const mr = prediction.predictions.match_result || {};
      const ou = prediction.predictions.over_under || {};
      const bt = prediction.predictions.btts || {};
      const safe = (p) => (p > 0.01 ? parseFloat((1 / p).toFixed(2)) : null);
      modelImpliedOdds = {
        source: 'model',
        home:  safe(mr.home),
        draw:  safe(mr.draw),
        away:  safe(mr.away),
        over_2_5:  safe(ou.over_2_5),
        under_2_5: safe(ou.under_2_5),
        over_1_5:  safe(ou.over_1_5),
        under_1_5: safe(ou.under_1_5),
        over_3_5:  safe(ou.over_3_5),
        btts_yes:  safe(bt.yes),
        btts_no:   safe(bt.no),
      };
    }

    const fullResponse = {
      ...prediction,
      odds,
      model_implied_odds: modelImpliedOdds,
      meta,
    };

    // Cache the prediction for stability (2 hour TTL)
    await cachePrediction(fixtureId, fullResponse);

    const response = {
      ...fullResponse,
      access: buildAccessPayload(req.access),
    };

    // Trial users: keep confidence_detail but strip detailed analysis
    if (req.access.is_trial) {
      delete response.detailed_analysis;
      delete response.reasoning;
      delete response.value_bets;
      if (response.predictions) {
        delete response.predictions.rejected_picks;
        // Keep recommendation.confidence_detail for trial users
        if (response.predictions.recommendation) {
          delete response.predictions.recommendation.reasons;
        }
      }
      response.trial_limited = true;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Prediction failed", detail: err.message });
  }
});

// ─── GET /predict/:fixtureId/explain — PREMIUM ONLY ─────────────────────────
router.get("/predict/:fixtureId/explain", requireAuth, requirePremiumAccess, async (req, res) => {
  try {
    const bundle = await ensureFixtureData(req.params.fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;
    let prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta,
      odds
    );

    // Run through evaluator for smart pick selection
    try {
      prediction = await evaluatePrediction(prediction);
    } catch (evalErr) {
      console.error('[Evaluator] Failed in explain:', evalErr.message);
    }

    const fullPayload = {
      ...prediction,
      odds,
      meta,
    };

    const explanation = await explainPrediction(fullPayload);

    res.json({
      ...fullPayload,
      explanation,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Explain failed", detail: err.message });
  }
});

// ─── POST /predict/:fixtureId/chat — PREMIUM ONLY ───────────────────────────
router.post("/predict/:fixtureId/chat", requireAuth, requirePremiumAccess, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const bundle = await ensureFixtureData(req.params.fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;
    const prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta,
      odds
    );

    const fullPrediction = {
      ...prediction,
      odds,
      meta,
    };

    const reply = await chatAboutMatch(fullPrediction, history, message);

    res.json({
      reply,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Chat] Failed:", err.message);
    res.status(500).json({ error: "Chat failed", detail: err.message });
  }
});

// ─── GET /tournaments — auth required (trial + premium) ─────────────────────
router.get("/tournaments", requireAuth, requireTrialOrPremium, async (req, res) => {
  try {
    const result = await db.execute(
      `SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`
    );

    res.json({
      total: result.rows.length,
      tournaments: result.rows,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

// ─── GET /stats — auth required (trial + premium) ───────────────────────────
router.get("/stats", requireAuth, requireTrialOrPremium, async (req, res) => {
  try {
    const [total, enriched, historical, teams, tournaments] = await Promise.all([
      db.execute(`SELECT COUNT(*) as count FROM fixtures`),
      db.execute(`SELECT COUNT(*) as count FROM fixtures WHERE enriched = 1`),
      db.execute(`SELECT COUNT(*) as count FROM historical_matches`),
      db.execute(`SELECT COUNT(*) as count FROM teams`),
      db.execute(`SELECT COUNT(*) as count FROM tournaments`),
    ]);

    const totalCount = Number(total.rows[0].count || 0);
    const enrichedCount = Number(enriched.rows[0].count || 0);

    res.json({
      fixtures: {
        total: totalCount,
        enriched: enrichedCount,
        pending: totalCount - enrichedCount,
      },
      historical_matches: Number(historical.rows[0].count || 0),
      teams: Number(teams.rows[0].count || 0),
      tournaments: Number(tournaments.rows[0].count || 0),
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET /acca/daily — Premium only: daily 5-pick ACCA ──────────────────────
router.get("/acca/daily", requirePremiumAccess, async (req, res) => {
  try {
    // Get today's date range
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Fetch cached predictions for today's matches
    const result = await db.execute({
      sql: `
        SELECT p.fixture_id, p.market, p.probability, p.confidence, p.value as prediction_json,
               f.home_team_name, f.away_team_name, f.tournament_name, f.match_date
        FROM predictions p
        JOIN fixtures f ON f.id = p.fixture_id
        WHERE f.match_date >= ? AND f.match_date < ?
        AND p.probability >= 0.55
        ORDER BY p.probability DESC
        LIMIT 20
      `,
      args: [dateStr, tomorrowStr],
    });

    const rows = result.rows || [];

    if (!rows.length) {
      return res.json({
        picks: [],
        message: "No predictions available yet for today's matches.",
      });
    }

    // Parse and score each prediction
    const scored = [];
    for (const row of rows) {
      try {
        const pred = typeof row.prediction_json === 'string'
          ? JSON.parse(row.prediction_json)
          : (row.prediction_json || {});
        const rec = pred?.predictions?.recommendation || {};
        
        // Edge score: probability + value bonus
        const edgeBonus = rec.has_value ? 0.1 : 0;
        const score = (rec.probability || row.probability || 0) + edgeBonus;
        
        // Build a clean one-line reason from the engine's rationale or _reasons array
        const reason = rec.rationale ||
          (rec._reasons && rec._reasons.find(r => !r.startsWith('Rejected') && !r.startsWith('Below'))) ||
          null;

        scored.push({
          fixture_id: row.fixture_id,
          home: row.home_team_name,
          away: row.away_team_name,
          league: row.tournament_name,
          match_date: row.match_date,
          pick: rec.pick || row.market,
          confidence: rec.probability || row.probability,
          odds: rec.market_odds || null,
          has_value: rec.has_value || false,
          reason,
          score,
        });
      } catch {}
    }

    // Sort by score, take top 5
    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, 5);

    // Calculate combined odds — use real odds if available, else estimate from probability
    let combined_odds = null;
    if (picks.length >= 2) {
      combined_odds = picks.reduce((acc, p) => {
        let legOdds;
        if (p.odds && p.odds > 1.05) {
          legOdds = p.odds; // Use real market odds
        } else {
          // Estimate: implied odds from model probability, capped to sensible range
          const prob = p.confidence || 0.6;
          legOdds = Math.min(5.0, Math.max(1.15, parseFloat((1 / prob).toFixed(2))));
        }
        return acc * legOdds;
      }, 1);
      combined_odds = parseFloat(combined_odds.toFixed(2));
    }
    const oddsAreEstimated = picks.some(p => !p.odds || p.odds <= 1.05);

    res.json({
      picks,
      combined_odds,
      odds_are_estimated: oddsAreEstimated,
      count: picks.length,
      date: dateStr,
      disclaimer: "For entertainment purposes. Always gamble responsibly.",
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error('[ACCA] Error:', err.message);
    res.status(500).json({ error: 'Failed to load ACCA' });
  }
});

// ─── GET /acca/yesterday — Premium only: show yesterday's top picks ──────────
router.get("/acca/yesterday", requirePremiumAccess, async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const dayAfter = new Date(yesterday);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);

    const result = await db.execute({
      sql: `
        SELECT p.fixture_id, p.market, p.probability, p.confidence, p.value as prediction_json,
               f.home_team_name, f.away_team_name, f.tournament_name, f.match_date
        FROM predictions p
        JOIN fixtures f ON f.id = p.fixture_id
        WHERE f.match_date >= ? AND f.match_date < ?
        AND p.probability >= 0.55
        ORDER BY p.probability DESC
        LIMIT 20
      `,
      args: [dateStr, dayAfterStr],
    });

    const rows = result.rows || [];
    if (!rows.length) return res.json({ picks: [], date: dateStr });

    const scored = [];
    for (const row of rows) {
      try {
        const pred = typeof row.prediction_json === 'string'
          ? JSON.parse(row.prediction_json)
          : (row.prediction_json || {});
        const rec = pred?.predictions?.recommendation || {};
        const edgeBonus = rec.has_value ? 0.1 : 0;
        const score = (rec.probability || row.probability || 0) + edgeBonus;
        const reason = rec.rationale ||
          (rec._reasons && rec._reasons.find(r => !r.startsWith('Rejected') && !r.startsWith('Below'))) ||
          null;
        scored.push({
          fixture_id: row.fixture_id,
          home: row.home_team_name,
          away: row.away_team_name,
          league: row.tournament_name,
          match_date: row.match_date,
          pick: rec.pick || row.market,
          confidence: rec.probability || row.probability,
          odds: rec.market_odds || null,
          reason,
          score,
        });
      } catch {}
    }

    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, 5);

    res.json({ picks, date: dateStr, access: buildAccessPayload(req.access) });
  } catch (err) {
    console.error('[ACCA Yesterday] Error:', err.message);
    res.status(500).json({ error: 'Failed to load yesterday ACCA' });
  }
});


export default router;

