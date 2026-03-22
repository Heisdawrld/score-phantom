import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function sanitizeContext(str) {
  if (!str) return '';
  const patterns = [
    /ignore previous instructions/gi,
    /developer mode/gi,
    /system override/gi,
    /enable jailbreak/gi,
    /jailbreak/gi,
    /pretend you are/gi,
  ];
  let sanitized = String(str);
  patterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '');
  });
  return sanitized.trim();
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeScore(score) {
  return String(score || '').replace(/ - /g, '-').replace(/\s+/g, '').trim();
}

function parseScore(score) {
  const s = normalizeScore(score);
  if (!s.includes('-')) return null;
  const [a, b] = s.split('-').map(Number);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { home: a, away: b };
}

function deterministicAlternative(predictions, lockedPick) {
  const ranked = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];
  const locked = String(lockedPick || '').trim().toLowerCase();

  const lockedCategory =
    ranked.find((m) => String(m.pick || '').trim().toLowerCase() === locked)?.market || null;

  const alt = ranked.find((m) => {
    const pick = String(m.pick || '').trim().toLowerCase();
    if (!pick || pick === locked) return false;
    if (lockedCategory && m.market === lockedCategory) return false;
    return true;
  }) || ranked.find((m) => String(m.pick || '').trim().toLowerCase() !== locked);

  if (!alt) return null;

  return {
    pick: alt.pick,
    market: alt.market,
    probability: alt.probability,
  };
}

function buildFallbackExplanation(prediction) {
  const { fixture, predictions, features, meta } = prediction;
  const rec = predictions?.recommendation || {};
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const hf = features?.homeFeatures || {};
  const af = features?.awayFeatures || {};
  const tc = features?.tableContext || {};
  const alt = rec.alternative
    ? {
        pick: rec.alternative,
        market: rec.alternative_market,
        probability: rec.alternative_probability != null ? `${(rec.alternative_probability * 100).toFixed(1)}%` : null,
      }
    : deterministicAlternative(predictions, rec.pick);

  return {
    game_script: `${home} vs ${away} has been evaluated using form, venue splits, standings, momentum, H2H, and the ranked market board. The final pick is locked to the evaluator result, not invented by the explainer. This fallback explanation is being shown because richer AI wording is unavailable.`,
    engine_verdict: "CONFIRMED",
    best_pick: rec.pick || "No Clear Edge",
    best_pick_confidence: rec.probability != null ? Math.round(rec.probability * 100) : 0,
    best_pick_reasoning: rec.rationale || `${home} averages ${hf.avg_scored ?? "N/A"} scored and ${hf.avg_conceded ?? "N/A"} conceded at home form level, while ${away} averages ${af.avg_scored ?? "N/A"} scored and ${af.avg_conceded ?? "N/A"} conceded away. Table and momentum gap are ${tc.points_gap ?? "N/A"} points and ${tc.momentum_gap ?? "N/A"} momentum.`,
    alternative_pick: alt?.pick || null,
    alternative_reasoning: alt ? `Alternative angle from the ranked market board: ${alt.pick}${alt.probability ? ` at ${alt.probability}` : ""}.` : null,
    data_warning: "AI wording unavailable. Showing evaluator-aligned explanation.",
  };
}

function buildContext(prediction) {
  const { fixture, model, predictions, features, odds, meta } = prediction;
  const { homeFeatures: hf = {}, awayFeatures: af = {}, h2hFeatures: h2h = {}, tableContext: tc = {} } = features || {};

  const parsedMeta = safeJsonParse(meta, {});
  const standings = Array.isArray(parsedMeta?.standings) ? parsedMeta.standings : [];
  const homeMomentum = parsedMeta?.homeMomentum ?? null;
  const awayMomentum = parsedMeta?.awayMomentum ?? null;
  const homeForm = Array.isArray(parsedMeta?.homeForm) ? parsedMeta.homeForm : [];
  const awayForm = Array.isArray(parsedMeta?.awayForm) ? parsedMeta.awayForm : [];

  const home = sanitizeContext(fixture.homeTeam);
  const away = sanitizeContext(fixture.awayTeam);

  const homeRow = standings.find((r) => r.team === fixture.homeTeam);
  const awayRow = standings.find((r) => r.team === fixture.awayTeam);

  const fmtStanding = (r) =>
    r
      ? `${r.team}: Pos ${r.position} | Pts ${r.points} | W${r.wins} D${r.draws} L${r.losses}`
      : 'N/A';

  const fmtForm = (form, teamName) => {
    if (!form.length) return 'No data';
    return form.slice(0, 6).map((m) => {
      const parsed = parseScore(m.score);
      if (!parsed) return '?';
      const isHome = String(m.home || '').toLowerCase().includes(teamName.toLowerCase().split(' ')[0]);
      const scored = isHome ? parsed.home : parsed.away;
      const conceded = isHome ? parsed.away : parsed.home;
      const r = scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
      return `${r}(${normalizeScore(m.score)})`;
    }).join(' ');
  };

  const oddsStr = odds
    ? `Home: ${odds.home || 'N/A'} | Draw: ${odds.draw || 'N/A'} | Away: ${odds.away || 'N/A'}`
    : 'No odds';

  const rankedMarkets = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];
  const rec = predictions?.recommendation || {};
  const alt = rec.alternative
    ? {
        pick: rec.alternative,
        market: rec.alternative_market,
        probability: rec.alternative_probability != null ? `${(rec.alternative_probability * 100).toFixed(1)}%` : null,
      }
    : deterministicAlternative(predictions, rec.pick);

  const rankedMarketsStr = rankedMarkets
    .map((m, i) => `${i + 1}. [${m.market}] ${m.pick} - ${m.probability}`)
    .join('\n');

  return {
    lockedRecommendation: rec,
    summaryText: `MATCH: ${home} vs ${away}

LOCKED OFFICIAL PICK:
${rec.pick || "No Clear Edge"} [${rec.market || "No Edge"}] ${rec.probability != null ? `${(rec.probability * 100).toFixed(1)}%` : ""}

ALTERNATIVE:
${alt ? `${alt.pick} [${alt.market}] ${alt.probability || ""}` : "None"}

STANDINGS:
${fmtStanding(homeRow)}
${fmtStanding(awayRow)}

TABLE CONTEXT:
Points gap: ${tc.points_gap ?? 'N/A'}
Position gap: ${tc.position_gap ?? 'N/A'}
Momentum gap: ${tc.momentum_gap ?? 'N/A'}
Home context: ${tc.home_context ?? 'N/A'}
Away context: ${tc.away_context ?? 'N/A'}

RECENT FORM:
${home}: ${fmtForm(homeForm, home)}
${away}: ${fmtForm(awayForm, away)}

POISSON OUTPUT:
Home ${((predictions?.match_result?.home ?? 0) * 100).toFixed(1)}%
Draw ${((predictions?.match_result?.draw ?? 0) * 100).toFixed(1)}%
Away ${((predictions?.match_result?.away ?? 0) * 100).toFixed(1)}%

MODEL:
Lambda home ${model?.lambdaHome ?? 'N/A'}
Lambda away ${model?.lambdaAway ?? 'N/A'}
Expected total goals ${model?.expectedTotalGoals ?? 'N/A'}

TEAM FORM STATS:
${home}: Avg scored ${hf.avg_scored ?? 'N/A'} | Avg conceded ${hf.avg_conceded ?? 'N/A'} | Win rate ${hf.win_rate != null ? (hf.win_rate * 100).toFixed(0) + '%' : 'N/A'}
${away}: Avg scored ${af.avg_scored ?? 'N/A'} | Avg conceded ${af.avg_conceded ?? 'N/A'} | Win rate ${af.win_rate != null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'}

H2H:
Avg total goals ${h2h.avg_total_goals ?? 'N/A'}
BTTS ${h2h.btts_rate != null ? (h2h.btts_rate * 100).toFixed(0) + '%' : 'N/A'}

ODDS:
${oddsStr}

RANKED MARKETS:
${rankedMarketsStr || 'Not available'}`,
  };
}

const SYSTEM_PROMPT = `You are ScorePhantom's AI explainer.

You are NOT selecting a new pick.
You are NOT overriding the evaluator.
The locked official recommendation is the final source of truth.

Your job:
1. Explain the locked official recommendation sharply.
2. Explain why it fits form, standings, momentum, H2H, and probabilities.
3. Mention the alternative briefly if present.
4. Never contradict the official pick.
5. If the official pick is "No Clear Edge", explain why forcing a market would be weak.

STRICT:
- best_pick must exactly equal the locked official recommendation
- engine_verdict must always be "CONFIRMED"
- do not invent a new market
- do not inflate confidence wildly
- return only valid JSON

JSON:
{
  "game_script": "...",
  "engine_verdict": "CONFIRMED",
  "best_pick": "...",
  "best_pick_confidence": 62,
  "best_pick_reasoning": "...",
  "alternative_pick": "...",
  "alternative_reasoning": "...",
  "data_warning": null
}`;

export async function explainPrediction(prediction) {
  const rec = prediction?.predictions?.recommendation || {};
  if (!rec.pick) {
    return buildFallbackExplanation(prediction);
  }

  const context = buildContext(prediction);

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 420,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context.summaryText },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    parsed.engine_verdict = 'CONFIRMED';
    parsed.best_pick = rec.pick;
    parsed.best_pick_confidence = rec.probability != null
      ? Math.min(Number(parsed.best_pick_confidence || Math.round(rec.probability * 100)), Math.round(rec.probability * 100) + 5)
      : Number(parsed.best_pick_confidence || 0);

    if (!parsed.best_pick_reasoning) {
      parsed.best_pick_reasoning = rec.rationale || 'This pick is locked to the evaluator result.';
    }

    if (!parsed.alternative_pick && rec.alternative) {
      parsed.alternative_pick = rec.alternative;
      parsed.alternative_reasoning = rec.alternative_market
        ? `Alternative from evaluator: ${rec.alternative} [${rec.alternative_market}].`
        : `Alternative from evaluator: ${rec.alternative}.`;
    }

    return parsed;
  } catch (err) {
    console.error('Groq explain failed:', err.message);
    return buildFallbackExplanation(prediction);
  }
}

export async function chatAboutMatch(prediction, chatHistory, userMessage) {
  const context = buildContext(prediction);

  const systemPrompt = `You are ScorePhantom's match analyst for ONE fixture only: ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam}.

LOCKED MATCH DATA:
${context.summaryText}

RULES:
- Discuss only this match
- If asked about another match, reply: "I can only discuss ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam} in this session."
- Keep answers sharp and data-driven
- Maximum 5 sentences unless the user asks for full detail
- Respect the locked official recommendation, but you may discuss risk and alternatives`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: sanitizeContext(userMessage) },
      ],
    });

    return response.choices?.[0]?.message?.content || 'Unable to respond.';
  } catch (err) {
    console.error('Groq chat failed:', err.message);
    return 'AI analysis is temporarily unavailable. The locked evaluator pick remains active.';
  }
}
