import { Router } from "express";
import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { predict } from "../predictions/poissonEngine.js";
import { explainPrediction, chatAboutMatch } from "../explanations/groqExplainer.js";
import { enrichFixture } from "../enrichment/enrichOne.js";

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

  const odds = await getOdds(fixtureId);
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
    const isTrial = req.access.is_trial;

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
    let fixtures = result.rows;

    // Trial restriction: max 3 leagues, first 2 matches per league
    if (isTrial) {
      const leagueMap = new Map();
      for (const f of fixtures) {
        const league = f.tournament_name || f.league || '__unknown__';
        if (!leagueMap.has(league)) {
          leagueMap.set(league, []);
        }
        leagueMap.get(league).push(f);
      }

      const limitedLeagues = [...leagueMap.entries()].slice(0, 3);
      fixtures = [];
      for (const [, matches] of limitedLeagues) {
        fixtures.push(...matches.slice(0, 2));
      }
    }

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

    const response = {
      ...prediction,
      odds,
      meta,
      access: buildAccessPayload(req.access),
    };

    // Trial users: strip detailed explanation fields, keep only basic prediction
    if (req.access.is_trial) {
      delete response.detailed_analysis;
      delete response.reasoning;
      delete response.value_bets;
      // Strip enhanced prediction data for trial
      if (response.predictions) {
        delete response.predictions.rejected_picks;
        if (response.predictions.recommendation) {
          delete response.predictions.recommendation.reasons;
          delete response.predictions.recommendation.confidence_detail;
          delete response.predictions.recommendation.is_value_bet;
          delete response.predictions.recommendation.value_edge;
        }
        delete response.predictions.matchProfile;
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
    const prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta,
      odds
    );

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

export default router;
