import { bsdFetch } from './bsd.js';

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.matches)) return value.matches;
  if (Array.isArray(value?.career)) return value.career;
  if (Array.isArray(value?.transfers)) return value.transfers;
  return [];
}

export async function fetchPlayerCareer(playerId) {
  if (!playerId) return null;
  return bsdFetch(`/players/${playerId}/career/`, {}, { cacheable: true }).catch(() => null);
}

export async function fetchPlayerTransfers(playerId) {
  if (!playerId) return null;
  return bsdFetch(`/players/${playerId}/transfers/`, {}, { cacheable: true }).catch(() => null);
}

export async function fetchPlayerNationalTeam(playerId) {
  if (!playerId) return null;
  return bsdFetch(`/players/${playerId}/national-team/`, {}, { cacheable: true }).catch(() => null);
}

export async function fetchRefereeMatches(refereeId, params = {}) {
  if (!refereeId) return [];
  const data = await bsdFetch(`/referees/${refereeId}/matches/`, { limit: 30, ...params }, { cacheable: true }).catch(() => null);
  return asArray(data);
}

function playerIdOf(row = {}) {
  return row?.player?.id || row?.player_id || row?.playerId || row?.id || null;
}

function playerNameOf(row = {}) {
  return row?.player?.name || row?.player_name || row?.name || row?.short_name || '';
}

function playerTeamIdOf(row = {}) {
  return row?.team_id || row?.teamId || row?.team?.id || row?.player?.team_id || null;
}

function summarizeCareer(careerData) {
  const rows = asArray(careerData);
  if (!rows.length) return null;
  let minutes = 0, goals = 0, assists = 0, ratingSum = 0, ratingN = 0, appearances = 0;
  for (const r of rows.slice(0, 6)) {
    minutes += num(r.minutes_played ?? r.minutes, 0) || 0;
    goals += num(r.goals, 0) || 0;
    assists += num(r.assists, 0) || 0;
    appearances += num(r.appearances ?? r.matches ?? r.games, 0) || 0;
    const rating = num(r.average_rating ?? r.avg_rating ?? r.rating, null);
    if (rating != null) { ratingSum += rating; ratingN++; }
  }
  return {
    minutes,
    appearances,
    goals,
    assists,
    avgRating: ratingN ? Number((ratingSum / ratingN).toFixed(2)) : null,
    goalContributionRate: minutes > 0 ? Number(((goals + assists) / (minutes / 90)).toFixed(3)) : null,
  };
}

export async function enrichTopPlayerCareers(playerStats = [], { homeTeamId = null, awayTeamId = null, maxPerTeam = 4 } = {}) {
  const rows = asArray(playerStats).flatMap((entry) => Array.isArray(entry?.players) ? entry.players : [entry]).filter(Boolean);
  if (!rows.length) return { home: [], away: [], summary: null };

  const scored = rows
    .map((p) => {
      const xg = num(p.expected_goals ?? p.xg, 0) || 0;
      const xa = num(p.expected_assists ?? p.xa, 0) || 0;
      const rating = num(p.rating, 0) || 0;
      return { raw: p, playerId: playerIdOf(p), teamId: playerTeamIdOf(p), name: playerNameOf(p), score: xg + xa + rating / 10 };
    })
    .filter(p => p.playerId)
    .sort((a, b) => b.score - a.score);

  const homeTop = scored.filter(p => homeTeamId && String(p.teamId) === String(homeTeamId)).slice(0, maxPerTeam);
  const awayTop = scored.filter(p => awayTeamId && String(p.teamId) === String(awayTeamId)).slice(0, maxPerTeam);

  async function attachCareer(p) {
    const career = await fetchPlayerCareer(p.playerId);
    return {
      playerId: p.playerId,
      name: p.name,
      teamId: p.teamId,
      liveScore: Number(p.score.toFixed(3)),
      career: summarizeCareer(career),
    };
  }

  const [home, away] = await Promise.all([
    Promise.all(homeTop.map(attachCareer)),
    Promise.all(awayTop.map(attachCareer)),
  ]);

  const sumSide = (side) => side.reduce((acc, p) => {
    acc.liveScore += p.liveScore || 0;
    acc.careerGoalContribution += p.career?.goalContributionRate || 0;
    acc.avgRatingSum += p.career?.avgRating || 0;
    acc.ratingN += p.career?.avgRating ? 1 : 0;
    return acc;
  }, { liveScore: 0, careerGoalContribution: 0, avgRatingSum: 0, ratingN: 0 });

  const h = sumSide(home);
  const a = sumSide(away);

  return {
    home,
    away,
    summary: {
      homeCorePlayerScore: Number((h.liveScore + h.careerGoalContribution).toFixed(3)),
      awayCorePlayerScore: Number((a.liveScore + a.careerGoalContribution).toFixed(3)),
      corePlayerGap: Number(((h.liveScore + h.careerGoalContribution) - (a.liveScore + a.careerGoalContribution)).toFixed(3)),
      homeCoreAvgRating: h.ratingN ? Number((h.avgRatingSum / h.ratingN).toFixed(2)) : null,
      awayCoreAvgRating: a.ratingN ? Number((a.avgRatingSum / a.ratingN).toFixed(2)) : null,
    },
  };
}

export async function buildRefereeVolatilityProfile(referee) {
  const refereeId = referee?.id || referee?.referee_id || null;
  const matches = await fetchRefereeMatches(refereeId).catch(() => []);

  const yellows = num(referee?.avg_yellow_cards ?? referee?.yellow_cards ?? referee?.yellowCards, null);
  const reds = num(referee?.avg_red_cards ?? referee?.red_cards ?? referee?.redCards, null);
  const fouls = num(referee?.avg_fouls ?? referee?.fouls, null);
  const goals = num(referee?.avg_goals ?? referee?.avg_goals_per_match ?? referee?.goals_per_match, null);

  let matchYellows = 0, matchReds = 0, matchGoals = 0, n = 0;
  for (const m of matches.slice(0, 20)) {
    const y = num(m.yellow_cards ?? m.yellows, null);
    const r = num(m.red_cards ?? m.reds, null);
    const g = num(m.total_goals ?? m.goals, null);
    if (y != null || r != null || g != null) {
      matchYellows += y || 0;
      matchReds += r || 0;
      matchGoals += g || 0;
      n++;
    }
  }

  const avgYellow = yellows ?? (n ? matchYellows / n : null);
  const avgRed = reds ?? (n ? matchReds / n : null);
  const avgGoals = goals ?? (n ? matchGoals / n : null);
  const strictness = Math.max(0, Math.min(1, ((avgYellow ?? 4) / 7) + ((avgRed ?? 0.15) * 0.55)));
  const chaos = Math.max(0, Math.min(1, strictness * 0.7 + ((avgRed ?? 0) > 0.25 ? 0.2 : 0)));

  return {
    refereeId,
    name: referee?.name || null,
    matchesSampled: n,
    avgYellowCards: avgYellow != null ? Number(avgYellow.toFixed(2)) : null,
    avgRedCards: avgRed != null ? Number(avgRed.toFixed(2)) : null,
    avgFouls: fouls,
    avgGoals: avgGoals != null ? Number(avgGoals.toFixed(2)) : null,
    strictness: Number(strictness.toFixed(3)),
    chaos: Number(chaos.toFixed(3)),
    cardsWarning: strictness >= 0.75,
    redCardWarning: (avgRed ?? 0) >= 0.25,
  };
}

export function extractMetadataInsights(metadata) {
  if (!metadata) return { facts: [], preview: null, jerseys: null, reasonCodes: [] };
  const facts = [
    ...(Array.isArray(metadata.funfacts) ? metadata.funfacts : []),
    ...(Array.isArray(metadata.facts) ? metadata.facts : []),
    ...(Array.isArray(metadata.pre_match_facts) ? metadata.pre_match_facts : []),
  ].map((f) => typeof f === 'string' ? f : (f?.text || f?.fact || '')).filter(Boolean).slice(0, 8);

  const preview = metadata.ai_preview || metadata.preview || metadata.match_preview || null;
  const jerseys = metadata.jerseys || null;
  const text = [...facts, preview || ''].join(' ').toLowerCase();
  const reasonCodes = [];
  if (/unbeaten|not lost|without defeat/.test(text)) reasonCodes.push('metadata_unbeaten_signal');
  if (/failed to score|without scoring|goalless/.test(text)) reasonCodes.push('metadata_scoring_warning');
  if (/clean sheet|shutout/.test(text)) reasonCodes.push('metadata_clean_sheet_signal');
  if (/derby|rival/.test(text)) reasonCodes.push('metadata_derby_context');
  if (/over 2\.5|high scoring|goals/.test(text)) reasonCodes.push('metadata_goals_trend');

  return { facts, preview, jerseys, reasonCodes };
}
