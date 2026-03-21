import Groq from ‘groq-sdk’;
import dotenv from ‘dotenv’;
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildContext(prediction) {
const { fixture, model, predictions, features, odds, meta } = prediction;
const { homeFeatures, awayFeatures, h2hFeatures } = features;
const f = fixture;
const hf = homeFeatures;
const af = awayFeatures;
const h2h = h2hFeatures;

```
let parsedMeta = meta;
if (typeof meta === 'string') { try { parsedMeta = JSON.parse(meta); } catch { parsedMeta = {}; } }

const standings = parsedMeta?.standings || [];
const homeStats = parsedMeta?.homeStats || null;
const awayStats = parsedMeta?.awayStats || null;
const homeMomentum = parsedMeta?.homeMomentum || null;
const awayMomentum = parsedMeta?.awayMomentum || null;
const homeForm = parsedMeta?.homeForm || [];
const awayForm = parsedMeta?.awayForm || [];

const homeRow = standings.find(r => r.team === f.homeTeam);
const awayRow = standings.find(r => r.team === f.awayTeam);

const fmtStanding = (r) => r ? `${r.team}: P${r.position} Pts:${r.points} W${r.wins}D${r.draws}L${r.losses} GF:${r.goalsFor} GA:${r.goalsAgainst}` : 'N/A';

const fmtForm = (form, teamName) => {
    if (!form || !form.length) return 'No data';
    return form.slice(0, 6).map(m => {
        if (!m.score) return '?';
        const normalized = m.score.replace(/ - /g, '-').replace(/ /g, '');
        const [h, a] = normalized.split('-').map(Number);
        const hl = (m.home || '').toLowerCase();
        const nl = teamName.toLowerCase();
        const isHome = hl.includes(nl.split(' ')[0]) || nl.includes(hl.split(' ')[0]);
        const scored = isHome ? h : a, conceded = isHome ? a : h;
        const r = scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
        return `${r}(${normalized} ${m.home} vs ${m.away})`;
    }).join(', ');
};

const oddsStr = odds ? `Home: ${odds.home || 'N/A'} | Draw: ${odds.draw || 'N/A'} | Away: ${odds.away || 'N/A'} | BTTS Yes: ${odds.btts_yes || 'N/A'} | Over 2.5: ${odds.over_under?.['2.5']?.over || 'N/A'}` : 'No odds available';

return `Match: ${f.homeTeam} vs ${f.awayTeam}
```

Competition: ${prediction.fixture?.tournament || ‘’}

LEAGUE TABLE:
${fmtStanding(homeRow)}
${fmtStanding(awayRow)}

MOMENTUM (last 5, 100%=all wins):
${f.homeTeam}: ${homeMomentum || ‘N/A’}% | ${f.awayTeam}: ${awayMomentum || ‘N/A’}%

RECENT FORM:
${f.homeTeam}: ${fmtForm(homeForm, f.homeTeam)}
${f.awayTeam}: ${fmtForm(awayForm, f.awayTeam)}

H2H (last meetings):
Home wins: ${h2h.home_win_rate !== null ? (h2h.home_win_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Draws: ${h2h.draw_rate !== null ? (h2h.draw_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Away wins: ${h2h.away_win_rate !== null ? (h2h.away_win_rate * 100).toFixed(0) + ‘%’ : ‘N/A’}
H2H avg goals: ${h2h.avg_total_goals || ‘N/A’} | H2H BTTS rate: ${h2h.btts_rate !== null ? (h2h.btts_rate * 100).toFixed(0) + ‘%’ : ‘N/A’}

ENGINE OUTPUT:
xG Home: ${model.lambdaHome} | xG Away: ${model.lambdaAway} | Total xG: ${model.expectedTotalGoals}
Home win: ${(predictions.match_result.home * 100).toFixed(1)}% | Draw: ${(predictions.match_result.draw * 100).toFixed(1)}% | Away win: ${(predictions.match_result.away * 100).toFixed(1)}%
Over 1.5: ${(predictions.over_under.over_1_5 * 100).toFixed(1)}% | Over 2.5: ${(predictions.over_under.over_2_5 * 100).toFixed(1)}% | Over 3.5: ${(predictions.over_under.over_3_5 * 100).toFixed(1)}%
BTTS Yes: ${(predictions.btts.yes * 100).toFixed(1)}%

FORM STATS:
${f.homeTeam}: Avg scored ${hf.avg_scored || ‘N/A’} | Avg conceded ${hf.avg_conceded || ‘N/A’} | Win rate ${hf.win_rate !== null ? (hf.win_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Clean sheet ${hf.clean_sheet_rate !== null ? (hf.clean_sheet_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Failed to score ${hf.scored_over_0_5_rate !== null ? ((1 - hf.scored_over_0_5_rate) * 100).toFixed(0) + ‘%’ : ‘N/A’}
${f.awayTeam}: Avg scored ${af.avg_scored || ‘N/A’} | Avg conceded ${af.avg_conceded || ‘N/A’} | Win rate ${af.win_rate !== null ? (af.win_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Clean sheet ${af.clean_sheet_rate !== null ? (af.clean_sheet_rate * 100).toFixed(0) + ‘%’ : ‘N/A’} | Failed to score ${af.scored_over_0_5_rate !== null ? ((1 - af.scored_over_0_5_rate) * 100).toFixed(0) + ‘%’ : ‘N/A’}

ODDS:
${oddsStr}`;
}

const SYSTEM_PROMPT = `You are an elite football analyst combining statistical modeling and sharp betting logic.
You are NOT a gambling advisor. You are a predictive engine that identifies the BEST VALUE and MOST LOGICAL outcome.
Your goal is to find STRONG EDGES where probability and match dynamics clearly favor a specific outcome.
You MUST always provide a pick. No refusal. No coward picks.

FOR EACH MATCH ANALYSE:

1. MATCH UNDERSTANDING - quality gap, dominant side, motivation
1. PERFORMANCE DATA - form, goals, home/away strength, H2H patterns, attack vs defense mismatch
1. GAME SCRIPT - predict how the match plays out: one-sided dominance? open attacking? cagey/defensive?
1. MARKET - evaluate 1X2, Over/Under, BTTS, Handicap, Team Goals. Pick ONE with CLEAR edge.
1. INTELLIGENT RISK - Over 2.5, BTTS, Handicap are valid if data supports. Avoid Over 0.5 unless truly the only logical pick.

RULES:

- Never refuse
- Never give multiple picks as “best pick” - ONE best pick, ONE alternative pick (different market)
- Avoid ultra-safe useless picks
- Prioritize logical dominance and value
- Alternative pick must be from a DIFFERENT market than best pick
- Keep game_script to 3-4 sharp sentences
- Keep best_pick_reasoning to 2-3 sharp sentences
- Keep alternative_reasoning to 1-2 sentences

Respond ONLY with valid JSON:
{
“game_script”: “3-4 sentences describing how this match will likely play out based on the data”,
“best_pick”: “EXACT market and outcome e.g. ‘Liverpool Win’ or ‘Over 2.5 Goals’ or ‘BTTS Yes’ or ‘Handicap -1 Bayern’”,
“best_pick_confidence”: 75,
“best_pick_reasoning”: “2-3 sentences explaining WHY this is the edge”,
“alternative_pick”: “Different market e.g. ‘Over 2.5 Goals’ or ‘Away Win’ or ‘BTTS No’”,
“alternative_reasoning”: “1-2 sentences”,
“data_warning”: null
}`;

export async function explainPrediction(prediction) {
const context = buildContext(prediction);
try {
const response = await groq.chat.completions.create({
model: ‘llama-3.3-70b-versatile’,
temperature: 0.35,
max_tokens: 800,
messages: [
{ role: ‘system’, content: SYSTEM_PROMPT },
{ role: ‘user’, content: context },
],
});

```
    const raw = response.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        return {
            game_script: raw,
            best_pick: null,
            best_pick_confidence: null,
            best_pick_reasoning: null,
            alternative_pick: null,
            alternative_reasoning: null,
            data_warning: 'Parse failed',
        };
    }
} catch (err) {
    console.error('Groq failed:', err.message);
    return null;
}
```

}

// Match-specific chat function
export async function chatAboutMatch(prediction, chatHistory, userMessage) {
const context = buildContext(prediction);

```
const systemPrompt = `You are ScorePhantom's AI analyst. You have been given full data for ONE specific match: ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam}.
```

MATCH DATA:
${context}

STRICT RULES:

- You ONLY discuss this match. If asked about anything else, politely redirect: “I can only discuss ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam} in this session.”
- Give sharp, data-driven answers
- Keep responses concise - max 4 sentences unless a detailed breakdown is specifically requested
- You can discuss tactics, predictions, markets, player impact, historical patterns - but ONLY for this fixture`;
  
  const messages = [
  { role: ‘system’, content: systemPrompt },
  …chatHistory,
  { role: ‘user’, content: userMessage },
  ];
  
  try {
  const response = await groq.chat.completions.create({
  model: ‘llama-3.3-70b-versatile’,
  temperature: 0.4,
  max_tokens: 400,
  messages,
  });
  return response.choices[0]?.message?.content || ‘Unable to respond.’;
  } catch (err) {
  console.error(‘Groq chat failed:’, err.message);
  return ‘Something went wrong. Try again.’;
  }
  }
