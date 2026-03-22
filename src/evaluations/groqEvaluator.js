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

  return {
    fixture: `${home} vs ${away}`,
    official_engine_recommendation: rec,
    standings: { home: homeStand, away: awayStand },
    tableContext: tc,
    model,
    homeForm: hf,
    awayForm: af,
    h2h,
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
      decided_by: "fallback",
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
    decided_by: "fallback",
  };
}

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

STRICT RULES:
- You may ONLY choose from ALLOWED CANDIDATES, or "No Clear Edge".
- Do NOT invent a market.
- Treat "Home or Away" / no-draw double chance as CHEAP by default.
- Only allow "Home or Away" if draw probability is genuinely low.
- Prefer premium markets over generic umbrellas.
- If all candidates are weak, generic, or conflicting, choose "No Clear Edge".
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
