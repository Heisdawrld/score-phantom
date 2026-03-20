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

// ─── FORMAT STANDINGS ────────────────────────────────────────────────────────
function formatStandings(standings, homeTeam, awayTeam) {
    if (!standings || standings.length === 0) return 'No standings data.';

    const homeRow = standings.find(r => r.team === homeTeam);
    const awayRow = standings.find(r => r.team === awayTeam);

    const fmt = (r) => r
        ? `${r.team}: P${r.position} | Pts:${r.points} | W${r.wins} D${r.draws} L${r.losses} | GF:${r.goalsFor} GA:${r.goalsAgainst} | Form:${r.form || 'N/A'}`
        : 'Not found';

    return `${fmt(homeRow)}\n${fmt(awayRow)}`;
}

// ─── FORMAT SEASON STATS ─────────────────────────────────────────────────────
function formatSeasonStats(stats, teamName) {
    if (!stats) return `${teamName}: No season stats.`;
    return `${teamName}: Avg scored ${stats.avgGoalsScored ?? 'N/A'} | Avg conceded ${stats.avgGoalsConceded ?? 'N/A'} | Clean sheets ${stats.cleanSheets ?? 'N/A'} | BTTS ${stats.bttsCount ?? 'N/A'}/${stats.matches ?? '?'} games | Over 2.5 ${stats.over25Count ?? 'N/A'}/${stats.matches ?? '?'} games | Failed to score ${stats.failedToScore ?? 'N/A'}/${stats.matches ?? '?'} games`;
}

// ─── FORMAT RECENT FORM ──────────────────────────────────────────────────────
function formatForm(form, teamName, label) {
    if (!form || form.length === 0) return `${label}: No form data.`;
    const results = form.slice(0, 7).map(m => {
        if (!m.score) return '?';
        const [h, a] = m.score.split('-').map(Number);
        const isHome = m.home === teamName;
        const scored = isHome ? h : a;
        const conceded = isHome ? a : h;
        const result = scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
        return `${result}(${m.score} ${m.home} vs ${m.away})`;
    });
    return `${label}: ${results.join(', ')}`;
}

// ─── BUILD FULL CONTEXT ──────────────────────────────────────────────────────
function buildContext(prediction) {
    const { fixture, model, predictions, features, odds, meta } = prediction;
    const { homeFeatures, awayFeatures, h2hFeatures } = features;
    const f = fixture;
    const hf = homeFeatures;
    const af = awayFeatures;
    const h2h = h2hFeatures;

    // Parse meta if it's a string
    let parsedMeta = meta;
    if (typeof meta === 'string') {
        try { parsedMeta = JSON.parse(meta); } catch { parsedMeta = null; }
    }

    const standings = parsedMeta?.standings || [];
    const homeStats = parsedMeta?.homeStats || null;
    const awayStats = parsedMeta?.awayStats || null;
    const homeMomentum = parsedMeta?.homeMomentum || null;
    const awayMomentum = parsedMeta?.awayMomentum || null;

    const evSummary = buildEVSummary(predictions, odds);

    const lines = [
        `Match: ${f.homeTeam} vs ${f.awayTeam}`,
        ``,
        `--- ENGINE OUTPUT ---`,
        `xG Home: ${model.lambdaHome} | xG Away: ${model.lambdaAway} | Total xG: ${model.expectedTotalGoals}`,
        `H2H adjusted: ${model.h2hAdjusted ? 'Yes' : 'No'}`,
        `Data: ${model.dataQuality.homeFormMatches} home form | ${model.dataQuality.awayFormMatches} away form | ${model.dataQuality.h2hMatches} H2H matches`,
        ``,
        `--- LEAGUE TABLE ---`,
        formatStandings(standings, f.homeTeam, f.awayTeam),
        ``,
        `--- SEASON STATS ---`,
        formatSeasonStats(homeStats, f.homeTeam),
        formatSeasonStats(awayStats, f.awayTeam),
        ``,
        `--- MOMENTUM (last 5 games, 100% = won all) ---`,
        `${f.homeTeam}: ${homeMomentum ?? 'N/A'}% | ${f.awayTeam}: ${awayMomentum ?? 'N/A'}%`,
        ``,
        `--- MATCH RESULT PROBABILITIES ---`,
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
        `Win rate: ${hf.win_rate !== null ? (hf.win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Over 2.5 rate: ${hf.over_2_5_rate !== null ? (hf.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${hf.btts_rate !== null ? (hf.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Clean sheet rate: ${hf.clean_sheet_rate !== null ? (hf.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Failed to score rate: ${hf.scored_over_0_5_rate !== null ? ((1 - hf.scored_over_0_5_rate) * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- AWAY TEAM FORM (${f.awayTeam}) ---`,
        `Avg scored: ${af.avg_scored ?? 'N/A'} | Avg conceded: ${af.avg_conceded ?? 'N/A'}`,
        `Win rate: ${af.win_rate !== null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Over 2.5 rate: ${af.over_2_5_rate !== null ? (af.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${af.btts_rate !== null ? (af.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Clean sheet rate: ${af.clean_sheet_rate !== null ? (af.clean_sheet_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Failed to score rate: ${af.scored_over_0_5_rate !== null ? ((1 - af.scored_over_0_5_rate) * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- H2H SUMMARY ---`,
        `Matches: ${h2h.matches_available} | Avg goals: ${h2h.avg_total_goals ?? 'N/A'}`,
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
const SYSTEM_PROMPT = `You are a professional football betting analyst for ScorePhantom. You work alongside a Poisson statistical engine and have access to rich match data: league table positions, season-long stats, recent form, momentum scores, H2H history, expected goals, and market odds with EV calculations.

YOUR JOB:
Analyse ALL the data provided and recommend the single most value-rich bet for this match.

HOW TO THINK (in order):
1. LEAGUE TABLE — What do positions and points tell you about the quality gap between these teams?
2. SEASON STATS — Who scores more? Who concedes more? Who keeps clean sheets? Who fails to score?
3. MOMENTUM — Which team is in better recent form (last 5 games)?
4. RECENT FORM — Look at last 7 results per team. Are they winning, drawing, losing? Scoring or not?
5. H2H — Does history between these teams support or contradict the form/table story?
6. xG + PROBABILITIES — What does the engine say? Does it align with the qualitative data?
7. EV — Which market offers positive expected value AND is backed by the data?

AVAILABLE MARKETS (all equal — pick the one the data most strongly supports):
- Home win / Draw / Away win
- Over/Under 1.5, 2.5, 3.5 goals
- BTTS Yes / BTTS No
- Home to score / Away to score

STRICT RULES:
- Never default to Over 1.5 or BTTS Yes just because it feels safe — justify everything with data
- A clean home win or away win is often the best pick when table + form + momentum all agree
- Under markets are valid when both teams struggle to score or H2H is consistently low-scoring
- BTTS No is valid when one team has a poor scoring record — check failed-to-score rate
- If table position, form AND momentum all point the same direction — that's your pick
- Positive EV alone is not enough — the data must also support the outcome
- If no market is clearly supported by multiple data points — say "No clear pick — skip this match"
- Probability below 55% is never a recommendation

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
{
  "match_result": "2-3 sentence analysis combining table position, form, and momentum",
  "goals": "2-3 sentence analysis of goals markets using season stats and form",
  "btts": "1-2 sentence BTTS analysis using scoring rates and failed-to-score data",
  "correct_score": "1-2 sentence on most likely scorelines given xG and form",
  "home_team_goals": "1 sentence on home team scoring outlook using season avg + recent form",
  "away_team_goals": "1 sentence on away team scoring outlook using season avg + recent form",
  "top_insight": "One sharp sentence — the single most important factor for this match.",
  "recommended_bet": "MAX 8 WORDS. Just the tip. e.g. 'Manchester City Win' or 'Over 2.5 Goals' or 'BTTS Yes' or 'No clear pick'. NO reasoning here — reasoning goes in match_result/goals/btts.",
  "data_warning": null or "brief warning if fewer than 3 matches of form data available"
}`;

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────────
export async function explainPrediction(prediction) {
    const context = buildContext(prediction);

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.25,
            max_tokens: 1000,
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
