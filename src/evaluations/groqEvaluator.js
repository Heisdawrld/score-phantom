import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CACHE_TTL_MS = 20 * 60 * 1000;
const evaluationCache = new Map();

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeScore(score) {
  return String(score || "").replace(/ - /g, "-").replace(/\s+/g, "").trim();
}

function parseScore(score) {
  const s = normalizeScore(score);
  if (!s.includes("-")) return null;
  const [a, b] = s.split("-").map(Number);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { home: a, away: b };
}

function summarizeForm(form, teamName) {
  if (!Array.isArray(form) || !form.length) {
    return {
      scoredIn: 0,
      cleanSheets: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      avgScored: 0,
      avgConceded: 0,
    };
  }

  let scoredIn = 0;
  let cleanSheets = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let scored = 0;
  let conceded = 0;
  let count = 0;

  for (const m of form.slice(0, 6)) {
    const parsed = parseScore(m.score);
    if (!parsed) continue;

    const teamLower = String(teamName || "").toLowerCase().split(" ")[0];
    const homeLower = String(m.home || "").toLowerCase();
    const isHome = homeLower.includes(teamLower);

    const gf = isHome ? parsed.home : parsed.away;
    const ga = isHome ? parsed.away : parsed.home;

    if (gf > 0) scoredIn++;
    if (ga === 0) cleanSheets++;
    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;

    scored += gf;
    conceded += ga;
    count++;
  }

  return {
    scoredIn,
    cleanSheets,
    wins,
    draws,
    losses,
    avgScored: count ? +(scored / count).toFixed(2) : 0,
    avgConceded: count ? +(conceded / count).toFixed(2) : 0,
  };
}

function summarizeH2H(h2h, homeTeam, awayTeam) {
  if (!Array.isArray(h2h) || !h2h.length) {
    return {
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      btts: 0,
      overs25: 0,
      total: 0,
    };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let btts = 0;
  let overs25 = 0;
  let total = 0;

  const homeKey = String(homeTeam || "").toLowerCase().split(" ")[0];
  const awayKey = String(awayTeam || "").toLowerCase().split(" ")[0];

  for (const m of h2h.slice(0, 6)) {
    const parsed = parseScore(m.score);
    if (!parsed) continue;

    const listedHome = String(m.home || "").toLowerCase();
    const isHomePerspective = listedHome.includes(homeKey) || !listedHome.includes(awayKey);

    const homeGoals = isHomePerspective ? parsed.home : parsed.away;
    const awayGoals = isHomePerspective ? parsed.away : parsed.home;

    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals < awayGoals) awayWins++;
    else draws++;

    if (homeGoals > 0 && awayGoals > 0) btts++;
    if (homeGoals + awayGoals > 2) overs25++;
    total++;
  }

  return { homeWins, draws, awayWins, btts, overs25, total };
}

function buildAngles(prediction) {
  const { fixture, predictions, features, meta } = prediction;
  const parsedMeta = safeJsonParse(meta, {});
  const standings = Array.isArray(parsedMeta?.standings) ? parsedMeta.standings : [];
  const homeForm = Array.isArray(parsedMeta?.homeForm) ? parsedMeta.homeForm : [];
  const awayForm = Array.isArray(parsedMeta?.awayForm) ? parsedMeta.awayForm : [];
  const h2h = Array.isArray(parsedMeta?.h2h) ? parsedMeta.h2h : [];

  const home = fixture.homeTeam;
  const away = fixture.awayTeam;

  const mr = predictions?.match_result || {};
  const ranked = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];

  const hf = features?.homeFeatures || {};
  const af = features?.awayFeatures || {};
  const h2hf = features?.h2hFeatures || {};
  const tc = features?.tableContext || {};
  const model = prediction?.model || {};

  const homeStand = standings.find((r) => r.team === home);
  const awayStand = standings.find((r) => r.team === away);

  const homeFormSummary = summarizeForm(homeForm, home);
  const awayFormSummary = summarizeForm(awayForm, away);
  const h2hSummary = summarizeH2H(h2h, home, away);

  const drawProb = safeNum(mr.draw, 0);
  const homeProb = safeNum(mr.home, 0);
  const awayProb = safeNum(mr.away, 0);

  const strongest = Math.max(homeProb, drawProb, awayProb);
  const strongerSide =
    homeProb > awayProb ? home :
    awayProb > homeProb ? away :
    "none";

  const angles = [
    { key: "overall_quality_gap", value: safeNum(tc.points_gap, 0), note: "overall team quality and points gap" },
    { key: "table_position_gap", value: safeNum(tc.position_gap, 0), note: "table position gap" },
    { key: "title_or_ucl_pressure", value: `${tc.home_context || "unknown"} vs ${tc.away_context || "unknown"}`, note: "title/UCL/relegation pressure" },
    { key: "momentum_gap", value: safeNum(tc.momentum_gap, 0), note: "momentum gap" },

    { key: "home_home_strength", value: safeNum(hf.weighted_points_per_match, 0), note: "home team home strength" },
    { key: "away_away_strength", value: safeNum(af.weighted_points_per_match, 0), note: "away team away strength" },
    { key: "home_scoring_rate", value: safeNum(hf.avg_scored, 0), note: "home team scoring average" },
    { key: "away_scoring_rate", value: safeNum(af.avg_scored, 0), note: "away team scoring average" },
    { key: "home_conceding_rate", value: safeNum(hf.avg_conceded, 0), note: "home team conceding average" },
    { key: "away_conceding_rate", value: safeNum(af.avg_conceded, 0), note: "away team conceding average" },

    { key: "home_scores_consistently", value: homeFormSummary.scoredIn, note: "home scored in recent home games" },
    { key: "away_scores_consistently", value: awayFormSummary.scoredIn, note: "away scored in recent away games" },
    { key: "home_clean_sheets", value: homeFormSummary.cleanSheets, note: "home clean sheets" },
    { key: "away_clean_sheets", value: awayFormSummary.cleanSheets, note: "away clean sheets" },

    { key: "home_recent_wins", value: homeFormSummary.wins, note: "home recent wins" },
    { key: "away_recent_wins", value: awayFormSummary.wins, note: "away recent wins" },
    { key: "home_recent_losses", value: homeFormSummary.losses, note: "home recent losses" },
    { key: "away_recent_losses", value: awayFormSummary.losses, note: "away recent losses" },

    { key: "home_streak_score", value: safeNum(hf.streak_score, 0), note: "home streak score" },
    { key: "away_streak_score", value: safeNum(af.streak_score, 0), note: "away streak score" },

    { key: "h2h_home_wins", value: h2hSummary.homeWins, note: "home H2H wins in displayed sample" },
    { key: "h2h_away_wins", value: h2hSummary.awayWins, note: "away H2H wins in displayed sample" },
    { key: "h2h_draws", value: h2hSummary.draws, note: "H2H draws in displayed sample" },
    { key: "h2h_btts", value: h2hSummary.btts, note: "H2H both teams scored count" },
    { key: "h2h_over25", value: h2hSummary.overs25, note: "H2H over 2.5 count" },

    { key: "expected_home_goals", value: safeNum(model.lambdaHome, 0), note: "model expected home goals" },
    { key: "expected_away_goals", value: safeNum(model.lambdaAway, 0), note: "model expected away goals" },
    { key: "expected_total_goals", value: safeNum(model.expectedTotalGoals, 0), note: "model expected total goals" },

    { key: "home_win_probability", value: homeProb, note: "home win probability" },
    { key: "draw_probability", value: drawProb, note: "draw probability" },
    { key: "away_win_probability", value: awayProb, note: "away win probability" },

    { key: "open_match_signal", value: safeNum(features?.combinedSignals?.over_2_5_signal, 0), note: "open match signal" },
    { key: "btts_signal", value: safeNum(features?.combinedSignals?.btts_signal, 0), note: "BTTS signal" },
    { key: "stronger_side", value: strongerSide, note: "which side the raw model leans toward" },
    { key: "top_ranked_candidates", value: ranked.slice(0, 8).map((m) => `${m.pick} [${m.market}] ${m.probability}`).join(" | "), note: "top ranked markets" },
  ];

  return {
    home,
    away,
    strongest,
    drawProb,
    ranked,
    angles,
    homeStand,
    awayStand,
    homeFormSummary,
    awayFormSummary,
    h2hSummary,
  };
}

function buildPromptPayload(prediction) {
  const { fixture, predictions, features } = prediction;
  const { home, away, angles, ranked, homeStand, awayStand, homeFormSummary, awayFormSummary, h2hSummary } = buildAngles(prediction);

  const allowedCandidates = ranked.slice(0, 8).map((m, idx) => ({
    id: idx + 1,
    pick: m.pick,
    market: m.market,
    probability: m.probability,
    rationale: m.rationale || "",
  }));

  const top = predictions?.recommendation || null;

  return {
    fixture: `${home} vs ${away}`,
    engine_recommendation: top,
    standings: {
      home: homeStand || null,
      away: awayStand || null,
    },
    form_summary: {
      home: homeFormSummary,
      away: awayFormSummary,
    },
    h2h_summary: h2hSummary,
    model: prediction.model || {},
    combinedSignals: features?.combinedSignals || {},
    reasoning_angles: angles,
    allowed_candidates: allowedCandidates,
  };
}

function deterministicFallback(prediction) {
  const ranked = Array.isArray(prediction?.predictions?.ranked_markets)
    ? prediction.predictions.ranked_markets
    : [];

  const filtered = ranked.filter((m) => {
    const pick = String(m.pick || "").toLowerCase();
    const market = String(m.market || "");
    const prob = safeNum(m.raw_probability, 0);

    if (pick.includes(" or ") && pick.includes("draw")) return prob >= 0.66;
    if (market === "Draw No Bet") return prob >= 0.61;
    if (market === "1X2") return prob >= 0.58;
    if (market === "BTTS") return prob >= 0.60;
    if (market === "Over/Under" && (pick === "Over 2.5 Goals" || pick === "Under 2.5 Goals")) return prob >= 0.60;
    if (market === "Team Goals" && pick.includes("Over 1.5")) return prob >= 0.62;
    return false;
  });

  const best = filtered[0] || ranked[0] || null;
  const alt = filtered.find((m) => m.market !== best?.market) || ranked.find((m) => m.pick !== best?.pick) || null;

  if (!best || safeNum(best.raw_probability, 0) < 0.55) {
    return {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: 0.0,
      confidence: "LOW",
      rationale: "Conflicting signals or weak market quality. No candidate is strong enough to force.",
      alternative: alt?.pick || null,
      alternative_market: alt?.market || null,
      alternative_probability: safeNum(alt?.raw_probability, null),
      alternative_confidence: alt?.confidence || null,
      no_clear_edge: true,
      decided_by: "fallback",
    };
  }

  return {
    market: best.market,
    pick: best.pick,
    probability: safeNum(best.raw_probability, 0),
    confidence: best.confidence || "LOW",
    rationale: best.rationale || "Best fit from current structured evidence.",
    alternative: alt?.pick || null,
    alternative_market: alt?.market || null,
    alternative_probability: safeNum(alt?.raw_probability, null),
    alternative_confidence: alt?.confidence || null,
    no_clear_edge: false,
    decided_by: "fallback",
  };
}

const SYSTEM_PROMPT = `
You are ScorePhantom's constrained football evaluator.

Your job is NOT to freestyle.
Your job is to choose the best final betting angle from the ALLOWED CANDIDATES only.

You must reason from many football angles before deciding, including:
1. overall quality gap
2. home-vs-away strength
3. table position gap
4. points gap
5. title/UCL/relegation pressure
6. momentum gap
7. home scoring consistency
8. away scoring consistency
9. home defensive stability
10. away defensive stability
11. recent home form
12. recent away form
13. last-5 trend
14. last-10 trend proxy
15. streak quality
16. volatility vs consistency
17. H2H home/away trend
18. H2H BTTS trend
19. H2H over trend
20. expected home goals
21. expected away goals
22. expected total goals
23. draw risk
24. favorite reliability
25. underdog resistance
26. open-match potential
27. cagey-match potential
28. team-goals angle
29. whether a safer market is better than a straight winner
30. whether no clear edge is the honest answer

CRITICAL RULES:
- You can ONLY choose a main pick from ALLOWED CANDIDATES, or "No Clear Edge".
- Do NOT invent a market that is not in allowed candidates.
- Do NOT choose cheap generic markets unless they are genuinely the best supported angle.
- "Home or Away" / no-draw should be treated as low-quality unless draw risk is truly low.
- If all allowed candidates are weak or conflicting, choose "No Clear Edge".
- Confidence must be one of: HIGH, MEDIUM, LEAN, LOW.
- Return ONLY valid JSON.

JSON format:
{
  "pick": "exact candidate pick or No Clear Edge",
  "market": "exact candidate market or No Edge",
  "confidence": "HIGH|MEDIUM|LEAN|LOW",
  "rationale": "2-4 sentences, football-specific",
  "alternative": "exact candidate pick or null",
  "alternative_market": "exact candidate market or null",
  "no_clear_edge": true
}
`.trim();

export async function evaluatePrediction(prediction) {
  const fixtureId = prediction?.fixture?.id;
  const cacheKey = String(fixtureId || "unknown");
  const cached = evaluationCache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    prediction.predictions.recommendation = cached.value;
    prediction.predictions.evaluated_by = "groq-evaluator-cache";
    return prediction;
  }

  const payload = buildPromptPayload(prediction);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.15,
      max_tokens: 450,
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
      const fallback = deterministicFallback(prediction);
      result = {
        ...fallback,
        pick: "No Clear Edge",
        market: "No Edge",
        confidence: parsed.confidence || fallback.confidence || "LOW",
        rationale: parsed.rationale || fallback.rationale,
        no_clear_edge: true,
        decided_by: "groq-evaluator",
      };
    } else {
      const mainKey = `${parsed.pick}__${parsed.market}`;
      const chosen = allowed.get(mainKey);

      if (!chosen) {
        result = deterministicFallback(prediction);
      } else {
        const altKey = `${parsed.alternative || ""}__${parsed.alternative_market || ""}`;
        const alt = allowed.get(altKey) || null;

        result = {
          market: chosen.market,
          pick: chosen.pick,
          probability: safeNum(String(chosen.probability).replace("%", ""), 0) / 100,
          confidence: parsed.confidence || "LOW",
          rationale: parsed.rationale || chosen.rationale || "Best supported football angle.",
          alternative: alt?.pick || null,
          alternative_market: alt?.market || null,
          alternative_probability: alt ? safeNum(String(alt.probability).replace("%", ""), 0) / 100 : null,
          alternative_confidence: alt ? "LEAN" : null,
          no_clear_edge: !!parsed.no_clear_edge,
          decided_by: "groq-evaluator",
        };
      }
    }

    evaluationCache.set(cacheKey, { ts: Date.now(), value: result });
    prediction.predictions.recommendation = result;
    prediction.predictions.evaluated_by = "groq-evaluator";
    return prediction;
  } catch (err) {
    console.error("[GroqEvaluator] Failed:", err.message);
    const fallback = deterministicFallback(prediction);
    evaluationCache.set(cacheKey, { ts: Date.now(), value: fallback });
    prediction.predictions.recommendation = fallback;
    prediction.predictions.evaluated_by = "fallback-evaluator";
    return prediction;
  }
}
