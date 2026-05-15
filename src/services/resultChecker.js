// RuFlo-powered fixes for Score Phantom
// File: src/services/resultChecker.js - Unified with wsLiveScores & backtesting odds source

import db from '../config/database.js';
import { fetchFixturesByDate } from './bsd.js';
import { computeProfitUnits } from '../storage/profitUnits.js';

export function evaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
  if (homeScore == null || awayScore == null) return 'void';
  const total = homeScore + awayScore;
  const sel = (selection || '').toLowerCase().trim();
  const mkt = (market || '').toLowerCase().trim();
  const homeName = (homeTeamName || '').toLowerCase().trim();
  const awayName = (awayTeamName || '').toLowerCase().trim();
  const isHomePick = homeName && sel.includes(homeName);
  const isAwayPick = awayName && sel.includes(awayName);

  // ── Over/Under total goals markets ──────────────────────────────────────────
  // Handles: over_15, over_25, over_35, under_25, under_35, Over/Under, etc.
  if (mkt.includes('over') || mkt.includes('under')) {
    // Extract threshold from selection first (e.g. "Over 2.5 Goals" → 2.5)
    const om = sel.match(/over\s+(\d+\.?\d*)/i);
    const um = sel.match(/under\s+(\d+\.?\d*)/i);
    // Also try extracting from market key (e.g. "under_25" → 2.5)
    const mktOver  = mkt.match(/over[_\s]?(\d)(\d)?/);
    const mktUnder = mkt.match(/under[_\s]?(\d)(\d)?/);

    if (om) return total > parseFloat(om[1]) ? 'win' : 'loss';
    if (um) return total < parseFloat(um[1]) ? 'win' : 'loss';
    if (mktOver) {
      const threshold = mktOver[2] ? parseFloat(mktOver[1] + '.' + mktOver[2]) : parseFloat(mktOver[1]);
      return total > threshold ? 'win' : 'loss';
    }
    if (mktUnder) {
      const threshold = mktUnder[2] ? parseFloat(mktUnder[1] + '.' + mktUnder[2]) : parseFloat(mktUnder[1]);
      return total < threshold ? 'win' : 'loss';
    }
  }

  // ── BTTS (Both Teams To Score) ──────────────────────────────────────────────
  // Handles: btts, btts_yes, btts_no, "Both Teams to Score"
  if (mkt.includes('btts') || mkt.includes('both teams')) {
    const btts = homeScore > 0 && awayScore > 0;
    if (mkt.includes('no') || sel.includes('no') || sel.includes('not to score')) return btts ? 'loss' : 'win';
    return btts ? 'win' : 'loss';
  }

  // ── 1X2 / Match Result ─────────────────────────────────────────────────────
  // Handles: 1x2, match result, result, home_win, away_win, draw
  if (mkt.includes('1x2') || mkt.includes('match result') || mkt.includes('result') ||
      mkt === 'home_win' || mkt === 'away_win' || mkt === 'draw') {
    if (mkt === 'home_win' || sel === '1' || sel.includes('home win') || isHomePick)
      return homeScore > awayScore ? 'win' : 'loss';
    if (mkt === 'away_win' || sel === '2' || sel.includes('away win') || isAwayPick)
      return awayScore > homeScore ? 'win' : 'loss';
    if (mkt === 'draw' || sel === 'x' || sel === 'draw')
      return homeScore === awayScore ? 'win' : 'loss';
    // Fallback for generic "result" market: infer from selection
    if (homeScore > awayScore) return (sel === '1' || sel.includes('home') || isHomePick) ? 'win' : 'loss';
    if (awayScore > homeScore) return (sel === '2' || sel.includes('away') || isAwayPick) ? 'win' : 'loss';
    return (sel === 'x' || sel === 'draw') ? 'win' : 'loss';
  }

  // ── Double Chance ───────────────────────────────────────────────────────────
  // Handles: double chance, double_chance_home, double_chance_away
  if (mkt.includes('double chance') || mkt.includes('double_chance')) {
    if (mkt.includes('home') || sel.includes('1x') || sel.includes('home or draw'))
      return homeScore >= awayScore ? 'win' : 'loss';
    if (mkt.includes('away') || sel.includes('x2') || sel.includes('draw or away'))
      return awayScore >= homeScore ? 'win' : 'loss';
    if (sel.includes('12') || sel.includes('home or away'))
      return homeScore !== awayScore ? 'win' : 'loss';
    // Generic double chance: infer from selection
    if (isHomePick || sel.includes('home') || sel === '1') return homeScore >= awayScore ? 'win' : 'loss';
    if (isAwayPick || sel.includes('away') || sel === '2') return awayScore >= homeScore ? 'win' : 'loss';
    return homeScore >= awayScore ? 'win' : 'loss';
  }

  // ── Draw No Bet ─────────────────────────────────────────────────────────────
  // Handles: dnb, dnb_home, dnb_away, draw no bet
  if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
    if (mkt.includes('home') || sel.includes('home') || sel === '1' || isHomePick)
      return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    if (mkt.includes('away') || sel.includes('away') || sel === '2' || isAwayPick)
      return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    // Generic DNB: infer
    if (isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    if (isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    return 'void';
  }

  // ── Home/Away Team Goals (over/under for one team) ──────────────────────────
  // Handles: home_over_15, home_over_25, away_over_15, away_over_25,
  //          home_under_15, away_under_15, "Home Team Goals", "Away Team Goals"
  if (mkt.includes('home team goals') || mkt.startsWith('home_over') || mkt.startsWith('home_under')) {
    const om2 = sel.match(/over\s+(\d+\.?\d*)/i);
    const um2 = sel.match(/under\s+(\d+\.?\d*)/i);
    const mktO = mkt.match(/over[_\s]?(\d)(\d)?/);
    const mktU = mkt.match(/under[_\s]?(\d)(\d)?/);
    if (om2) return homeScore > parseFloat(om2[1]) ? 'win' : 'loss';
    if (um2) return homeScore < parseFloat(um2[1]) ? 'win' : 'loss';
    if (mktO) { const t = mktO[2] ? parseFloat(mktO[1]+'.'+mktO[2]) : parseFloat(mktO[1]); return homeScore > t ? 'win' : 'loss'; }
    if (mktU) { const t = mktU[2] ? parseFloat(mktU[1]+'.'+mktU[2]) : parseFloat(mktU[1]); return homeScore < t ? 'win' : 'loss'; }
  }
  if (mkt.includes('away team goals') || mkt.startsWith('away_over') || mkt.startsWith('away_under')) {
    const om3 = sel.match(/over\s+(\d+\.?\d*)/i);
    const um3 = sel.match(/under\s+(\d+\.?\d*)/i);
    const mktO = mkt.match(/over[_\s]?(\d)(\d)?/);
    const mktU = mkt.match(/under[_\s]?(\d)(\d)?/);
    if (om3) return awayScore > parseFloat(om3[1]) ? 'win' : 'loss';
    if (um3) return awayScore < parseFloat(um3[1]) ? 'win' : 'loss';
    if (mktO) { const t = mktO[2] ? parseFloat(mktO[1]+'.'+mktO[2]) : parseFloat(mktO[1]); return awayScore > t ? 'win' : 'loss'; }
    if (mktU) { const t = mktU[2] ? parseFloat(mktU[1]+'.'+mktU[2]) : parseFloat(mktU[1]); return awayScore < t ? 'win' : 'loss'; }
  }

  // ── Asian Handicap (future-proofing) ────────────────────────────────────────
  if (mkt.includes('handicap') || mkt.includes('ahc')) {
    const hm = sel.match(/([+-]?\d+\.?\d*)/);
    if (hm) {
      const line = parseFloat(hm[1]);
      const isHome = sel.includes('home') || sel === '1' || isHomePick;
      const diff = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
      const adjusted = diff + (isHome ? -line : line);
      if (adjusted > 0.25) return 'win';
      if (adjusted < -0.25) return 'loss';
      return 'void'; // half-win/void on exact line
    }
  }

  return 'void';
}

export async function checkResults(dateStr) {
  const date = dateStr || (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }); })();
  console.log('[ResultChecker] Checking results for', date);
  let apiFailed = false;
  let apiFixtures = [];
  try {
    apiFixtures = await fetchFixturesByDate(date);
    console.log('[ResultChecker] BSD returned', apiFixtures.length, 'events for', date);
  } catch (err) {
    apiFailed = true;
    console.warn('[ResultChecker] BSD fetch failed, using DB scores only:', err.message);
  }
  const scoreMap = {};
  const nameMap = {};
  for (const f of apiFixtures) {
    // BSD uses status='finished' and id (not match_id)
    const isFinal = f.status === 'finished' || f.match_status === 'FT' || f.match_status === 'AET';
    const hScore  = f.home_score ?? f.home_score_ht ?? null;
    if (isFinal && hScore != null) {
      const s = { home: Number(f.home_score), away: Number(f.away_score) };
      const fid = String(f.id || f.match_id);
      scoreMap[fid] = s;
      const hk = (f.home_team || f.home_team_name || '').toLowerCase().trim();
      const ak = (f.away_team || f.away_team_name || '').toLowerCase().trim();
      if (hk && ak) { nameMap[hk + ':' + ak] = s; nameMap[hk.split(' ')[0] + ':' + ak.split(' ')[0]] = s; }
    }
  }
  const dbScores = await db.execute({ sql: "SELECT * FROM fixtures WHERE match_date LIKE ? AND match_status IN ('FT','AET','Pen') AND home_score IS NOT NULL", args: ['%' + date + '%'] });
  for (const f of dbScores.rows || []) {
    if (!scoreMap[f.id]) {
      const s = { home: Number(f.home_score), away: Number(f.away_score) };
      scoreMap[String(f.id)] = s;
      const hk = (f.home_team_name || '').toLowerCase().trim();
      const ak = (f.away_team_name || '').toLowerCase().trim();
      if (hk && ak) { nameMap[hk + ':' + ak] = s; }
    }
  }
  console.log('[ResultChecker] Score map: ' + Object.keys(scoreMap).length + ' by ID, ' + Object.keys(nameMap).length + ' by name');
  // Track which fixtures were auto-built (retroactive predictions) so we can flag them
  const retroactiveFixtureIds = new Set();

  // Auto-build predictions for finished fixtures that were never clicked
  // NOTE: These are RETROACTIVE predictions — the engine didn't predict these before the match.
  // They should NOT be counted in the user-facing track record.
  try {
    const unpredicted = await db.execute({ sql: 'SELECT f.id, f.home_team_name, f.away_team_name FROM fixtures f LEFT JOIN predictions_v2 p ON p.fixture_id = f.id WHERE f.match_date LIKE ? AND p.fixture_id IS NULL', args: ['%' + date + '%'] });
    const toBuild = (unpredicted.rows || []).filter(f => scoreMap[String(f.id)]);
    if (toBuild.length > 0) {
      console.log('[ResultChecker] Auto-building', toBuild.length, 'RETROACTIVE predictions for finished fixtures...');
      const { getOrBuildPrediction } = await import('./predictionCache.js');
      await Promise.allSettled(toBuild.slice(0, 30).map(f => {
        retroactiveFixtureIds.add(String(f.id));
        return getOrBuildPrediction(String(f.id)).catch(() => null);
      }));
    }
  } catch(buildErr) { console.warn('[ResultChecker] Auto-build warning:', buildErr.message); }

  const predRes = await db.execute({ sql: 'SELECT f.id, f.home_team_name, f.away_team_name, f.match_date, f.tournament_name, p.best_pick_market, p.best_pick_selection, p.best_pick_probability, p.confidence_model, p.best_pick_implied_probability, p.best_pick_edge FROM fixtures f JOIN predictions_v2 p ON p.fixture_id = f.id WHERE f.match_date LIKE ? AND p.best_pick_selection IS NOT NULL', args: ['%' + date + '%'] });
  const fixtures = predRes.rows || [];
  console.log('[ResultChecker] Found', fixtures.length, 'predictions to check for', date);
  if (!fixtures.length) return { checked: 0, date, outcomes: { wins: 0, losses: 0, voids: 0, skipped: 0, alreadyResolved: 0 } };
  const existing = await db.execute({ sql: 'SELECT fixture_id, outcome FROM prediction_outcomes WHERE match_date LIKE ?', args: ['%' + date + '%'] });
  const existingMap = {};
  for (const r of existing.rows || []) existingMap[String(r.fixture_id)] = r.outcome;
  const outcomes = { wins: 0, losses: 0, voids: 0, skipped: 0, alreadyResolved: 0, updated: 0 };

  // Pre-fetch all prediction_picks for these fixtures in one query (avoids N+1 lookups)
  const fixtureIds = fixtures.map(f => String(f.id));
  const picksMap = {};
  if (fixtureIds.length > 0) {
    try {
      const placeholders = fixtureIds.map(() => '?').join(',');
      const picksRes = await db.execute({
        sql: `SELECT id, fixture_id, market_key, selection, model_probability, bookmaker_odds, model_confidence
              FROM prediction_picks
              WHERE fixture_id IN (${placeholders})
                AND prediction_source = 'pre_match'
                AND kickoff_at IS NOT NULL
                AND generated_at < kickoff_at
              ORDER BY generated_at DESC`,
        args: fixtureIds,
      });
      for (const p of picksRes.rows || []) {
        // Keep only the first (latest) pick per fixture
        if (!picksMap[String(p.fixture_id)]) {
          picksMap[String(p.fixture_id)] = p;
        }
      }
      console.log('[ResultChecker] Found', Object.keys(picksMap).length, 'pre-match picks for odds lookup');
    } catch (pickErr) {
      console.warn('[ResultChecker] Could not fetch prediction_picks, falling back to implied_probability:', pickErr.message);
    }
  }

  for (const fix of fixtures) {
    const fid = String(fix.id);
    const prev = existingMap[fid];
    if (prev === 'win' || prev === 'loss') { outcomes.alreadyResolved++; continue; }
    const hk = (fix.home_team_name || '').toLowerCase().trim();
    const ak = (fix.away_team_name || '').toLowerCase().trim();
    const score = scoreMap[fid] || nameMap[hk + ':' + ak] || nameMap[hk.split(' ')[0] + ':' + ak.split(' ')[0]] || null;

    // ── Key fix: if no score found, SKIP — don't write void ──────────────────
    // Writing void when the score is simply missing inflates the void count.
    // Only evaluate (and write void) when we have a confirmed final score.
    if (!score) {
      outcomes.skipped++;
      continue;
    }

    const outcome = evaluatePrediction(fix.best_pick_market, fix.best_pick_selection, score.home, score.away, fix.home_team_name, fix.away_team_name);
    
    // ── Unified odds source: read bookmaker_odds from prediction_picks ────────
    // This matches how wsLiveScores.js and backtesting.js calculate profit_units.
    // Falls back to deriving from implied_probability if no pick found.
    const pick = picksMap[fid] || null;
    const bookmakerOdds = pick?.bookmaker_odds != null
      ? parseFloat(pick.bookmaker_odds)
      : (() => {
          const impliedProb = parseFloat(fix.best_pick_implied_probability || 0);
          return impliedProb > 0 ? (1 / impliedProb) : null;
        })();
    const profitUnits = computeProfitUnits(outcome, bookmakerOdds, 1);
    const pickId = pick?.id != null ? Number(pick.id) : null;
    const market = pick?.market_key || fix.best_pick_market;
    const selection = pick?.selection || fix.best_pick_selection;
    const probability = pick?.model_probability ?? parseFloat(fix.best_pick_probability || 0);
    const modelConfidence = pick?.model_confidence || fix.confidence_model || '';
    
    // Determine if this is a sharp value pick (high edge)
    const edge = parseFloat(fix.best_pick_edge || 0);
    const isSharpValue = edge > 0.15; // Edge > 15% is considered sharp value
    
    const isRetroactive = retroactiveFixtureIds.has(fid) ? 1 : 0;

    try {
      // ── Unified INSERT: same columns as wsLiveScores.js and backtesting.js + source tracking ──
      await db.execute({ 
        sql: `INSERT INTO prediction_outcomes (
          fixture_id, sport_key, home_team, away_team, match_date, tournament,
          pick_id, predicted_market, predicted_selection, predicted_probability,
          best_pick_odds, stake_units, profit_units,
          model_confidence,
          home_score, away_score, full_score,
          outcome, result_status, is_sharp_value,
          prediction_source, is_retroactive,
          evaluated_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (fixture_id) DO UPDATE SET
          sport_key = EXCLUDED.sport_key,
          pick_id = EXCLUDED.pick_id,
          predicted_market = EXCLUDED.predicted_market,
          predicted_selection = EXCLUDED.predicted_selection,
          predicted_probability = EXCLUDED.predicted_probability,
          best_pick_odds = EXCLUDED.best_pick_odds,
          stake_units = EXCLUDED.stake_units,
          profit_units = EXCLUDED.profit_units,
          model_confidence = EXCLUDED.model_confidence,
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          full_score = EXCLUDED.full_score,
          outcome = EXCLUDED.outcome,
          result_status = EXCLUDED.result_status,
          is_sharp_value = EXCLUDED.is_sharp_value,
          prediction_source = EXCLUDED.prediction_source,
          is_retroactive = EXCLUDED.is_retroactive,
          evaluated_at = CURRENT_TIMESTAMP`, 
        args: [
          fid, 'football', fix.home_team_name, fix.away_team_name, fix.match_date, fix.tournament_name,
          pickId, market, selection, parseFloat(probability || 0),
          bookmakerOdds != null ? parseFloat(bookmakerOdds) : null, 1, profitUnits,
          modelConfidence || null,
          score.home, score.away, score.home + '-' + score.away,
          outcome, outcome, isSharpValue ? 1 : 0,
          'live', isRetroactive,
        ] 
      });
      if (prev === 'void') outcomes.updated++;
      else outcomes[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'voids']++;
    } catch (e) { console.error('[ResultChecker] DB error for', fid, ':', e.message); }
  }
  console.log('[ResultChecker] Done for ' + date + ':', outcomes);
  return { checked: fixtures.length, date, outcomes };
}


export async function backfillResults(daysBack = 7) {
  const results = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    const r = await checkResults(dateStr);
    results.push(r);
    await new Promise(r2 => setTimeout(r2, 1500));
  }
  return results;
}