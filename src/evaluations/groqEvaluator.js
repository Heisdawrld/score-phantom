import Groq from "groq-sdk";
import dotenv from "dotenv";
import db from "../config/database.js";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---------------------------------------------------------------------------
// Cache — 30 min TTL, max 500 entries with LRU eviction
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_SIZE = 500;
const evaluationCache = new Map(); // key → { ts, value }

// ---------------------------------------------------------------------------
// Persistent DB cache — cross-user, survives restarts (P4.1)
// ---------------------------------------------------------------------------
async function ensureGroqCacheTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS groq_prediction_cache (
        fixture_id TEXT PRIMARY KEY,
        result TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      )
    `);
  } catch (err) {
    console.error('[GroqEvaluator] DB cache table init error:', err.message);
  }
}
ensureGroqCacheTable();

async function dbCacheGet(fixtureId) {
  try {
    const res = await db.execute({
      sql: `SELECT result FROM groq_prediction_cache WHERE fixture_id = ? AND expires_at > datetime('now') LIMIT 1`,
      args: [String(fixtureId)],
    });
    if (res.rows?.[0]?.result) {
      return JSON.parse(res.rows[0].result);
    }
  } catch {}
  return null;
}

async function dbCacheSet(fixtureId, result) {
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO groq_prediction_cache (fixture_id, result, expires_at) VALUES (?, ?, datetime('now', '+6 hours'))`,
      args: [String(fixtureId), JSON.stringify(result)],
    });
  } catch (err) {
    console.error('[GroqEvaluator] DB cache write error:', err.message);
  }
}

function cacheGet(key) {
  const entry = evaluationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    evaluationCache.delete(key);
    return null;
  }
  // LRU: move to end
  evaluationCache.delete(key);
  evaluationCache.set(key, entry);
  return entry;
}

function cacheSet(key, value) {
  // Evict oldest entries if at capacity
  if (evaluationCache.size >= CACHE_MAX_SIZE) {
    const oldest = evaluationCache.keys().next().value;
    evaluationCache.delete(oldest);
  }
  evaluationCache.set(key, { ts: Date.now(), value });
}

// ---------------------------------------------------------------------------
// Smart Rate Limiting — Groq at ~30%
// ---------------------------------------------------------------------------
const GROQ_BUDGET = {
  maxCallsPerHour: 40,
  maxCallsPerDay: 400,
  callsThisHour: 0,
  callsToday: 0,
  hourStart: Date.now(),
  dayStart: Date.now(),
};

let groqCallCounter = 0;

const TOP_LEAGUES = new Set([
  39,   // Premier League
  140,  // La Liga
  78,   // Bundesliga
  135,  // Serie A
  61,   // Ligue 1
  2,    // Champions League
  3,    // Europa League
  848,  // Conference League
  88,   // Eredivisie
  94,   // Primeira Liga
]);

function resetBudgetWindowsIfNeeded() {
  const now = Date.now();
  if (now - GROQ_BUDGET.hourStart > 60 * 60 * 1000) {
    GROQ_BUDGET.callsThisHour = 0;
    GROQ_BUDGET.hourStart = now;
  }
  if (now - GROQ_BUDGET.dayStart > 24 * 60 * 60 * 1000) {
    GROQ_BUDGET.callsToday = 0;
    GROQ_BUDGET.dayStart = now;
  }
}

function isWithinBudget() {
  resetBudgetWindowsIfNeeded();
  return (
    GROQ_BUDGET.callsThisHour < GROQ_BUDGET.maxCallsPerHour &&
    GROQ_BUDGET.callsToday < GROQ_BUDGET.maxCallsPerDay
  );
}

function recordGroqCall() {
  resetBudgetWindowsIfNeeded();
  GROQ_BUDGET.callsThisHour++;
  GROQ_BUDGET.callsToday++;
}

function isHighValueMatch(prediction) {
  const leagueId = prediction?.fixture?.leagueId ?? prediction?.fixture?.league?.id;
  if (TOP_LEAGUES.has(leagueId)) return true;

  // Close game / tight match signals
  if (prediction?.predictions?.tightMatch) return true;
  const drawProb = safeNum(prediction?.predictions?.match_result?.draw, 0);
  if (drawProb >= 0.28) return true; // evenly contested

  // Game script says it's a close affair
  const gameScript = prediction?.predictions?.gameScript?.classification;
  if (gameScript === "close" || gameScript === "cagey" || gameScript === "derby") return true;

  return false;
}

function shouldUseGroq(prediction) {
  if (!isWithinBudget()) return false;

  groqCallCounter++;

  // Use Groq for every match — the thinking layer is critical for quality
  // Budget limits still protect against abuse (40/hr, 400/day)
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildPromptPayload(prediction) {
  const { fixture, predictions, features, meta } = prediction;
  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const rec = predictions?.recommendation || {};
  const ranked = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];
  const hf = features?.homeFeatures || {};
  const af = features?.awayFeatures || {};
  const h2h = features?.h2hFeatures || {};
  const tc = features?.tableContext || {};
  const model = prediction?.model || {};

  const homeStand = standings.find((r) => r.team === home) || null;
  const awayStand = standings.find((r) => r.team === away) || null;

  // Enhanced payload with game script, value detection, confidence types
  const gameScript = predictions?.gameScript || null;
  const valueDetection = predictions?.valueDetection || null;
  const confidenceType = predictions?.confidenceType || null;

  return {
    fixture: `${home} vs ${away}`,
    official_engine_recommendation: rec,
    standings: { home: homeStand, away: awayStand },
    tableContext: tc,
    model,
    homeForm: {
      ...hf,
      // Venue-specific stats (home team at home only) — most important signal
      home_avg_scored: hf.home_avg_scored ?? null,
      home_avg_conceded: hf.home_avg_conceded ?? null,
      home_matches: hf.home_matches ?? 0,
    },
    awayForm: {
      ...af,
      // Venue-specific stats (away team away only)
      away_avg_scored: af.away_avg_scored ?? null,
      away_avg_conceded: af.away_avg_conceded ?? null,
      away_matches: af.away_matches ?? 0,
    },
    h2h,
    gameScript,
    valueDetection,
    confidenceType,
    allowed_candidates: ranked.slice(0, 8).map((m, idx) => ({
      id: idx + 1,
      pick: m.pick,
      market: m.market,
      probability: m.probability,
      raw_probability: m.raw_probability,
      rationale: m.rationale || "",
    })),
  };
}

function isCheapGenericMarket(candidate) {
  const pick = String(candidate?.pick || "").toLowerCase();
  const market = String(candidate?.market || "");

  if (market === "Double Chance" && pick.includes(" or ")) {
    if (pick.includes("draw")) return false;
    return true;
  }

  if (market === "Over/Under" && (pick === "Over 1.5 Goals" || pick === "Under 4.5 Goals")) {
    return true;
  }

  if (market === "Team Goals" && pick.includes("over 0.5")) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Deterministic Fallback
// ---------------------------------------------------------------------------
function deterministicFallback(prediction) {
  const ranked = Array.isArray(prediction?.predictions?.ranked_markets)
    ? prediction.predictions.ranked_markets
    : [];

  const drawProb = safeNum(prediction?.predictions?.match_result?.draw, 0);

  const premium = ranked.filter((m) => {
    const market = String(m.market || "");
    const pick = String(m.pick || "").toLowerCase();
    const prob = safeNum(m.raw_probability, 0);

    if (market === "1X2") return prob >= 0.58;
    if (market === "Draw No Bet") return prob >= 0.61;
    if (market === "Double Chance" && pick.includes("draw")) return prob >= 0.66;
    if (market === "BTTS") return prob >= 0.60;
    if (market === "Over/Under" && (m.pick === "Over 2.5 Goals" || m.pick === "Under 2.5 Goals")) return prob >= 0.60;
    if (market === "Team Goals" && pick.includes("over 1.5")) return prob >= 0.62;
    return false;
  });

  let best = premium[0] || null;

  if (!best && drawProb <= 0.2) {
    best = ranked.find((m) => String(m.market || "") === "Double Chance" && !String(m.pick || "").toLowerCase().includes("draw")) || null;
  }

  const alt = premium.find((m) => m.pick !== best?.pick && m.market !== best?.market)
    || ranked.find((m) => m.pick !== best?.pick)
    || null;

  if (!best || safeNum(best.raw_probability, 0) < 0.55 || isCheapGenericMarket(best)) {
    return {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: 0,
      confidence: "LOW",
      rationale: "Signals are conflicting or too generic. No premium market stands out enough to force.",
      alternative: alt?.pick || null,
      alternative_market: alt?.market || null,
      alternative_probability: safeNum(alt?.raw_probability, null),
      alternative_confidence: alt?.confidence || null,
      no_clear_edge: true,
      decided_by: "deterministic-engine",
    };
  }

  return {
    market: best.market,
    pick: best.pick,
    probability: safeNum(best.raw_probability, 0),
    confidence: best.confidence || "LOW",
    rationale: best.rationale || "Best supported angle from the current evidence board.",
    alternative: alt?.pick || null,
    alternative_market: alt?.market || null,
    alternative_probability: safeNum(alt?.raw_probability, null),
    alternative_confidence: alt?.confidence || null,
    no_clear_edge: false,
    decided_by: "deterministic-engine",
  };
}

// ---------------------------------------------------------------------------
// Enhanced System Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are ScorePhantom's constrained football evaluator.

Your job is to choose the best FINAL betting angle from the ALLOWED CANDIDATES only.

You must reason from many football angles:
1. overall quality gap
2. home vs away strength
3. table position gap
4. points gap
5. title/UCL/relegation pressure
6. momentum gap
7. home scoring consistency
8. away scoring consistency
9. home defensive solidity
10. away defensive solidity
11. recent form
12. venue form
13. H2H relevance
14. H2H BTTS pattern
15. H2H over pattern
16. expected home goals
17. expected away goals
18. expected total goals
19. draw risk
20. favorite reliability
21. underdog resistance
22. open-match potential
23. cagey-match potential
24. whether a safer market is justified
25. whether a specific market is better than a generic one
26. whether the market is premium or cheap
27. whether no clear edge is the honest answer
28. whether straight win is too risky
29. whether BTTS or totals fit better
30. whether DNB/X2/1X is smarter than 12

ADDITIONAL CONTEXT YOU MAY RECEIVE:
- gameScript: classification of the expected game narrative (e.g. "dominant-home", "close", "cagey", "open", "derby"). Use this to weight your market selection — cagey games favour unders/DNB, open games favour BTTS/overs.
- valueDetection: signals from our value engine showing which picks carry genuine value vs. the market. Picks flagged as "no value" should be heavily downweighted.
- confidenceType: the type of confidence backing each candidate (e.g. "statistical", "model-driven", "trend-based", "situational"). Prefer "statistical" and "model-driven" confidence over "situational" for final picks.

STRICT RULES:
- You may ONLY choose from ALLOWED CANDIDATES, or "No Clear Edge".
- Do NOT invent a market.
- Treat "Home or Away" / no-draw double chance as CHEAP by default.
- Only allow "Home or Away" if draw probability is genuinely low.
- Prefer premium markets over generic umbrellas.
- If all candidates are weak, generic, or conflicting, choose "No Clear Edge".
- REJECT picks that are too generic even if they have decent probability — generic picks (e.g. Over 1.5, Under 4.5, Team X Over 0.5) are lazy and low value.
- If valueDetection shows "no value" on the top candidate, seriously consider the next best or "No Clear Edge".
- Confidence must be HIGH, MEDIUM, LEAN, or LOW.
- Return ONLY valid JSON.

JSON:
{
  "pick": "exact candidate pick or No Clear Edge",
  "market": "exact candidate market or No Edge",
  "confidence": "HIGH|MEDIUM|LEAN|LOW",
  "rationale": "2-4 football-specific sentences",
  "alternative": "exact candidate pick or null",
  "alternative_market": "exact candidate market or null",
  "no_clear_edge": true
}
`.trim();

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function evaluatePrediction(prediction) {
  const fixtureId = prediction?.fixture?.id;
  const cacheKey = String(fixtureId || "unknown");

  // 1. Check in-memory cache first (fastest)
  const cached = cacheGet(cacheKey);
  if (cached) {
    prediction.predictions.recommendation = cached.value;
    prediction.predictions.evaluated_by = "groq-evaluator-cache";
    return prediction;
  }

  // 1b. Check persistent DB cache (cross-user, survives restarts — P4.1)
  const dbCached = await dbCacheGet(cacheKey);
  if (dbCached) {
    cacheSet(cacheKey, dbCached); // also warm in-memory cache
    prediction.predictions.recommendation = dbCached;
    prediction.predictions.evaluated_by = "groq-evaluator-cache";
    return prediction;
  }

  // 2. Decide: Groq or deterministic?
  const useGroq = shouldUseGroq(prediction);

  if (!useGroq) {
    // Deterministic path — skip Groq entirely
    const fallback = deterministicFallback(prediction);
    cacheSet(cacheKey, fallback);
    await dbCacheSet(cacheKey, fallback);
    prediction.predictions.recommendation = fallback;
    prediction.predictions.evaluated_by = "deterministic-engine";
    return prediction;
  }

  // 3. Groq path
  const payload = buildPromptPayload(prediction);

  try {
    recordGroqCall();

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 420,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const allowed = new Map(
      payload.allowed_candidates.map((c) => [`${c.pick}__${c.market}`, c])
    );

    let result;

    if (parsed.pick === "No Clear Edge") {
      result = deterministicFallback(prediction);
      result.pick = "No Clear Edge";
      result.market = "No Edge";
      result.no_clear_edge = true;
      result.confidence = parsed.confidence || "LOW";
      result.rationale = parsed.rationale || result.rationale;
      result.decided_by = "groq-evaluator";
    } else {
      const mainKey = `${parsed.pick}__${parsed.market}`;
      const chosen = allowed.get(mainKey);

      if (!chosen || isCheapGenericMarket(chosen)) {
        result = deterministicFallback(prediction);
        result.decided_by = "groq-evaluator"; // Groq tried but was overridden
      } else {
        const altKey = `${parsed.alternative || ""}__${parsed.alternative_market || ""}`;
        const alt = allowed.get(altKey) || null;

        result = {
          market: chosen.market,
          pick: chosen.pick,
          probability: safeNum(chosen.raw_probability, 0),
          confidence: parsed.confidence || "LOW",
          rationale: parsed.rationale || chosen.rationale || "Best supported football angle.",
          alternative: alt?.pick || null,
          alternative_market: alt?.market || null,
          alternative_probability: alt ? safeNum(alt.raw_probability, 0) : null,
          alternative_confidence: alt?.confidence || null,
          no_clear_edge: !!parsed.no_clear_edge,
          decided_by: "groq-evaluator",
        };
      }
    }

    cacheSet(cacheKey, result);
    await dbCacheSet(cacheKey, result); // persist for cross-user caching (P4.1)
    prediction.predictions.recommendation = result;
    prediction.predictions.evaluated_by = "groq-evaluator";
    return prediction;
  } catch (err) {
    console.error("[GroqEvaluator] Groq call failed, using deterministic fallback:", err.message);
    const fallback = deterministicFallback(prediction);
    cacheSet(cacheKey, fallback);
    await dbCacheSet(cacheKey, fallback);
    prediction.predictions.recommendation = fallback;
    prediction.predictions.evaluated_by = "deterministic-engine";
    return prediction;
  }
}
