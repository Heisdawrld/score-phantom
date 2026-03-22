import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Remove common prompt-injection patterns from strings
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

function fmtPercent(prob) {
  const n = typeof prob === 'number' ? prob : parseFloat(String(prob).replace('%', ''));
  if (Number.isNaN(n)) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function confidenceFromProbability(probPercent) {
  const n = typeof probPercent === 'number' ? probPercent : parseFloat(String(probPercent).replace('%', ''));
  if (Number.isNaN(n)) return 'LOW';
  if (n >= 70) return 'HIGH';
  if (n >= 60) return 'MEDIUM';
  if (n >= 55) return 'LEAN';
  return 'LOW';
}

function deterministicAlternative(predictions, bestPick) {
  const ranked = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];
  const best = (bestPick || '').trim().toLowerCase();

  const bestCategory =
    ranked.find((m) => String(m.pick || '').trim().toLowerCase() === best)?.market || null;

  const alt = ranked.find((m) => {
    const pick = String(m.pick || '').trim().toLowerCase();
    if (!pick || pick === best) return false;
    if (bestCategory && m.market === bestCategory) return false;
    return true;
  }) || ranked.find((m) => String(m.pick || '').trim().toLowerCase() !== best);

  if (!alt) return null;

  return {
    pick: alt.pick,
    market: alt.market,
    probability: alt.probability,
  };
}

function buildFallbackExplanation(prediction) {
  const { fixture, predictions, features, meta } = prediction;
  const parsedMeta = safeJsonParse(meta, {});
  const standings = Array.isArray(parsedMeta?.standings) ? parsedMeta.standings : [];

  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const mr = predictions?.match_result || {};
  const ranked = Array.isArray(predictions?.ranked_markets) ? predictions.ranked_markets : [];
  const engineTop = ranked[0] || null;

  const homePct = (mr.home ?? 0) * 100;
  const drawPct = (mr.draw ?? 0) * 100;
  const awayPct = (mr.away ?? 0) * 100;

  const homeRow = standings.find((r) => r.team === home);
  const awayRow = standings.find((r) => r.team === away);

  const hf = features?.homeFeatures || {};
  const af = features?.awayFeatures || {};
  const h2h = features?.h2hFeatures || {};

  const alternative = deterministicAlternative(predictions, engineTop?.pick);

  return {
    game_script: `${home} vs ${away} projects with ${homePct.toFixed(0)}% home, ${drawPct.toFixed(0)}% draw, and ${awayPct.toFixed(0)}% away on the current engine. The match profile is driven by recent form, scoring rates, and the stored head-to-head sample. This explanation is fallback-generated because the AI enhancement is unavailable, so the engine output is being shown directly.`,
    engine_verdict: 'CONFIRMED',
    best_pick: engineTop?.pick || 'No Clear Edge',
    best_pick_confidence: parseFloat(String(engineTop?.probability || '0').replace('%', '')) || 0,
    best_pick_reasoning:
      engineTop
        ? `The engine's top-ranked market is ${engineTop.pick} at ${engineTop.probability}. Home form averages ${hf.avg_scored ?? 'N/A'} scored / ${hf.avg_conceded ?? 'N/A'} conceded, away form averages ${af.avg_scored ?? 'N/A'} scored / ${af.avg_conceded ?? 'N/A'} conceded, and the H2H goal environment is ${h2h.avg_total_goals ?? 'N/A'} total goals per game.`
        : 'No clear ranked market is available from the engine output.',
    alternative_pick: alternative?.pick || null,
    alternative_reasoning: alternative
      ? `Alternative angle from a different market category: ${alternative.pick} at ${alternative.probability}.`
      : null,
    data_warning: 'AI enhancement unavailable. Showing engine-aligned explanation only.',
  };
}

function buildContext(prediction) {
  const { fixture, model, predictions, features, odds, meta } = prediction;
  const { homeFeatures: hf = {}, awayFeatures: af = {}, h2hFeatures: h2h = {} } = features || {};

  const parsedMeta = safeJsonParse(meta, {});
  const standings = Array.isArray(parsedMeta?.standings) ? parsedMeta.standings : [];
  const homeMomentum = parsedMeta?.homeMomentum ?? null;
  const awayMomentum = parsedMeta?.awayMomentum ?? null;
  const homeForm = Array.isArray(parsedMeta?.homeForm) ? parsedMeta.homeForm : [];
  const awayForm = Array.isArray(parsedMeta?.awayForm) ? parsedMeta.awayForm : [];
  const h2hRows = Array.isArray(parsedMeta?.h2h) ? parsedMeta.h2h : [];

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
  const engineTop = rankedMarkets[0] || null;
  const alternative = deterministicAlternative(predictions, engineTop?.pick);

  const rankedMarketsStr = rankedMarkets
    .map((m, i) => `${i + 1}. [${m.market}] ${m.pick} - ${m.probability}`)
    .join('\n');

  return {
    summaryText: `MATCH: ${home} vs ${away}

ENGINE TOP PICK (SOURCE OF TRUTH):
${engineTop ? `${engineTop.pick} [${engineTop.market}] at ${engineTop.probability}` : 'No ranked engine pick'}

OPTIONAL ALTERNATIVE PICK:
${alternative ? `${alternative.pick} [${alternative.market}] at ${alternative.probability}` : 'None'}

STANDINGS:
${fmtStanding(homeRow)}
${fmtStanding(awayRow)}

MOMENTUM:
${home}: ${homeMomentum ?? 'N/A'} | ${away}: ${awayMomentum ?? 'N/A'}

RECENT FORM:
${home}: ${fmtForm(homeForm, home)}
${away}: ${fmtForm(awayForm, away)}

H2H SUMMARY:
Home wins: ${h2h.home_win_rate !== null && h2h.home_win_rate !== undefined ? (h2h.home_win_rate * 100).toFixed(0) + '%' : 'N/A'}
Draws: ${h2h.draw_rate !== null && h2h.draw_rate !== undefined ? (h2h.draw_rate * 100).toFixed(0) + '%' : 'N/A'}
Away wins: ${h2h.away_win_rate !== null && h2h.away_win_rate !== undefined ? (h2h.away_win_rate * 100).toFixed(0) + '%' : 'N/A'}
Avg total goals: ${h2h.avg_total_goals ?? 'N/A'}
BTTS rate: ${h2h.btts_rate !== null && h2h.btts_rate !== undefined ? (h2h.btts_rate * 100).toFixed(0) + '%' : 'N/A'}

POISSON OUTPUT:
Home ${((predictions?.match_result?.home ?? 0) * 100).toFixed(1)}%
Draw ${((predictions?.match_result?.draw ?? 0) * 100).toFixed(1)}%
Away ${((predictions?.match_result?.away ?? 0) * 100).toFixed(1)}%
Over 2.5 ${((predictions?.over_under?.over_2_5 ?? 0) * 100).toFixed(1)}%
BTTS Yes ${((predictions?.btts?.yes ?? 0) * 100).toFixed(1)}%

TEAM FORM STATS:
${home}: Avg scored ${hf.avg_scored ?? 'N/A'} | Avg conceded ${hf.avg_conceded ?? 'N/A'} | Win rate ${hf.win_rate != null ? (hf.win_rate * 100).toFixed(0) + '%' : 'N/A'}
${away}: Avg scored ${af.avg_scored ?? 'N/A'} | Avg conceded ${af.avg_conceded ?? 'N/A'} | Win rate ${af.win_rate != null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'}

ODDS:
${oddsStr}

RANKED MARKETS:
${rankedMarketsStr || 'Not available'}`,
    engineTop,
    alternative,
  };
}

const SYSTEM_PROMPT = `You are ScorePhantom's AI EXPLAINER.

You are NOT selecting a new main pick.
You are NOT overriding the engine.
You are NOT inventing a different confidence.
The engine's top-ranked market is the SOURCE OF TRUTH.

YOUR JOB:
1. Explain the engine's top pick clearly and sharply.
2. Mention why it fits the form, standings, momentum, H2H, and probabilities.
3. Suggest one alternative pick ONLY from the supplied ranked markets, preferably from a different market category.
4. Never contradict, replace, or override the engine's top pick.
5. If data is thin, say so briefly.

STRICT RULES:
- best_pick MUST exactly equal the engine top pick from context
- best_pick_confidence should stay close to engine probability and must not be inflated wildly
- engine_verdict must always be "CONFIRMED"
- alternative_pick must come from the supplied alternative or another ranked market, not invented
- Do not claim certainty that the data does not support
- Do not mention you are an AI model
- Keep game_script to 3-4 sharp sentences
- Keep best_pick_reasoning concise and specific
- Keep alternative_reasoning to 1-2 sentences

Respond ONLY in valid JSON:
{
  "game_script": "...",
  "engine_verdict": "CONFIRMED",
  "best_pick": "exact engine top pick",
  "best_pick_confidence": 62,
  "best_pick_reasoning": "...",
  "alternative_pick": "...",
  "alternative_reasoning": "...",
  "data_warning": null
}`;

export async function explainPrediction(prediction) {
  const context = buildContext(prediction);

  // If there is no engine top pick, return deterministic fallback immediately
  if (!context.engineTop?.pick) {
    return buildFallbackExplanation(prediction);
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 650,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context.summaryText },
      ],
    });

    const raw = response.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);

      // Hard-lock the main pick to the engine top pick
      parsed.engine_verdict = 'CONFIRMED';
      parsed.best_pick = context.engineTop.pick;

      const topProb = parseFloat(String(context.engineTop.probability || '0').replace('%', '')) || 0;
      if (
        parsed.best_pick_confidence == null ||
        Number.isNaN(Number(parsed.best_pick_confidence))
      ) {
        parsed.best_pick_confidence = topProb;
      } else {
        // Don't let Groq inflate confidence wildly beyond engine probability
        parsed.best_pick_confidence = Math.min(Number(parsed.best_pick_confidence), topProb + 6);
      }

      if (!parsed.best_pick_reasoning) {
        parsed.best_pick_reasoning = `This confirms the engine's top-ranked market: ${context.engineTop.pick} at ${context.engineTop.probability}.`;
      }

      if (!parsed.alternative_pick && context.alternative?.pick) {
        parsed.alternative_pick = context.alternative.pick;
        parsed.alternative_reasoning = `Alternative angle from the engine's ranked markets: ${context.alternative.pick} at ${context.alternative.probability}.`;
      }

      return parsed;
    } catch {
      return buildFallbackExplanation(prediction);
    }
  } catch (err) {
    console.error('Groq failed:', err.message);
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
- Keep answers sharp, data-driven, and concise
- Maximum 4 sentences unless the user explicitly asks for a detailed breakdown
- You may discuss tactics, markets, risk, form, standings, H2H, and the engine pick
- Do not contradict the engine's official top pick without clearly framing it as a risk discussion, not a replacement`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 350,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: sanitizeContext(userMessage) },
      ],
    });
    return response.choices[0]?.message?.content || 'Unable to respond.';
  } catch (err) {
    console.error('Groq chat failed:', err.message);
    return 'AI analysis is temporarily unavailable. The engine pick remains active.';
  }
}
