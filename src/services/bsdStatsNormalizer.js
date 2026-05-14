function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRatio(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    if (value.pct != null) return num(value.pct, null);
    if (value.value != null && value.total != null && Number(value.total) > 0) {
      return Number(((Number(value.value) / Number(value.total)) * 100).toFixed(1));
    }
  }
  return null;
}

function normalizeTeamStats(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ...raw,
    total_shots: num(firstDefined(raw.total_shots, raw.shots, raw.totalShots), null),
    shots_on_target: num(firstDefined(raw.shots_on_target, raw.shotsOnTarget, raw.on_target), null),
    ball_possession: num(firstDefined(raw.ball_possession, raw.possession, raw.possession_pct), null),
    pass_accuracy_pct: num(firstDefined(raw.pass_accuracy_pct, raw.passAccuracyPct, normalizeRatio(raw.passes)), null),
    attack: num(firstDefined(raw.attack, raw.attacks), null),
    dangerous_attack: num(firstDefined(raw.dangerous_attack, raw.dangerous_attacks, raw.dangerousAttack), null),
    ball_safe: num(firstDefined(raw.ball_safe, raw.safe_attacks, raw.ballSafe), null),
    xg: raw.xg || { actual: num(firstDefined(raw.actual_xg, raw.expected_goals, raw.xg_actual), null) },
  };
}

function normalizeMomentum(rawMomentum = []) {
  return asArray(rawMomentum)
    .map((row) => {
      const minute = num(firstDefined(row.minute, row.min, row.m, row.time), null);
      const value = num(firstDefined(row.value, row.v, row.pressure, row.momentum), null);
      if (minute == null || value == null) return null;
      return { ...row, minute, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.minute - b.minute);
}

function normalizeShotType(row = {}) {
  const raw = String(firstDefined(row.type, row.result, row.outcome, row.shot_type, '')).toLowerCase();
  if (raw.includes('goal')) return 'goal';
  if (raw.includes('saved') || raw.includes('save')) return 'attempt_saved';
  if (raw.includes('block')) return 'blocked';
  if (raw.includes('miss') || raw.includes('off')) return 'miss';
  return raw || 'shot';
}

function normalizeShotmap(rawShotmap = [], homeTeamId = null, awayTeamId = null) {
  return asArray(rawShotmap)
    .map((shot) => {
      const pos = shot.pos || shot.position || shot.coordinates || {};
      const x = num(firstDefined(pos.x, shot.x, shot.coord_x, shot.coordinate_x), null);
      const y = num(firstDefined(pos.y, shot.y, shot.coord_y, shot.coordinate_y), null);
      const minute = num(firstDefined(shot.minute, shot.min, shot.m, shot.time), null);
      const teamId = firstDefined(shot.team_id, shot.teamId, shot.team);
      const isHome = firstDefined(
        shot.home,
        shot.is_home,
        shot.isHome,
        homeTeamId != null && teamId != null ? String(teamId) === String(homeTeamId) : null
      );

      if (x == null || y == null) return null;

      return {
        ...shot,
        min: minute,
        minute,
        type: normalizeShotType(shot),
        home: Boolean(isHome),
        team_id: teamId ?? null,
        pid: firstDefined(shot.pid, shot.player_id, shot.playerId, null),
        player: firstDefined(shot.player, shot.player_name, shot.playerName, null),
        xg: num(firstDefined(shot.xg, shot.expected_goals, shot.expectedGoals), 0),
        body_part: firstDefined(shot.body_part, shot.bodyPart, null),
        situation: firstDefined(shot.situation, shot.play_pattern, null),
        pos: { x, y },
      };
    })
    .filter(Boolean);
}

function normalizeXgPerMinute(raw = []) {
  return asArray(raw)
    .map((row) => {
      const minute = num(firstDefined(row.minute, row.min, row.m, row.time), null);
      if (minute == null) return null;
      return {
        ...row,
        minute,
        xg_home: num(firstDefined(row.xg_home, row.home_xg, row.home), 0),
        xg_away: num(firstDefined(row.xg_away, row.away_xg, row.away), 0),
        cum_home: num(firstDefined(row.cum_home, row.cumulative_home, row.home_cumulative), null),
        cum_away: num(firstDefined(row.cum_away, row.cumulative_away, row.away_cumulative), null),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.minute - b.minute);
}

function summarizeStats(stats = {}) {
  const home = normalizeTeamStats(stats.home || {});
  const away = normalizeTeamStats(stats.away || {});
  if (!home && !away) return null;
  return {
    home,
    away,
    summary: {
      totalShots: (home?.total_shots || 0) + (away?.total_shots || 0),
      totalXg: Number(((num(home?.xg?.actual, 0) || 0) + (num(away?.xg?.actual, 0) || 0)).toFixed(2)),
      homeDanger: home?.dangerous_attack ?? null,
      awayDanger: away?.dangerous_attack ?? null,
      homePossession: home?.ball_possession ?? null,
      awayPossession: away?.ball_possession ?? null,
    },
  };
}

export function normalizeEventStatsPayload(payload, homeTeamId = null, awayTeamId = null) {
  const statsPayload = payload?.stats && (payload.stats.home || payload.stats.away || payload.stats.stats)
    ? payload.stats
    : payload;

  const rawStats = statsPayload?.stats || statsPayload?.matchStats || null;
  const matchStats = rawStats ? summarizeStats(rawStats) : null;
  const shotmap = normalizeShotmap(firstDefined(statsPayload?.shotmap, payload?.shotmap, []), homeTeamId, awayTeamId);
  const momentum = normalizeMomentum(firstDefined(statsPayload?.momentum, payload?.momentum, []));
  const xg_per_minute = normalizeXgPerMinute(firstDefined(statsPayload?.xg_per_minute, payload?.xg_per_minute, []));
  const average_positions = firstDefined(statsPayload?.average_positions, payload?.average_positions, null);

  return {
    matchStats,
    shotmap,
    momentum,
    xg_per_minute,
    average_positions,
    actualHomeXg: num(firstDefined(matchStats?.home?.xg?.actual, payload?.actual_home_xg, payload?.home_xg_live), null),
    actualAwayXg: num(firstDefined(matchStats?.away?.xg?.actual, payload?.actual_away_xg, payload?.away_xg_live), null),
  };
}
