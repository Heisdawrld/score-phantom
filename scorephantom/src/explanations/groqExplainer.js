import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── BUILD CONTEXT STRING ─────────────────────────────────────────────────────
// Converts raw prediction data into a structured prompt context

function buildContext(prediction) {
    const { fixture, model, predictions, features } = prediction;
    const { homeFeatures, awayFeatures, h2hFeatures, combinedSignals } = features;

    const f = fixture;
    const hf = homeFeatures;
    const af = awayFeatures;
    const h2h = h2hFeatures;

    const lines = [
        `Match: ${f.homeTeam} vs ${f.awayTeam}`,
        ``,
        `--- MODEL ---`,
        `Expected goals: ${f.homeTeam} ${model.lambdaHome} | ${f.awayTeam} ${model.lambdaAway}`,
        `H2H adjusted: ${model.h2hAdjusted ? 'Yes' : 'No'}`,
        `Data: ${model.dataQuality.homeFormMatches} home form matches, ${model.dataQuality.awayFormMatches} away form matches, ${model.dataQuality.h2hMatches} H2H matches`,
        ``,
        `--- MATCH RESULT ---`,
        `Home win: ${(predictions.match_result.home * 100).toFixed(1)}%`,
        `Draw: ${(predictions.match_result.draw * 100).toFixed(1)}%`,
        `Away win: ${(predictions.match_result.away * 100).toFixed(1)}%`,
        `Top pick: ${predictions.match_result.top_pick.toUpperCase()} (${predictions.match_result.confidence} confidence)`,
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
        ``,
        `--- AWAY TEAM FORM (${f.awayTeam}) ---`,
        `Avg scored: ${af.avg_scored ?? 'N/A'} | Avg conceded: ${af.avg_conceded ?? 'N/A'}`,
        `Over 2.5 rate: ${af.over_2_5_rate !== null ? (af.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${af.btts_rate !== null ? (af.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Win rate: ${af.win_rate !== null ? (af.win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `Scored 1+ rate: ${af.scored_over_0_5_rate !== null ? (af.scored_over_0_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        ``,
        `--- H2H ---`,
        `Matches: ${h2h.matches_available}`,
        `Avg total goals: ${h2h.avg_total_goals ?? 'N/A'}`,
        `Over 2.5 rate: ${h2h.over_2_5_rate !== null ? (h2h.over_2_5_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `BTTS rate: ${h2h.btts_rate !== null ? (h2h.btts_rate * 100).toFixed(0) + '%' : 'N/A'}`,
        `H2H home win rate: ${h2h.home_win_rate !== null ? (h2h.home_win_rate * 100).toFixed(0) + '%' : 'N/A'}`,
    ];

    return lines.join('\n');
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a sharp football betting analyst for ScorePhantom, a data-driven prediction platform.

You are given statistical data about an upcoming match including team form, H2H history, and Poisson model predictions across multiple betting markets.

Your job is to write a concise, insight-driven analysis. Do NOT just restate the numbers. Identify:
- What the data actually suggests and why
- Any contradictions or tensions between signals (e.g. high goals expected but H2H tends low-scoring)
- Which markets look strongest based on the data
- Any caveats about data quality (e.g. only 2 H2H matches available)

Format your response as JSON with these exact keys:
{
  "match_result": "2-3 sentence explanation of the likely result and why",
  "goals": "2-3 sentence explanation covering over/under outlook",
  "btts": "1-2 sentence explanation of BTTS likelihood",
  "correct_score": "1-2 sentence explanation of most likely scorelines",
  "home_team_goals": "1 sentence on home team scoring outlook",
  "away_team_goals": "1 sentence on away team scoring outlook",
  "top_insight": "1 standout observation a bettor should know — highlight contradictions or strong signals",
  "data_warning": "null if data is sufficient, or a brief warning if form/H2H data is thin"
}

Be direct. Be specific. Do not use generic phrases like 'this should be an exciting match'.`;

// ─── MAIN EXPLAIN FUNCTION ────────────────────────────────────────────────────

export async function explainPrediction(prediction) {
    const context = buildContext(prediction);

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.4,
            max_tokens: 800,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: context },
            ],
        });

        const raw = response.choices[0]?.message?.content || '';

        // Strip markdown code fences if present
        const cleaned = raw.replace(/```json|```/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            // If JSON parse fails, return raw text in a structured wrapper
            return {
                match_result: raw,
                goals: null,
                btts: null,
                correct_score: null,
                home_team_goals: null,
                away_team_goals: null,
                top_insight: null,
                data_warning: 'Explanation parsing failed — raw response returned.',
            };
        }
    } catch (err) {
        console.error('Groq explanation failed:', err.message);
        return null;
    }
}
