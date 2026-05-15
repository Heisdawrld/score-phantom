
function fuzzyTeamMatch(a, b) {
  if (!a || !b) return false;
  const na = String(a).toLowerCase().trim();
  const nb = String(b).toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/)[0];
  const wb = nb.split(/\s+/)[0];
  if (wa.length >= 4 && (wa === wb || wa.includes(wb) || wb.includes(wa))) return true;
  return false;
}
import { safeNum, avg, weightedRate, weightedAvg } from '../utils/math.js';

function recencyWeight(match, idx) {
  const d = new Date(match.date);
  if (Number.isNaN(d.getTime())) return Math.max(1, 6 - idx * 0.6);
  const days = Math.max(0, (Date.now() - d.getTime()) / 86400000);
  if (days <= 14) return 1.5;
  if (days <= 30) return 1.35;
  if (days <= 60) return 1.2;
  if (days <= 120) return 1.0;
  return 0.8;
}

function teamGoals(matches, teamName) {
  return matches.map(m => {
    if (fuzzyTeamMatch(m.home_team, teamName)) {
      return { 
        ...m, 
        scored: safeNum(m.home_goals, null), 
        conceded: safeNum(m.away_goals, null), 
        xgFor: safeNum(m.home_xg, null),
        xgAgainst: safeNum(m.away_xg, null),
        isHome: true 
      };
    }
    if (fuzzyTeamMatch(m.away_team, teamName)) {
      return { 
        ...m, 
        scored: safeNum(m.away_goals, null), 
        conceded: safeNum(m.home_goals, null), 
        xgFor: safeNum(m.away_xg, null),
        xgAgainst: safeNum(m.home_xg, null),
        isHome: false 
      };
    }
    return null;
  }).filter(Boolean);
}

function weightedFormPoints(teamMatches, weightFn) {
  const vals = teamMatches.map((m, idx) => {
    const w = weightFn(m, idx);
    const pts = m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0;
    return { pts, w };
  });
  const totalWeight = vals.reduce((s, x) => s + x.w, 0);
  if (!totalWeight) return null;
  return parseFloat((vals.reduce((s, x) => s + x.pts * x.w, 0) / totalWeight).toFixed(3));
}

function streakScore(teamMatches) {
  if (!teamMatches.length) return 0;
  let score = 0;
  for (let i = 0; i < Math.min(teamMatches.length, 5); i++) {
    const m = teamMatches[i];
    if (m.scored > m.conceded) score += 1;
    else if (m.scored === m.conceded) score += 0.25;
    else score -= 1;
  }
  return parseFloat(score.toFixed(2));
}

export function computeFormFeatures(formMatches, teamName, standingsMap = new Map()) {
  const tg = teamGoals(formMatches, teamName);
  const wFn = (m, idx) => recencyWeight(m, idx);
  
  // Last 5 and last 10 points
  const last5 = tg.slice(0, 5);
  const last10 = tg.slice(0, 10);
  const ptsLast5 = last5.reduce((s, m) => s + (m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0), 0);
  const ptsLast10 = last10.reduce((s, m) => s + (m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0), 0);

  return {
    matches_available: formMatches.length,
    pointsLast5: ptsLast5,
    pointsLast10: ptsLast10,
    avg_scored: weightedAvg(tg, g => g.scored, wFn),
    avg_conceded: weightedAvg(tg, g => g.conceded, wFn),
    avg_xg_for: weightedAvg(tg, g => g.xgFor, wFn),
    avg_xg_against: weightedAvg(tg, g => g.xgAgainst, wFn),
    avg_total_goals: weightedAvg(formMatches, m => safeNum(m.home_goals, 0) + safeNum(m.away_goals, 0), wFn),
    goalsScoredAvg5: avg(last5.map(m => m.scored)),
    goalsConcededAvg5: avg(last5.map(m => m.conceded)),
    
    over_0_5_rate: weightedRate(formMatches, m => safeNum(m.home_goals) + safeNum(m.away_goals) > 0, wFn),
    over_1_5_rate: weightedRate(formMatches, m => safeNum(m.home_goals) + safeNum(m.away_goals) > 1, wFn),
    over_2_5_rate: weightedRate(formMatches, m => safeNum(m.home_goals) + safeNum(m.away_goals) > 2, wFn),
    over_3_5_rate: weightedRate(formMatches, m => safeNum(m.home_goals) + safeNum(m.away_goals) > 3, wFn),
    btts_rate: weightedRate(formMatches, m => safeNum(m.home_goals) > 0 && safeNum(m.away_goals) > 0, wFn),

    scored_over_0_5_rate: weightedRate(tg, g => g.scored > 0, wFn),
    scored_over_1_5_rate: weightedRate(tg, g => g.scored > 1, wFn),
    scored_over_2_5_rate: weightedRate(tg, g => g.scored > 2, wFn),
    conceded_over_0_5_rate: weightedRate(tg, g => g.conceded > 0, wFn),
    conceded_over_1_5_rate: weightedRate(tg, g => g.conceded > 1, wFn),

    win_rate: weightedRate(tg, g => g.scored > g.conceded, wFn),
    draw_rate: weightedRate(tg, g => g.scored === g.conceded, wFn),
    loss_rate: weightedRate(tg, g => g.scored < g.conceded, wFn),
    clean_sheet_rate: weightedRate(tg, g => g.conceded === 0, wFn),
    failed_to_score_rate: weightedRate(tg, g => g.scored === 0, wFn),

    weighted_points_per_match: weightedFormPoints(tg, wFn),
    streak_score: streakScore(tg),
    
    _teamGoals: tg, // pass through for venue split
  };
}

export { recencyWeight, teamGoals };
