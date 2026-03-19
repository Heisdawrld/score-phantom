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
    if (!odds) return 'No odds available for EV calculation.';

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

    return markets.length ? markets.join('\n') : 'No odds available for EV calculation.';
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
        `--- EV ANALYSIS (positive EV = value bet) ---`,
        evSummary,
    ];

    return lines.join('\n');
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a football betting analyst working alongside a Poisson statistical engine for ScorePhantom.

The engine has calculated probabilities for every market using form, H2H, and expected goals.
Your job is to act as the second pilot — you review the engine's numbers, challenge them where the data doesn't support them, and together produce ONE final recommended bet.

HOW TO WORK WITH THE ENGINE:
- If you AGREE with the engine's strongest signal AND EV is positive or probability is above 65% → confirm it
- If you DISAGREE → explain why (e.g. H2H tells a different story, small sample size, form is misleading) and suggest a different market
- If signals are mixed and nothing is clear → say "No value found — skip this match"

BETTING MARKETS YOU CAN RECOMMEND (pick the one with the strongest edge):
- Home win / Draw / Away win (1X2)
- Over 1.5 / Over 2.5 / Over 3.5 goals
- Under 1.5 / Under 2.5 / Under 3.5 goals
- BTTS Yes / BTTS No
- Home team to score (over 0.5)
- Away team to score (over 0.5)

RULES:
- Pick ONE bet only. Not two, not three. One.
- Rotate across markets based on what the data actually supports — do not default to Over 2.5 or BTTS every match
- A straight win is valid if the probability and EV support it
- Only recommend Over 1.5 if probability is above 75% AND H2H or form strongly backs it — not just because it feels safe
- Never recommend correct score
- If EV is negative on all markets and no probability exceeds 65%, say "No value found — skip this match"
- Never use generic phrases like "this should be an exciting match"

Format your response as JSON with these exact keys:
{
  "match_result": "2-3 sentence analysis of the likely result — agree or challenge the engine",
  "goals": "2-3 sentence analysis of goals markets — flag H2H vs form conflicts",
  "btts": "1-2 sentence analysis of BTTS",
  "correct_score": "1-2 sentence on most likely scorelines",
  "home_team_goals": "1 sentence on home scoring outlook",
  "away_team_goals": "1 sentence on away scoring outlook",
  "top_insight": "The single most important observation — where engine and data agree or conflict",
  "recommended_bet": "ONE bet with full reasoning e.g. 'Home Win @ 2.00 — engine gives 48% but H2H shows home team wins 4/5 meetings, positive EV +0.04, back the home side'",
  "data_warning": null or "brief warning if form or H2H data is thin (fewer than 3 matches)"
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
