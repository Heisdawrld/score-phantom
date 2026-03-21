import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildContext(prediction) {
    const { fixture, model, predictions, features, odds, meta } = prediction;
    const { homeFeatures: hf, awayFeatures: af, h2hFeatures: h2h } = features;

    let parsedMeta = meta;
    if (typeof meta === 'string') { try { parsedMeta = JSON.parse(meta); } catch { parsedMeta = {}; } }

    const standings = parsedMeta?.standings || [];
    const homeMomentum = parsedMeta?.homeMomentum || null;
    const awayMomentum = parsedMeta?.awayMomentum || null;
    const homeForm = parsedMeta?.homeForm || [];
    const awayForm = parsedMeta?.awayForm || [];

    const homeRow = standings.find(r => r.team === fixture.homeTeam);
    const awayRow = standings.find(r => r.team === fixture.awayTeam);

    const fmtStanding = (r) => r
        ? `${r.team}: Pos ${r.position} | Pts ${r.points} | W${r.wins} D${r.draws} L${r.losses} | GF${r.goalsFor} GA${r.goalsAgainst}`
        : 'N/A';

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
            return `${r}(${normalized})`;
        }).join(' ');
    };

    const oddsStr = odds
        ? `Home: ${odds.home || 'N/A'} | Draw: ${odds.draw || 'N/A'} | Away: ${odds.away || 'N/A'}`
        : 'No odds';

    const rankedMarkets = (predictions.ranked_markets || [])
        .map((m, i) => `  ${i + 1}. [${m.market}] ${m.pick} - Engine probability: ${m.probability}`)
        .join('\n');

    return `=== MATCH: ${fixture.homeTeam} vs ${fixture.awayTeam} ===

STANDINGS:
${fmtStanding(homeRow)}
${fmtStanding(awayRow)}

MOMENTUM (last 5 games, 100% = all wins):
${fixture.homeTeam}: ${homeMomentum || 'N/A'}% | ${fixture.awayTeam}: ${awayMomentum || 'N/A'}%

RECENT FORM:
${fixture.homeTeam}: ${fmtForm(homeForm, fixture.homeTeam)}
${fixture.awayTeam}: ${fmtForm(awayForm, fixture.awayTeam)}

H2H RECORD (last meetings):
Home wins: ${h2h.home_win_rate !== null ? (h2h.home_win_rate * 100).toFixed(0) + '%' : 'N/A'} | Draws: ${h2h.draw_rate !== null ? (h2h.draw_rate * 100).toFixed(0) + '%' : 'N/A'} | Away wins: ${h2h.away_win_rate !== null ? (h2h.away_win_rate * 100).toFixed(0) + '%' : 'N/A'}
H2H avg goals per game: ${h2h.avg_total_goals || 'N/A'} | H2H BTTS rate: ${h2h.btts_rate !== null ? (h2h.btts_rate * 100).toFixed(0) + '%' : 'N/A'}

POISSON ENGINE OUTPUT:
xG Home: ${model.lambdaHome} | xG Away: ${model.lambdaAway} | Total xG: ${model.expectedTotalGoals}
Win probabilities: Home ${(predictions.match_result.home * 100).toFixed(1)}% | Draw ${(predictions.match_result.draw * 100).toFixed(1)}% | Away ${(predictions.match_result.away * 100).toFixed(1)}%
Over 2.5: ${(predictions.over_under.over_2_5 * 100).toFixed(1)}% | Under 2.5: ${(predictions.over_under.under_2_5 * 100).toFixed(1)}%
BTTS Yes: ${(predictions.btts.yes * 100).toFixed(1)}% | BTTS No: ${(predictions.btts.no * 100).toFixed(1)}%

TEAM FORM STATS:
${fixture.homeTeam}: Avg scored ${hf.avg_scored || 'N/A'} | Avg conceded ${hf.avg_conceded || 'N/A'} | Win rate ${hf.win_rate !== null ? (hf.win_rate * 100).toFixed(0) + '%' : 'N/A'} | Clean sheet ${hf.clean_sheet_rate !== null ? (hf.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}
${fixture.awayTeam}: Avg scored ${af.avg_scored || 'N/A'} | Avg conceded ${af.avg_conceded || 'N/A'} | Win rate ${af.win_rate !== null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'} | Clean sheet ${af.clean_sheet_rate !== null ? (af.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}

BOOKMAKER ODDS:
${oddsStr}

ENGINE RANKED MARKETS (sorted by statistical probability):
${rankedMarkets || 'Not available'}

Your job: study the engine rankings above, cross-reference with form, H2H, and match dynamics, then either CONFIRM the engine's top pick or OVERRIDE it with a better one. Justify your choice.`;
}

const SYSTEM_PROMPT = `You are ScorePhantom's elite match analyst. You work as a CO-PILOT with the statistical Poisson engine.

THE ENGINE has already ranked all markets by probability (provided in context).
YOUR JOB:
1. Study the engine's top picks
2. Cross-reference with form, H2H patterns, standings, and game script
3. Either CONFIRM the engine's top statistical pick, or OVERRIDE it if qualitative data suggests a different edge
4. If you override, explain exactly WHY the stats don't tell the full story

DECISION FRAMEWORK:
- CONFIRM engine pick if: form + H2H + standings all align with the stats
- OVERRIDE if: teams are in contrasting form, H2H defies the stats, or motivation factors change the picture
- Always pick the market with clearest COMBINED edge (statistical + qualitative)
- Avoid picks where both stats and context are ambiguous
- Confidence should reflect true edge: 55-70% = decent edge, 70-85% = strong edge, 85%+ = dominant pick

MARKETS AVAILABLE: 1X2, Double Chance, Draw No Bet, Over/Under 1.5/2.5/3.5, BTTS Yes/No, Home/Away Team Goals, Handicap -1/-1.5/+1/+1.5

RULES:
- Always pick. Never refuse.
- ONE best pick only
- ONE alternative from a completely DIFFERENT market category
- game_script: 3-4 sharp sentences describing how this match will play out
- best_pick_reasoning: mention if you confirmed or overrode the engine, and why
- Keep alternative_reasoning to 1-2 sentences
- data_warning: mention only if data is genuinely too thin to be confident

Respond ONLY in valid JSON, no markdown, no explanation outside JSON:
{
  "game_script": "...",
  "engine_verdict": "CONFIRMED" or "OVERRIDDEN",
  "best_pick": "exact pick e.g. BTTS Yes / Over 2.5 Goals / Liverpool Win / Handicap -1 Bayern / Home DNB",
  "best_pick_confidence": 72,
  "best_pick_reasoning": "...",
  "alternative_pick": "...",
  "alternative_reasoning": "...",
  "data_warning": null
}`;

export async function explainPrediction(prediction) {
    const context = buildContext(prediction);
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 900,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: context },
            ],
        });

        const raw = response.choices[0]?.message?.content || '';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        try {
            return JSON.parse(cleaned);
        } catch {
            return {
                game_script: raw,
                engine_verdict: null,
                best_pick: null,
                best_pick_confidence: null,
                best_pick_reasoning: null,
                alternative_pick: null,
                alternative_reasoning: null,
                data_warning: 'Parse error',
            };
        }
    } catch (err) {
        console.error('Groq failed:', err.message);
        return null;
    }
}

export async function chatAboutMatch(prediction, chatHistory, userMessage) {
    const context = buildContext(prediction);
    const systemPrompt = `You are ScorePhantom's AI analyst. You are locked to ONE match: ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam}.

MATCH DATA:
${context}

RULES:
- Only discuss this match. If asked about anything else say: "I can only discuss ${prediction.fixture.homeTeam} vs ${prediction.fixture.awayTeam} in this session."
- Sharp, data-driven answers only
- Max 4 sentences unless detailed breakdown is specifically requested
- You can discuss tactics, markets, player impact, historical patterns - but ONLY for this fixture`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.4,
            max_tokens: 400,
            messages: [
                { role: 'system', content: systemPrompt },
                ...chatHistory,
                { role: 'user', content: userMessage },
            ],
        });
        return response.choices[0]?.message?.content || 'Unable to respond.';
    } catch (err) {
        console.error('Groq chat failed:', err.message);
        return 'Something went wrong. Try again.';
    }
}
