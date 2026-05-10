import { safeNum, clamp } from '../utils/math.js';

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

function parseMeta(match) {
  const raw = match?.meta || match?.metadata || match?.raw_json || null;
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function getCardSignal(match, teamName, isHome) {
  const meta = parseMeta(match);
  const incidents = Array.isArray(meta.incidents) ? meta.incidents : Array.isArray(meta.events) ? meta.events : [];
  let teamRed = 0;
  let opponentRed = 0;
  let earlyTeamRed = false;
  let earlyOpponentRed = false;

  for (const ev of incidents) {
    const type = String(ev.type || ev.incident_type || ev.event_type || ev.kind || '').toLowerCase();
    const card = String(ev.card || ev.card_type || ev.detail || '').toLowerCase();
    const isRed = type.includes('red') || card.includes('red');
    if (!isRed) continue;

    const minute = safeNum(ev.minute ?? ev.time ?? ev.match_time, 90);
    const side = String(ev.side || ev.team_side || '').toLowerCase();
    const evTeam = ev.team_name || ev.team || ev.participant || '';
    const belongsToTeam = fuzzyTeamMatch(evTeam, teamName) || (side === 'home' && isHome) || (side === 'away' && !isHome);

    if (belongsToTeam) {
      teamRed += 1;
      if (minute <= 55) earlyTeamRed = true;
    } else {
      opponentRed += 1;
      if (minute <= 55) earlyOpponentRed = true;
    }
  }

  return { teamRed, opponentRed, earlyTeamRed, earlyOpponentRed };
}

function extractStats(match, isHome) {
  const meta = parseMeta(match);
  const stats = meta.stats || meta.statistics || meta.matchStats || {};
  const home = stats.home || stats.home_team || stats.localteam || {};
  const away = stats.away || stats.away_team || stats.visitorteam || {};
  const own = isHome ? home : away;
  const opp = isHome ? away : home;

  const ownShots = safeNum(own.shots ?? own.total_shots ?? own.shots_total, null);
  const oppShots = safeNum(opp.shots ?? opp.total_shots ?? opp.shots_total, null);
  const ownSot = safeNum(own.shots_on_target ?? own.shotsOnTarget ?? own.sot, null);
  const oppSot = safeNum(opp.shots_on_target ?? opp.shotsOnTarget ?? opp.sot, null);
  const ownPossession = safeNum(own.possession ?? own.ball_possession, null);
  const ownCorners = safeNum(own.corners ?? own.corner_kicks, null);
  const oppCorners = safeNum(opp.corners ?? opp.corner_kicks, null);

  return { ownShots, oppShots, ownSot, oppSot, ownPossession, ownCorners, oppCorners };
}

function normalizeTeamMatch(match, teamName) {
  if (!match) return null;
  const isHome = fuzzyTeamMatch(match.home_team, teamName);
  const isAway = fuzzyTeamMatch(match.away_team, teamName);
  if (!isHome && !isAway) return null;

  const scored = isHome ? safeNum(match.home_goals, null) : safeNum(match.away_goals, null);
  const conceded = isHome ? safeNum(match.away_goals, null) : safeNum(match.home_goals, null);
  if (scored == null || conceded == null) return null;

  const xgFor = isHome ? safeNum(match.home_xg, null) : safeNum(match.away_xg, null);
  const xgAgainst = isHome ? safeNum(match.away_xg, null) : safeNum(match.home_xg, null);
  const cards = getCardSignal(match, teamName, isHome);
  const stats = extractStats(match, isHome);

  const result = scored > conceded ? 'win' : scored === conceded ? 'draw' : 'loss';
  const goalDiff = scored - conceded;
  const totalGoals = scored + conceded;
  const xgDiff = xgFor != null && xgAgainst != null ? xgFor - xgAgainst : null;
  const xgOverperformance = xgFor != null ? scored - xgFor : null;
  const defensiveOverperformance = xgAgainst != null ? xgAgainst - conceded : null;

  return {
    date: match.date || match.match_date || null,
    opponent: isHome ? match.away_team : match.home_team,
    isHome,
    scored,
    conceded,
    result,
    goalDiff,
    totalGoals,
    xgFor,
    xgAgainst,
    xgDiff,
    xgOverperformance,
    defensiveOverperformance,
    ...cards,
    ...stats,
  };
}

function classifyMemory(tm) {
  if (!tm) return { label: 'unknown', codes: [], attackSignal: 0, defenseSignal: 0, xgLuckSignal: 0, volatilitySignal: 0, reliability: 0 };

  const codes = [];
  let attackSignal = 0;
  let defenseSignal = 0;
  let xgLuckSignal = 0;
  let volatilitySignal = 0;
  let reliability = 0.45;

  if (tm.xgFor != null && tm.xgAgainst != null) reliability += 0.25;
  if (tm.ownShots != null || tm.ownSot != null) reliability += 0.15;
  if (tm.teamRed || tm.opponentRed) reliability += 0.05;
  reliability = clamp(reliability, 0.25, 0.9);

  if (tm.scored >= 3) { attackSignal += 0.06; codes.push('last_match_scored_heavily'); }
  if (tm.scored === 0) { attackSignal -= 0.05; codes.push('last_match_failed_to_score'); }
  if (tm.conceded >= 3) { defenseSignal += 0.07; volatilitySignal += 0.04; codes.push('last_match_defensive_collapse'); }
  if (tm.conceded === 0) { defenseSignal -= 0.04; codes.push('last_match_clean_sheet'); }

  if (tm.xgFor != null) {
    if (tm.xgFor >= 1.8) { attackSignal += 0.07; codes.push('last_match_attack_created_quality'); }
    if (tm.xgFor <= 0.65) { attackSignal -= 0.06; codes.push('last_match_attack_blunt'); }
  }

  if (tm.xgAgainst != null) {
    if (tm.xgAgainst >= 1.8) { defenseSignal += 0.07; codes.push('last_match_defence_allowed_quality'); }
    if (tm.xgAgainst <= 0.65) { defenseSignal -= 0.05; codes.push('last_match_defence_restricted_opponent'); }
  }

  if (tm.xgOverperformance != null) {
    if (tm.xgOverperformance >= 1.1) { xgLuckSignal -= 0.06; codes.push('last_match_attacking_overperformance'); }
    if (tm.xgOverperformance <= -0.8) { xgLuckSignal += 0.05; codes.push('last_match_attacking_underperformance'); }
  }

  if (tm.defensiveOverperformance != null) {
    if (tm.defensiveOverperformance >= 0.9 && tm.conceded === 0) { defenseSignal += 0.04; codes.push('last_match_clean_sheet_warning'); }
    if (tm.defensiveOverperformance <= -0.9) { defenseSignal -= 0.03; codes.push('last_match_defensive_underperformance'); }
  }

  if (tm.ownSot != null && tm.ownSot >= 6) { attackSignal += 0.04; codes.push('last_match_shots_on_target_momentum'); }
  if (tm.oppSot != null && tm.oppSot >= 6) { defenseSignal += 0.04; codes.push('last_match_goalkeeper_exposed'); }

  // Red-card distortion: do not overlearn from a match played in abnormal state.
  if (tm.earlyTeamRed) {
    attackSignal *= 0.65;
    defenseSignal *= 0.65;
    volatilitySignal += 0.04;
    codes.push('last_match_red_card_distortion');
  }
  if (tm.earlyOpponentRed) {
    attackSignal *= 0.75;
    defenseSignal *= 0.75;
    codes.push('last_match_opponent_red_card_boost_warning');
  }

  const finalAttack = clamp((attackSignal + xgLuckSignal) * reliability, -0.08, 0.08);
  const finalDefense = clamp(defenseSignal * reliability, -0.08, 0.08); // positive = defence looked leaky
  const finalVolatility = clamp(volatilitySignal * reliability, 0, 0.08);

  let label = 'stable';
  if (codes.includes('last_match_red_card_distortion')) label = 'distorted_by_red_card';
  else if (finalAttack >= 0.045 && finalDefense <= 0.03) label = 'attacking_momentum';
  else if (finalDefense >= 0.05) label = 'defensive_warning';
  else if (codes.includes('last_match_attacking_overperformance')) label = 'possible_lucky_attack';
  else if (codes.includes('last_match_attacking_underperformance')) label = 'unlucky_attack';
  else if (codes.includes('last_match_clean_sheet_warning')) label = 'fragile_clean_sheet';

  return {
    label,
    codes: [...new Set(codes)],
    attackSignal: Number(finalAttack.toFixed(4)),
    defenseSignal: Number(finalDefense.toFixed(4)),
    xgLuckSignal: Number((xgLuckSignal * reliability).toFixed(4)),
    volatilitySignal: Number(finalVolatility.toFixed(4)),
    reliability: Number(reliability.toFixed(3)),
  };
}

export function computeLastMatchMemory(formMatches, teamName) {
  const normalized = (formMatches || [])
    .map((m) => normalizeTeamMatch(m, teamName))
    .filter(Boolean)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const last = normalized[0] || null;
  const memory = classifyMemory(last);

  return {
    available: !!last,
    teamName,
    lastMatch: last,
    ...memory,
  };
}
