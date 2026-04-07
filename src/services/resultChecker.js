// resultChecker.js - Checks match results using LiveScore API (same IDs as fixtures table)
import db from '../config/database.js';
import { fetchResultsByDate } from './livescore.js';

export function evaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
  if (homeScore == null || awayScore == null) return 'void';
  const total = homeScore + awayScore;
  const sel = (selection || '').toLowerCase().trim();
  const mkt = (market || '').toLowerCase().trim();
  const homeName = (homeTeamName || '').toLowerCase().trim();
  const awayName = (awayTeamName || '').toLowerCase().trim();
  const isHomePick = homeName && sel.includes(homeName);
  const isAwayPick = awayName && sel.includes(awayName);
  if (mkt.includes('over') || mkt.includes('under')) {
    const om = sel.match(/over\s+(\d+\.?\d*)/i); if (om) return total > parseFloat(om[1]) ? 'win' : 'loss';
    const um = sel.match(/under\s+(\d+\.?\d*)/i); if (um) return total < parseFloat(um[1]) ? 'win' : 'loss';
  }
  if (mkt.includes('both teams') || mkt === 'btts') {
    const btts = homeScore > 0 && awayScore > 0;
    if (sel.includes('not to score') || sel === 'no') return btts ? 'loss' : 'win';
    return btts ? 'win' : 'loss';
  }
  if (mkt.includes('1x2') || mkt.includes('match result') || mkt.includes('result')) {
    if (sel === '1' || sel.includes('home win') || isHomePick) return homeScore > awayScore ? 'win' : 'loss';
    if (sel === '2' || sel.includes('away win') || isAwayPick) return awayScore > homeScore ? 'win' : 'loss';
    if (sel === 'x' || sel === 'draw') return homeScore === awayScore ? 'win' : 'loss';
  }
  if (mkt.includes('double chance')) {
    if (sel.includes('home') || sel.includes('1') || isHomePick) return homeScore >= awayScore ? 'win' : 'loss';
    if (sel.includes('away') || sel.includes('2') || isAwayPick) return awayScore >= homeScore ? 'win' : 'loss';
    return homeScore >= awayScore ? 'win' : 'loss';
  }
  if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
    if (sel.includes('home') || sel.includes('1') || isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
    if (sel.includes('away') || sel.includes('2') || isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
  }
  if (mkt.includes('home team goals') || mkt.includes('away team goals')) {
    const goals = mkt.includes('home') ? homeScore : awayScore;
    const om2 = sel.match(/over\s+(\d+\.?\d*)/i); if (om2) return goals > parseFloat(om2[1]) ? 'win' : 'loss';
    const um2 = sel.match(/under\s+(\d+\.?\d*)/i); if (um2) return goals < parseFloat(um2[1]) ? 'win' : 'loss';
  }
  return 'void';
}

export async function checkResults(dateStr) {
  const date = dateStr || (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }); })();
  console.log('[ResultChecker] Checking results for', date);
  let apiFailed = false;
  let apiFixtures = [];
  try {
    apiFixtures = await fetchResultsByDate(date);
    console.log('[ResultChecker] LiveScore results returned', apiFixtures.length, 'finished matches for', date);
  } catch (err) {
    apiFailed = true;
    console.warn('[ResultChecker] API fetch failed, using DB scores only:', err.message);
  }
  const scoreMap = {};
  const nameMap = {};
  for (const f of apiFixtures) {
    const st = (f.match_status||'').toUpperCase();
    const isFt = st === 'FT' || st === 'AET' || st === 'PEN' || st === 'FINISHED' || st === 'FULL TIME';
    if (isFt && f.home_score != null && !isNaN(Number(f.home_score))) {
      const s = { home: Number(f.home_score), away: Number(f.away_score) };
      scoreMap[f.match_id] = s;
      const hk = (f.home_team_name || '').toLowerCase().trim();
      const ak = (f.away_team_name || '').toLowerCase().trim();
      if (hk && ak) { nameMap[hk + ':' + ak] = s; nameMap[hk.split(' ')[0] + ':' + ak.split(' ')[0]] = s; }
      // Persist score back to fixtures table so DB fallback works next time
      db.execute({ sql: 'UPDATE fixtures SET home_score=?,away_score=?,match_status=? WHERE id=? AND home_score IS NULL', args:[Number(f.home_score),Number(f.away_score),'FT',f.match_id] }).catch(()=>{});
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
  // Auto-build predictions for finished fixtures that were never clicked
  try {
    const unpredicted = await db.execute({ sql: 'SELECT f.id, f.home_team_name, f.away_team_name FROM fixtures f LEFT JOIN predictions_v2 p ON p.fixture_id = f.id WHERE f.match_date LIKE ? AND p.fixture_id IS NULL', args: ['%' + date + '%'] });
    const toBuild = (unpredicted.rows || []).filter(f => scoreMap[String(f.id)]);
    if (toBuild.length > 0) {
      console.log('[ResultChecker] Auto-building', toBuild.length, 'predictions for finished fixtures...');
      const { getOrBuildPrediction } = await import('./predictionCache.js');
      await Promise.allSettled(toBuild.slice(0, 30).map(f => getOrBuildPrediction(String(f.id)).catch(() => null)));
    }
  } catch(buildErr) { console.warn('[ResultChecker] Auto-build warning:', buildErr.message); }

  const predRes = await db.execute({ sql: 'SELECT f.id, f.home_team_name, f.away_team_name, f.match_date, f.tournament_name, p.best_pick_market, p.best_pick_selection, p.best_pick_probability, p.confidence_model FROM fixtures f JOIN predictions_v2 p ON p.fixture_id = f.id WHERE f.match_date LIKE ? AND p.best_pick_selection IS NOT NULL', args: ['%' + date + '%'] });
  const fixtures = predRes.rows || [];
  console.log('[ResultChecker] Found', fixtures.length, 'predictions to check for', date);
  if (!fixtures.length) return { checked: 0, date, outcomes: { wins: 0, losses: 0, voids: 0, skipped: 0 } };
  const existing = await db.execute({ sql: 'SELECT fixture_id, outcome FROM prediction_outcomes WHERE match_date LIKE ?', args: ['%' + date + '%'] });
  const existingMap = {};
  for (const r of existing.rows || []) existingMap[String(r.fixture_id)] = r.outcome;
  const outcomes = { wins: 0, losses: 0, voids: 0, skipped: 0, updated: 0 };
  for (const fix of fixtures) {
    const fid = String(fix.id);
    const prev = existingMap[fid];
    if (prev === 'win' || prev === 'loss') { outcomes.skipped++; continue; }
    const hk = (fix.home_team_name || '').toLowerCase().trim();
    const ak = (fix.away_team_name || '').toLowerCase().trim();
    const score = scoreMap[fid] || nameMap[hk + ':' + ak] || nameMap[hk.split(' ')[0] + ':' + ak.split(' ')[0]] || null;
    const outcome = score ? evaluatePrediction(fix.best_pick_market, fix.best_pick_selection, score.home, score.away, fix.home_team_name, fix.away_team_name) : 'void';
    try {
      await db.execute({ sql: 'INSERT OR REPLACE INTO prediction_outcomes (fixture_id,home_team,away_team,match_date,tournament,predicted_market,predicted_selection,predicted_probability,model_confidence,home_score,away_score,full_score,outcome,evaluated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime("now"),datetime("now"))', args: [fid, fix.home_team_name, fix.away_team_name, fix.match_date, fix.tournament_name, fix.best_pick_market, fix.best_pick_selection, parseFloat(fix.best_pick_probability || 0), fix.confidence_model || '', score ? score.home : null, score ? score.away : null, score ? score.home + '-' + score.away : null, outcome] });
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
