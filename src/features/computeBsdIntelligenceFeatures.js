import { safeNum, clamp } from '../utils/math.js';

function fuzzyTeamMatch(a, b) {
  if (!a || !b) return false;
  const na = String(a).toLowerCase().trim();
  const nb = String(b).toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/)[0];
  const wb = nb.split(/\s+/)[0];
  return wa.length >= 4 && (wa === wb || wa.includes(wb) || wb.includes(wa));
}

function findStandingRow(standings = [], teamName, teamId = null) {
  return (standings || []).find((row) => {
    if (teamId && String(row.team_id || row.team_api_id || '') === String(teamId)) return true;
    return fuzzyTeamMatch(row.team || row.team_name, teamName);
  }) || null;
}

function computeXgTableFeatures({ standings = [], homeTeam, awayTeam, homeTeamId, awayTeamId }) {
  const home = findStandingRow(standings, homeTeam, homeTeamId);
  const away = findStandingRow(standings, awayTeam, awayTeamId);

  const hXgf = safeNum(home?.xgf, null);
  const hXga = safeNum(home?.xga, null);
  const hXgd = safeNum(home?.xgd, hXgf != null && hXga != null ? hXgf - hXga : null);
  const aXgf = safeNum(away?.xgf, null);
  const aXga = safeNum(away?.xga, null);
  const aXgd = safeNum(away?.xgd, aXgf != null && aXga != null ? aXgf - aXga : null);

  const hGames = Math.max(1, safeNum(home?.xg_games ?? home?.played, 1));
  const aGames = Math.max(1, safeNum(away?.xg_games ?? away?.played, 1));

  const homeXgForPerGame = hXgf != null ? hXgf / hGames : null;
  const homeXgAgainstPerGame = hXga != null ? hXga / hGames : null;
  const awayXgForPerGame = aXgf != null ? aXgf / aGames : null;
  const awayXgAgainstPerGame = aXga != null ? aXga / aGames : null;

  const homePts = safeNum(home?.points, null);
  const awayPts = safeNum(away?.points, null);
  const homeGd = safeNum(home?.gd, null);
  const awayGd = safeNum(away?.gd, null);
  const homeExpectedPtsProxy = hXgd != null ? hXgd : null;
  const awayExpectedPtsProxy = aXgd != null ? aXgd : null;

  return {
    hasXgTable: !!(home && away && (hXgf != null || hXga != null || aXgf != null || aXga != null)),
    homeXgf: hXgf,
    homeXga: hXga,
    homeXgd: hXgd,
    awayXgf: aXgf,
    awayXga: aXga,
    awayXgd: aXgd,
    homeXgForPerGame,
    homeXgAgainstPerGame,
    awayXgForPerGame,
    awayXgAgainstPerGame,
    xgTableGap: hXgd != null && aXgd != null ? hXgd - aXgd : 0,
    homeXgTableStrength: clamp(((homeXgForPerGame ?? 1.3) - (homeXgAgainstPerGame ?? 1.3)) / 2 + 0.5, 0, 1),
    awayXgTableStrength: clamp(((awayXgForPerGame ?? 1.3) - (awayXgAgainstPerGame ?? 1.3)) / 2 + 0.5, 0, 1),
    homeTableLuck: homePts != null && homeExpectedPtsProxy != null ? homePts - homeExpectedPtsProxy : null,
    awayTableLuck: awayPts != null && awayExpectedPtsProxy != null ? awayPts - awayExpectedPtsProxy : null,
    homeGdVsXgd: homeGd != null && hXgd != null ? homeGd - hXgd : null,
    awayGdVsXgd: awayGd != null && aXgd != null ? awayGd - aXgd : null,
  };
}

function managerStyleText(manager) {
  if (!manager) return '';
  const styles = Array.isArray(manager.tactical_styles)
    ? manager.tactical_styles.map((s) => s.code || s.name || s).join(' ')
    : manager.tactical_styles || '';
  return [
    manager.tactical_profile,
    manager.team_style,
    manager.preferred_formation,
    manager.defensive_line,
    manager.pressure_style,
    styles,
  ].filter(Boolean).join(' ').toLowerCase();
}

function computeOneManager(manager) {
  if (!manager) return { available: false, attacking: 0, defensive: 0, over25Tendency: null, bttsTendency: null, cleanSheetTendency: null, possession: null };
  const text = managerStyleText(manager);
  const attackingWords = /(attack|attacking|gegenpress|positional|high press|front foot|vertical|offensive)/;
  const defensiveWords = /(defensive|low block|compact|counter|direct|park|anti-football|conservative)/;
  const over25 = safeNum(manager.over_25_pct ?? manager.over25_pct ?? manager.over_25_rate, null);
  const btts = safeNum(manager.btts_pct ?? manager.btts_rate, null);
  const cs = safeNum(manager.clean_sheet_pct ?? manager.cleanSheetPct ?? manager.clean_sheet_rate, null);
  const possession = safeNum(manager.avg_possession ?? manager.possession, null);
  const avgScored = safeNum(manager.avg_goals_scored, null);
  const avgConceded = safeNum(manager.avg_goals_conceded, null);

  const attacking = clamp(
    (attackingWords.test(text) ? 0.25 : 0) +
    (over25 != null ? (over25 / 100) * 0.35 : 0.18) +
    (avgScored != null ? clamp(avgScored / 2.4, 0, 1) * 0.25 : 0.12) +
    (possession != null ? clamp((possession - 45) / 20, 0, 1) * 0.15 : 0.07),
    0, 1
  );

  const defensive = clamp(
    (defensiveWords.test(text) ? 0.25 : 0) +
    (cs != null ? (cs / 100) * 0.35 : 0.15) +
    (avgConceded != null ? clamp(1 - (avgConceded / 2.2), 0, 1) * 0.25 : 0.12) +
    (possession != null ? clamp((50 - possession) / 20, 0, 1) * 0.15 : 0.07),
    0, 1
  );

  return {
    available: true,
    attacking,
    defensive,
    over25Tendency: over25,
    bttsTendency: btts,
    cleanSheetTendency: cs,
    possession,
    avgGoalsScored: avgScored,
    avgGoalsConceded: avgConceded,
    styleText: text,
  };
}

function computeManagerFeatures(homeManager, awayManager) {
  const home = computeOneManager(homeManager);
  const away = computeOneManager(awayManager);
  return {
    hasManagerIntel: home.available || away.available,
    homeManagerIntel: home,
    awayManagerIntel: away,
    managerAttackGap: home.attacking - away.attacking,
    managerDefenceGap: home.defensive - away.defensive,
    combinedManagerOverBias: clamp((home.attacking + away.attacking) / 2 - (home.defensive + away.defensive) / 4, 0, 1),
    combinedManagerUnderBias: clamp((home.defensive + away.defensive) / 2 - (home.attacking + away.attacking) / 4, 0, 1),
  };
}

function flattenPlayers(playerStats = []) {
  if (!Array.isArray(playerStats)) return [];
  const rows = [];
  for (const entry of playerStats) {
    if (!entry) continue;
    if (Array.isArray(entry.players)) rows.push(...entry.players.map((p) => ({ ...p, team_id: entry.team_id ?? p.team_id })));
    else rows.push(entry);
  }
  return rows;
}

function computePlayerImpact(playerStats = [], homeTeamId, awayTeamId) {
  const rows = flattenPlayers(playerStats);
  let homeXgXa = 0, awayXgXa = 0, homeRating = 0, awayRating = 0, homeN = 0, awayN = 0;

  for (const p of rows) {
    const teamId = p.team_id ?? p.teamId ?? p.team?.id;
    const xg = safeNum(p.expected_goals ?? p.xg, 0);
    const xa = safeNum(p.expected_assists ?? p.xa, 0);
    const rating = safeNum(p.rating, null);
    const contribution = xg + xa;
    const isHome = homeTeamId && teamId && String(teamId) === String(homeTeamId);
    const isAway = awayTeamId && teamId && String(teamId) === String(awayTeamId);
    if (isHome) {
      homeXgXa += contribution;
      if (rating != null) { homeRating += rating; homeN++; }
    } else if (isAway) {
      awayXgXa += contribution;
      if (rating != null) { awayRating += rating; awayN++; }
    }
  }

  return {
    hasPlayerStats: rows.length > 0,
    playerStatsCount: rows.length,
    homePlayerXgXa: Number(homeXgXa.toFixed(3)),
    awayPlayerXgXa: Number(awayXgXa.toFixed(3)),
    playerImpactGap: Number((homeXgXa - awayXgXa).toFixed(3)),
    homeAvgPlayerRating: homeN ? Number((homeRating / homeN).toFixed(2)) : null,
    awayAvgPlayerRating: awayN ? Number((awayRating / awayN).toFixed(2)) : null,
  };
}

export function computeBsdIntelligenceFeatures({
  standings = [],
  homeTeam,
  awayTeam,
  homeTeamId,
  awayTeamId,
  homeManager,
  awayManager,
  playerStats = [],
}) {
  const xgTable = computeXgTableFeatures({ standings, homeTeam, awayTeam, homeTeamId, awayTeamId });
  const managers = computeManagerFeatures(homeManager, awayManager);
  const players = computePlayerImpact(playerStats, homeTeamId, awayTeamId);
  return {
    ...xgTable,
    ...managers,
    ...players,
  };
}
