import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── EV CALCULATION ───────────────────────────────────────────────────────────

function calcEV(probability, odds) {
    if (!probability || !odds) return null;
    return parseFloat(((probability * odds) - 1).toFixed(3));
}

function buildEVSummary(predictions, odds) {
    if (!odds) return 'No odds available.';

    const markets = [];

    if (odds.home) {
        const ev = calcEV(predictions.match_result.home, odds.home);
        markets.push(`Home win: prob ${(predictions.match_result.home * 100).toFixed(1)}% | odds ${odds.home} | EV ${ev > 0 ? '+' : ''}${ev}`);
    }
    if (odds.draw) {
        const ev = calcEV(predictions.match_result.draw, odds.draw);
        markets.push(`Draw: prob ${(predictions.match_result.draw * 100).toFixed(1)}% | odds ${odds.draw} | EV ${ev > 0 ? '+' : ''}${ev}`);
    }
    if (odds.away) {
        const ev = calcEV(predictions.match_result.away, odds.away);
        markets.push(`Away win: prob ${(predictions.match_result.away * 100).toFixed(1)}% | odds ${odds.away} | EV ${ev > 0 ? '+' : ''}${ev}`);
    }
    if (odds.btts_yes) {
        const ev = calcEV(predictions.btts.yes, odds.btts_yes);
        markets.push(`BTTS Yes: prob ${(predictions.btts.yes * 100).toFixed(1)}% | odds ${odds.btts_yes} | EV ${ev > 0 ? '+' : ''}${ev}`);
    }
    if (odds.btts_no) {
        const ev = calcEV(predictions.btts.no, odds.btts_no);
        markets.push(`BTTS No: prob ${(predictions.btts.no * 100).toFixed(1)}% | odds ${odds.btts_no} | EV ${ev > 0 ? '+' : ''}${ev}`);
    }

    if (odds.over_under) {
        const lines = ['1.5', '2.5', '3.5'];
        for (const line of lines) {
            const key = Object.keys(odds.over_under).find(k => k.startsWith(line));
            const ouOdds = key ? odds.over_under[key] : null;
            if (!ouOdds) continue;

            const overKey = `over_${line.replace('.', '_')}`;
            const underKey = `under_${line.replace('.', '_')}`;
            const overProb = predictions.over_under[overKey];
            const underProb = predictions.over_under[underKey];

            if (ouOdds.over && overProb) {
                const ev = calcEV(overProb, ouOdds.over);
                markets.push(`Over ${line}: prob ${(overProb * 100).toFixed(1)}% | odds ${ouOdds.over} | EV ${ev > 0 ? '+' : ''}${ev}`);
            }
            if (ouOdds.under && underProb) {
                const ev = calcEV(underProb, ouOdds.under);
                markets.push(`Under ${line}: prob ${(underProb * 100).toFixed(1)}% | odds ${ouOdds.under} | EV ${ev > 0 ? '+' : ''}${ev}`);
            }
        }
    }

    return markets.length ? markets.join('\n') : 'No odds available.';
}

// ─── BUILD CONTEXT ────────────────────────────────────────────────────────────

function buildContext(prediction) {
    const { fixture, model, predictions, features, odds } = prediction;
    const { homeFeatures, awayFeatures, h2hFeatures } = features;

    const f = fixture;
    const hf = homeFeatures;
    const af = awayFeatures;
    const h2h = h2hFeatures;

    const evSummary = buildEVSummary(predictions, odds);

    const lines = [
        `Match: ${f.homeTeam} vs ${f.awayTeam}`,
        ``,
        `--- ENGINE OUTPUT ---`,
        `Expected goals: ${f.homeTeam} ${model.lambdaHome} | ${f.awayTeam} ${model.lambdaAway}`,
        `H2H adjusted: ${model.h2hAdjusted ? 'Yes' : 'No'}`,
        `Data quality: ${model.dataQuality.homeFormMatches} home form | ${model.dataQuality.awayFormMatches} away form | ${model.dataQuality.h2hMatches} H2H matches`,
        ``,
        `--- MATCH RESULT ---`,
        `Home win: ${(predictions.match_result.home * 100).toFixed(1)}%`,
        `Draw: ${(predictions.match_result.draw * 100).toFixed(1)}%`,
        `Away win: ${(predictions.match_result.away * 100).toFixed(1)}%`,
        ``,
        `--- OVER/UNDER ---`,
        `Over 1.5: ${(predictions.over_under.over_1_5 * 100).toFixed(1)}%`,
        `Over 2.5: ${(predictions.over_under.over_2_5 * 100).toFixed(1)}%`,
        `Over 3.5: ${(predictions.over_under.over_3_5 * 100).toFixed(1)}%`,
        ``,
        `--- BTTS ---`,
        `Yes: ${(predictions.btts.yes * 100).toFixed(1)}% | No: ${(predictions.btts.no * 100).toFixed(1)}%`,
        ``,
        `--- CORRECT SCORE (top 3) ---`,
        predictions.correct_score.slice(0, 3).map(s => `${s.score}: ${(s.probability * 100).toFixed(1)}%`).join(' | '),
        ``,
        `--- HOME TEAM FORM (${f.homeTeam}) ---`,
        `Avg scored: ${hf.avg_scored ?? 'N/A'} | Avg conceded: ${hf.avg_conceded ?? 'N/A'}`,
        `Over 2.5 rate: ${hf.over_2_5_rate !== null ? (hf.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${hf.btts_rate !== null ? (hf.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Win rate: ${hf.win_rate !== null ? (hf.win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Scored 1+ rate: ${hf.scored_over_0_5_rate !== null ? (hf.scored_over_0_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Clean sheet rate: ${hf.clean_sheet_rate !== null ? (hf.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- AWAY TEAM FORM (${f.awayTeam}) ---`,
        `Avg scored: ${af.avg_scored ?? 'N/A'} | Avg conceded: ${af.avg_conceded ?? 'N/A'}`,
        `Over 2.5 rate: ${af.over_2_5_rate !== null ? (af.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${af.btts_rate !== null ? (af.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Win rate: ${af.win_rate !== null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Scored 1+ rate: ${af.scored_over_0_5_rate !== null ? (af.scored_over_0_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Clean sheet rate: ${af.clean_sheet_rate !== null ? (af.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- H2H ---`,
        `Matches available: ${h2h.matches_available}`,
        `Avg total goals: ${h2h.avg_total_goals ?? 'N/A'}`,
        `Over 2.5 rate: ${h2h.over_2_5_rate !== null ? (h2h.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${h2h.btts_rate !== null ? (h2h.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Home win rate: ${h2h.home_win_rate !== null ? (h2h.home_win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Away win rate: ${h2h.away_win_rate !== null ? (h2h.away_win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- MARKET PROBABILITIES + EV ---`,
        evSummary,
    ];

    return lines.join('\n');
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a football betting analyst for ScorePhantom working alongside a Poisson statistical engine.

You receive match data: team form, H2H history, expected goals, and probabilities for every market.

YOUR JOB:
Read the data carefully and recommend the single most logical bet for this match — the one that the data most strongly supports.

HOW TO THINK:
1. Look at both teams' form — who has been scoring, who has been conceding, who has been winning
2. Look at H2H — does history support or contradict the form story?
3. Look at all markets equally — every market starts at zero, none has priority
4. Ask yourself: what does this specific data tell me about THIS specific match?
5. Pick the market where form + H2H + probabilities all point in the same direction

AVAILABLE MARKETS (all equal, pick the one the data supports):
- Home win / Draw / Away win
- Over 1.5 / Over 2.5 / Over 3.5 goals
- Under 1.5 / Under 2.5 / Under 3.5 goals  
- BTTS Yes / BTTS No
- Home team to score / Away team to score

STRICT RULES:
- Never pick a market just because it feels safe — every pick must be justified by the data
- Over 1.5 is valid ONLY when both teams' recent form AND H2H show consistent goals — not as a default
- A straight home win or away win is often the cleanest pick when one team is clearly stronger
- Under markets are valid when both teams struggle to score or H2H is consistently low scoring
- BTTS No is valid when one team has a poor scoring record
- If no market has probability above 58% AND form/H2H don't strongly confirm it — say "No clear pick — skip this match"
- Probability below 55% is never a recommendation regardless of EV
- Do NOT default to the same market every match — your pick must come from what the data says about THIS match

Format response as JSON:
{
  "match_result": "2-3 sentence analysis of likely result based on form and H2H",
  "goals": "2-3 sentence analysis of goals markets — explain what form and H2H say about goals",
  "btts": "1-2 sentence analysis of BTTS based on both teams scoring records",
  "correct_score": "1-2 sentence on most likely scorelines",
  "home_team_goals": "1 sentence on home team scoring outlook",
  "away_team_goals": "1 sentence on away team scoring outlook",
  "top_insight": "The single most important observation from the data for this match",
  "recommended_bet": "ONE specific bet with clear reasoning — e.g. 'Home Win — home team has won 4 of last 5, away team scores rarely, form strongly favors home side' OR 'Over 1.5 — both teams score in 80% of recent matches, H2H averages 2.8 goals, goals expected from both sides' OR 'No clear pick — skip this match'",
  "data_warning": null or "brief warning if fewer than 3 matches of form or H2H data"
}`;

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────────

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
                match_result: raw,
                goals: null,
                btts: null,
                correct_score: null,
                home_team_goals: null,
                away_team_goals: null,
                top_insight: null,
                recommended_bet: null,
                data_warning: 'Explanation parsing failed.',
            };
        }
    } catch (err) {
        console.error('Groq explanation failed:', err.message);
        return null;
    }
}
