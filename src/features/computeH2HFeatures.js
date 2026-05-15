
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
import { safeNum, weightedAvg, weightedRate } from '../utils/math.js';

function recencyWeight(match, idx) {
  const d = new Date(match.date);
  if (Number.isNaN(d.getTime())) return Math.max(1, 6 - idx * 0.6);
  const days = Math.max(0, (Date.now() - d.getTime()) / 86400000);
  if (days <= 60) return 1.4;
  if (days <= 180) return 1.2;
  if (days <= 365) return 1.0;
  return 0.7;
}

export function computeH2HFeatures(h2hMatches, homeTeamName, awayTeamName) {
  if (!h2hMatches.length) {
    return { matches_available: 0, avg_total_goals: null, over_2_5_rate: null, btts_rate: null, h2hHomeDominanceRate: null, h2hAvgGoals: null };
  }

  const enriched = h2hMatches.map(m => {
    const hg = safeNum(m.home_goals, 0);
    const ag = safeNum(m.away_goals, 0);
    let homeWon = false, awayWon = false;

    if (fuzzyTeamMatch(m.home_team, homeTeamName)) homeWon = hg > ag;
    else if (fuzzyTeamMatch(m.away_team, homeTeamName)) homeWon = ag > hg;
    if (fuzzyTeamMatch(m.home_team, awayTeamName)) awayWon = hg > ag;
    else if (fuzzyTeamMatch(m.away_team, awayTeamName)) awayWon = ag > hg;

    return { ...m, total_goals: hg + ag, homeWon, awayWon };
  });

  const wFn = (m, idx) => recencyWeight(m, idx);

  return {
    matches_available: h2hMatches.length,
    avg_total_goals: weightedAvg(enriched, m => m.total_goals, wFn),
    over_1_5_rate: weightedRate(enriched, m => m.total_goals > 1, wFn),
    over_2_5_rate: weightedRate(enriched, m => m.total_goals > 2, wFn),
    over_3_5_rate: weightedRate(enriched, m => m.total_goals > 3, wFn),
    btts_rate: weightedRate(enriched, m => safeNum(m.home_goals) > 0 && safeNum(m.away_goals) > 0, wFn),
    h2hHomeDominanceRate: weightedRate(enriched, m => m.homeWon, wFn),
    h2hAvgGoals: weightedAvg(enriched, m => m.total_goals, wFn),
    draw_rate: weightedRate(enriched, m => safeNum(m.home_goals) === safeNum(m.away_goals), wFn),
    home_win_rate: weightedRate(enriched, m => m.homeWon, wFn),
    away_win_rate: weightedRate(enriched, m => m.awayWon, wFn),
  };
}
