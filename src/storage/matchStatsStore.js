/**
 * matchStatsStore.js
 * Stores and retrieves historical match statistics from the match_stats table.
 * These stats come from /matches/stats.json fetched for PAST matches only.
 * They are used to build team style profiles for pre-match prediction.
 */

import db from '../config/database.js';

let tableInitialized = false;

export async function initMatchStatsTable() {
  if (tableInitialized) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS match_stats (
        match_id TEXT PRIMARY KEY,
        home_team TEXT,
        away_team TEXT,
        home_shots INTEGER,
        away_shots INTEGER,
        home_shots_on_target INTEGER,
        away_shots_on_target INTEGER,
        home_dangerous_attacks INTEGER,
        away_dangerous_attacks INTEGER,
        home_corners INTEGER,
        away_corners INTEGER,
        home_possession REAL,
        away_possession REAL,
        home_fouls INTEGER,
        away_fouls INTEGER,
        home_yellow_cards INTEGER,
        away_yellow_cards INTEGER,
        home_red_cards INTEGER,
        away_red_cards INTEGER,
        fetched_at TEXT
      )
    `);
    tableInitialized = true;
  } catch (err) {
    console.warn('[matchStatsStore] Init failed:', err.message);
  }
}

initMatchStatsTable().catch(() => {});

/**
 * Parse a numeric stat value from multiple possible field names.
 */
function parseNum(obj, ...keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val != null && val !== '') {
      const n = Number(String(val).replace('%', '').trim());
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/**
 * Normalize raw LiveScore stats response into a flat stats object.
 * Handles both object format and array-of-stat-objects format.
 */
export function normalizeMatchStats(rawStats) {
  if (!rawStats) return null;

  // Format A: Array of { name, home, away } stat objects
  // e.g. [{name: "Ball Possession", home: "55%", away: "45%"}, ...]
  if (Array.isArray(rawStats)) {
    const map = {};
    for (const s of rawStats) {
      if (s?.name) map[s.name.toLowerCase().trim()] = s;
    }

    const getSide = (name, side) => {
      const s = map[name];
      if (!s) return null;
      const raw = side === 'home'
        ? (s.home ?? s.team1 ?? s.local ?? s.value_home)
        : (s.away ?? s.team2 ?? s.visitor ?? s.value_away);
      if (raw == null || raw === '') return null;
      const n = Number(String(raw).replace('%', '').trim());
      return isNaN(n) ? null : n;
    };

    const shots = (side) =>
      getSide('shots total', side) ??
      getSide('total shots', side) ??
      getSide('shots', side);

    const onTarget = (side) =>
      getSide('shots on target', side) ??
      getSide('on target', side) ??
      getSide('shots on goal', side);

    const corners = (side) =>
      getSide('corner kicks', side) ??
      getSide('corners', side);

    const possession = (side) =>
      getSide('ball possession', side) ??
      getSide('possession', side);

    const dangerousAttacks = (side) =>
      getSide('dangerous attacks', side) ??
      getSide('dangerous attack', side);

    const fouls = (side) =>
      getSide('fouls committed', side) ??
      getSide('fouls', side);

    return {
      home_shots: shots('home'),
      away_shots: shots('away'),
      home_shots_on_target: onTarget('home'),
      away_shots_on_target: onTarget('away'),
      home_dangerous_attacks: dangerousAttacks('home'),
      away_dangerous_attacks: dangerousAttacks('away'),
      home_corners: corners('home'),
      away_corners: corners('away'),
      home_possession: possession('home'),
      away_possession: possession('away'),
      home_fouls: fouls('home'),
      away_fouls: fouls('away'),
      home_yellow_cards: getSide('yellow cards', 'home'),
      away_yellow_cards: getSide('yellow cards', 'away'),
      home_red_cards: getSide('red cards', 'home'),
      away_red_cards: getSide('red cards', 'away'),
    };
  }

  // Format B: Object with home/away sub-objects or flat keys
  const home = rawStats?.home ?? rawStats?.team1 ?? rawStats?.local ?? rawStats?.homeTeam ?? {};
  const away = rawStats?.away ?? rawStats?.team2 ?? rawStats?.visitor ?? rawStats?.awayTeam ?? {};

  // Handle top-level flat format (e.g. rawStats.ball_possession_home)
  const flat = rawStats;

  return {
    home_shots: parseNum(home, 'shots_total', 'total_shots', 'shots', 'Shots Total', 'totalShots') ?? parseNum(flat, 'home_shots', 'shots_home'),
    away_shots: parseNum(away, 'shots_total', 'total_shots', 'shots', 'Shots Total', 'totalShots') ?? parseNum(flat, 'away_shots', 'shots_away'),
    home_shots_on_target: parseNum(home, 'shots_on_target', 'on_target', 'shotsOnTarget') ?? parseNum(flat, 'home_shots_on_target'),
    away_shots_on_target: parseNum(away, 'shots_on_target', 'on_target', 'shotsOnTarget') ?? parseNum(flat, 'away_shots_on_target'),
    home_dangerous_attacks: parseNum(home, 'dangerous_attacks', 'dangerousAttacks') ?? parseNum(flat, 'home_dangerous_attacks'),
    away_dangerous_attacks: parseNum(away, 'dangerous_attacks', 'dangerousAttacks') ?? parseNum(flat, 'away_dangerous_attacks'),
    home_corners: parseNum(home, 'corner_kicks', 'corners', 'cornerKicks') ?? parseNum(flat, 'home_corners'),
    away_corners: parseNum(away, 'corner_kicks', 'corners', 'cornerKicks') ?? parseNum(flat, 'away_corners'),
    home_possession: parseNum(home, 'ball_possession', 'possession', 'ballPossession') ?? parseNum(flat, 'home_possession', 'ball_possession_home'),
    away_possession: parseNum(away, 'ball_possession', 'possession', 'ballPossession') ?? parseNum(flat, 'away_possession', 'ball_possession_away'),
    home_fouls: parseNum(home, 'fouls_committed', 'fouls') ?? parseNum(flat, 'home_fouls'),
    away_fouls: parseNum(away, 'fouls_committed', 'fouls') ?? parseNum(flat, 'away_fouls'),
    home_yellow_cards: parseNum(home, 'yellow_cards', 'yellowCards') ?? parseNum(flat, 'home_yellow_cards'),
    away_yellow_cards: parseNum(away, 'yellow_cards', 'yellowCards') ?? parseNum(flat, 'away_yellow_cards'),
    home_red_cards: parseNum(home, 'red_cards', 'redCards') ?? parseNum(flat, 'home_red_cards'),
    away_red_cards: parseNum(away, 'red_cards', 'redCards') ?? parseNum(flat, 'away_red_cards'),
  };
}

/**
 * Save match stats to DB (upsert). Silently skips if no usable data.
 */
export async function saveMatchStats(matchId, homeTeam, awayTeam, rawStats) {
  await initMatchStatsTable();
  if (!matchId || matchId === '' || matchId === 'undefined') return;

  const s = normalizeMatchStats(rawStats);
  if (!s) return;

  // Check if there's at least one non-null stat value worth storing
  const hasAnyData = Object.values(s).some((v) => v != null);
  if (!hasAnyData) {
    console.warn(`[matchStatsStore] No parseable stats for match ${matchId} — skipping save`);
    return;
  }

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO match_stats (
        match_id, home_team, away_team,
        home_shots, away_shots,
        home_shots_on_target, away_shots_on_target,
        home_dangerous_attacks, away_dangerous_attacks,
        home_corners, away_corners,
        home_possession, away_possession,
        home_fouls, away_fouls,
        home_yellow_cards, away_yellow_cards,
        home_red_cards, away_red_cards,
        fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        String(matchId),
        homeTeam || null,
        awayTeam || null,
        s.home_shots,
        s.away_shots,
        s.home_shots_on_target,
        s.away_shots_on_target,
        s.home_dangerous_attacks,
        s.away_dangerous_attacks,
        s.home_corners,
        s.away_corners,
        s.home_possession,
        s.away_possession,
        s.home_fouls,
        s.away_fouls,
        s.home_yellow_cards,
        s.away_yellow_cards,
        s.home_red_cards,
        s.away_red_cards,
        new Date().toISOString(),
      ],
    });
  } catch (err) {
    console.warn(`[matchStatsStore] Save failed for ${matchId}:`, err.message);
  }
}

export async function getMatchStatsById(matchId) {
  await initMatchStatsTable();
  try {
    const r = await db.execute({
      sql: `SELECT * FROM match_stats WHERE match_id = ? LIMIT 1`,
      args: [String(matchId)],
    });
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function getMatchStatsBulk(matchIds) {
  await initMatchStatsTable();
  if (!matchIds?.length) return [];
  try {
    const placeholders = matchIds.map(() => '?').join(',');
    const r = await db.execute({
      sql: `SELECT * FROM match_stats WHERE match_id IN (${placeholders})`,
      args: matchIds.map(String),
    });
    return r.rows || [];
  } catch {
    return [];
  }
}
