/**
 * resultChecker.js
 * Fetches real match scores from LiveScore API for a given date,
 * evaluates stored predictions, and writes outcomes to prediction_outcomes.
 * 
 * Run daily after midnight (e.g. 2 AM Lagos) so yesterday's results are complete.
 */
import axios from 'axios';
import db from '../config/database.js';

const BASE = 'https://livescore-api.com/api-client';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function lsGet(path, params = {}) {
  await sleep(500);
  const KEY = process.env.LIVESCORE_API_KEY;
  const SECRET = process.env.LIVESCORE_API_SECRET;
  if (!KEY || !SECRET) throw new Error('Missing LiveScore API credentials');
  const res = await axios.get(`${BASE}${path}`, {
    params: { key: KEY, secret: SECRET, ...params },
    timeout: 15000,
  });
  return res.data;
}

/**
 * Parse "2 - 1" or "2-1" → { home: 2, away: 1 } or null
 */
function parseScore(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/\s/g, '');
  const parts = clean.split('-');
  if (parts.length !== 2) return null;
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  if (isNaN(home) || isNaN(away)) return null;
  return { home, away };
}

/**
 * Evaluate a prediction market/selection against actual score.
 * Returns 'win', 'loss', or 'void'
 */
function evaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
  if (homeScore == null || awayScore == null) return 'void';
  const total = homeScore + awayScore;
  const sel = (selection || '').toLowerCase().trim();
  const mkt = (market || '').toLowerCase().trim();
  const homeName = (homeTeamName || '').toLowerCase().trim();
  const awayName = (awayTeamName || '').toLowerCase().trim();

  // Helper: check if selection refers to the home or away team by name
  const isHomePick = homeName && sel.includes(homeName);
  const isAwayPick = awayName && sel.includes(awayName);

  // ── Over/Under markets ──────────────────────────────────────────────────
  if (mkt === 'over/under' || mkt.includes('over') || mkt.includes('under')) {
    // Selection like "Over 2.5 Goals", "Under 1.5 Goals", "Over 1.5 Goals"
    const overMatch = sel.match(/over\s+(\d+\.?\d*)/i);
    const underMatch = sel.match(/under\s+(\d+\.?\d*)/i);
    if (overMatch) {
      const line = parseFloat(overMatch[1]);
      return total > line ? 'win' : 'loss';
    }
    if (underMatch) {
      const line = parseFloat(underMatch[1]);
      return total < line ? 'win' : 'loss';
    }
  }

  // ── Both Teams to Score ─────────────────────────────────────────────────
  if (mkt.includes('both teams') || mkt === 'btts') {
    const btts = homeScore > 0 && awayScore > 0;
    if (sel.includes('not to score') || sel === 'no') return btts ? 'loss' : 'win';
    return btts ? 'win' : 'loss';
  }

  // ── Match Result / 1X2 ─────────────────────────────────────────────────
  if (mkt.includes('1x2') || mkt.includes('match result') || mkt.includes('result')) {
    if (sel === '1' || sel.includes('home win') || isHomePick) return homeScore > awayScore ? 'win' : 'loss';
    if (sel === '2' || sel.includes('away win') || isAwayPick) return awayScore > homeScore ? 'win' : 'loss';
    if (sel === 'x' || sel === 'draw') return homeScore === awayScore ? 'win' : 'loss';
  }

  // ── Double Chance ───────────────────────────────────────────────────────
  if (mkt.includes('double chance')) {
    if (sel.includes('home') || sel.includes('1') || isHomePick) {
      // "Home or Draw" / "TeamName or Draw" — win if home wins OR draw
      return homeScore >= awayScore ? 'win' : 'loss';
    }
    if (sel.includes('away') || sel.includes('2') || isAwayPick) {
      // "Away or Draw" / "TeamName or Draw" — win if away wins OR draw
      return awayScore >= homeScore ? 'win' : 'loss';
    }
    if (sel.includes('or draw')) {
      // Fallback: if we can't tell which team, treat as home DC
      return homeScore >= awayScore ? 'win' : 'loss';
    }
  }

  // ── Draw No Bet ─────────────────────────────────────────────────────────
  if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
    if (sel.includes('home') || sel.includes('1') || isHomePick) {
      return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    }
    if (sel.includes('away') || sel.includes('2') || isAwayPick) {
      return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    }
  }

  // ── Home/Away Team Goals (individual team Over/Under) ───────────────────
  if (mkt.includes('home team goals') || mkt.includes('away team goals')) {
    const goals = mkt.includes('home') ? homeScore : awayScore;
    const overMatch = sel.match(/over\s+(\d+\.?\d*)/i);
    const underMatch = sel.match(/under\s+(\d+\.?\d*)/i);
    if (overMatch) return goals > parseFloat(overMatch[1]) ? 'win' : 'loss';
    if (underMatch) return goals < parseFloat(underMatch[1]) ? 'win' : 'loss';
  }

  // Unknown market — can't evaluate
  return 'void';
}

/**
 * Fetch yesterday's scores from LiveScore API and populate prediction_outcomes.
 * Returns { checked, outcomes: { wins, losses, voids, skipped } }
 */
export async function checkResults(dateStr) {
  const date = dateStr || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
  })();

  console.log(`[ResultChecker] Checking results for ${date}...`);

  // 1. Get all fixtures for this date that have predictions
  const fixtureRes = await db.execute({
    sql: `SELECT f.id, f.home_team_name, f.away_team_name, f.tournament_name, f.match_date,
                 p.best_pick_market, p.best_pick_selection, p.best_pick_probability, p.confidence_model
          FROM fixtures f
          JOIN predictions_v2 p ON p.fixture_id = f.id
          WHERE f.match_date LIKE ?
            AND p.best_pick_selection IS NOT NULL`,
    args: [`%${date}%`],
  });

  const fixtures = fixtureRes.rows || [];
  console.log(`[ResultChecker] Found ${fixtures.length} predictions to check for ${date}`);

  if (fixtures.length === 0) return { checked: 0, outcomes: { wins: 0, losses: 0, voids: 0, skipped: 0 } };

  // 2. Fetch actual scores from LiveScore API — paginate through all matches
  const scoreMap = {}; // fixture_id → { home, away }
  let page = 1;
  let apiCallsMade = 0;
  while (true) {
    try {
      const data = await lsGet('/fixtures/matches.json', { date, page });
      const apiFixtures = data.data?.fixtures || [];
      if (!apiFixtures.length) break;

      for (const f of apiFixtures) {
        const id = String(f.id || f.match_id || '');
        const score = parseScore(f.ft_score || f.score);
        if (id && score) scoreMap[id] = score;
      }
      apiCallsMade++;
      if (apiFixtures.length < 50) break; // last page
      page++;
      if (page > 20) break; // safety
    } catch (err) {
      console.error(`[ResultChecker] API error page ${page}:`, err.message);
      break;
    }
  }

  console.log(`[ResultChecker] Retrieved scores for ${Object.keys(scoreMap).length} matches (${apiCallsMade} API calls)`);

  // 3. Check which fixtures already have outcomes (avoid duplicates)
  const existingRes = await db.execute({
    sql: `SELECT fixture_id FROM prediction_outcomes WHERE match_date LIKE ?`,
    args: [`%${date}%`],
  });
  const existing = new Set((existingRes.rows || []).map(r => String(r.fixture_id)));

  // 4. Evaluate each prediction and insert outcome
  const outcomes = { wins: 0, losses: 0, voids: 0, skipped: 0 };
  for (const fix of fixtures) {
    const fid = String(fix.id);
    if (existing.has(fid)) {
      outcomes.skipped++;
      continue;
    }

    const score = scoreMap[fid];
    const outcome = score
      ? evaluatePrediction(fix.best_pick_market, fix.best_pick_selection, score.home, score.away, fix.home_team_name, fix.away_team_name)
      : 'void'; // no score available yet

    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO prediction_outcomes
              (fixture_id, home_team, away_team, match_date, tournament,
               predicted_market, predicted_selection, predicted_probability, model_confidence,
               home_score, away_score, full_score, outcome, evaluated_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          fid,
          fix.home_team_name, fix.away_team_name,
          fix.match_date, fix.tournament_name,
          fix.best_pick_market, fix.best_pick_selection,
          parseFloat(fix.best_pick_probability || 0),
          fix.confidence_model || '',
          score?.home ?? null, score?.away ?? null,
          score ? `${score.home}-${score.away}` : null,
          outcome,
        ],
      });
      outcomes[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'voids']++;
    } catch (err) {
      console.error(`[ResultChecker] Insert failed for ${fid}:`, err.message);
    }
  }

  console.log(`[ResultChecker] Done for ${date}:`, outcomes);
  return { checked: fixtures.length, date, outcomes };
}

/**
 * Run result checking for a date range (used for backfilling).
 */
export async function backfillResults(daysBack = 7) {
  const results = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const r = await checkResults(dateStr);
    results.push(r);
    await sleep(2000); // rate limit
  }
  return results;
}
