import { broadcastPush, saveNotification } from './pushService.js';
// wsLiveScores.js - SportAPI WebSocket client + SSE push to frontend
import db from '../config/database.js';
import { fetchLiveMatches } from './livescore.js';

const sseClients = new Set();

export function addSseClient(res) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function broadcast(data) {
  const payload = 'data: ' + JSON.stringify(data) + '\n\n';
  for (const client of sseClients) {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  }
}


async function notifyMatchSubscribers(fixtureId, homeTeam, awayTeam, homeScore, awayScore, minute) {
  try {
    const r = await db.execute({ sql: 'SELECT DISTINCT ms.user_id, pt.token FROM match_subscriptions ms LEFT JOIN push_tokens pt ON pt.user_id=ms.user_id WHERE ms.fixture_id=?', args: [fixtureId] });
    const rows = r.rows || [];
    if (!rows.length) return;
    const tokens = rows.map(r => r.token).filter(Boolean);
    const title = homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam;
    const body = (minute ? minute + "'"+' — ' : '') + 'Score update';
    if (tokens.length > 0) {
      const { sendPush } = await import('./pushService.js');
      await sendPush({ title, body, data: { type: 'live_score', url: '/', fixture_id: fixtureId }, tokens });
    }
  } catch(e) { console.warn('[WS] notifyMatchSubscribers error:', e.message); }
}
async function handleScoreUpdate(msg) {
  try {
    const fixtureId = String(msg.fixture_id || '');
    if (!fixtureId) return;
    await db.execute({ sql: 'UPDATE fixtures SET home_score = ?, away_score = ?, match_status = ?, live_minute = ? WHERE id = ?', args: [msg.home_score, msg.away_score, msg.status || 'LIVE', msg.minute || null, fixtureId] });
    if (msg.home_score !== null && msg.away_score !== null) notifyMatchSubscribers(fixtureId, '', '', msg.home_score, msg.away_score, msg.minute).catch(()=>{});
    broadcast({ type: 'score_update', fixture_id: fixtureId, home_score: msg.home_score, away_score: msg.away_score, status: msg.status, minute: msg.minute });
    const st=(msg.status||'').toUpperCase(); if (st==='FT'||st==='AET'||st==='PEN'||st==='FINISHED'||st==='FULL TIME') {
      setTimeout(() => triggerResultCheck(fixtureId, msg.home_score, msg.away_score).catch(() => {}), 5000);
    }
  } catch (err) {
    console.warn('[WS] handleScoreUpdate error:', err.message);
  }
}

// Immediately evaluate predictions when a match finishes via WebSocket
async function triggerResultCheck(fixtureId, homeScore, awayScore) {
  const { evaluatePrediction } = await import('./resultChecker.js');
  const pred = await db.execute({ sql: 'SELECT * FROM predictions_v2 WHERE fixture_id = ? LIMIT 1', args: [fixtureId] });
  const row = pred.rows?.[0];
  if (!row || !row.best_pick_selection) return;
  const fix = await db.execute({ sql: 'SELECT home_team_name, away_team_name, match_date, tournament_name FROM fixtures WHERE id = ? LIMIT 1', args: [fixtureId] });
  const f = fix.rows?.[0];
  if (!f) return;
  const outcome = evaluatePrediction(row.best_pick_market, row.best_pick_selection, homeScore, awayScore, f.home_team_name, f.away_team_name);
  await db.execute({ sql: 'INSERT OR REPLACE INTO prediction_outcomes (fixture_id,home_team,away_team,match_date,tournament,predicted_market,predicted_selection,predicted_probability,model_confidence,home_score,away_score,full_score,outcome,evaluated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime("now"),datetime("now"))', args: [fixtureId, f.home_team_name, f.away_team_name, f.match_date, f.tournament_name, row.best_pick_market, row.best_pick_selection, parseFloat(row.best_pick_probability || 0), row.confidence_model || '', homeScore, awayScore, homeScore + '-' + awayScore, outcome] });
  console.log('[WS] Auto-result: ' + f.home_team_name + ' vs ' + f.away_team_name + ' -> ' + outcome + ' (' + homeScore + '-' + awayScore + ')');
  // Send push notification for win/loss result
  const isWin = outcome === 'win' || outcome === 'correct';
  const emoji = isWin ? 'WIN' : 'FT';
  const pushTitle = emoji + ' ' + (isWin ? 'WIN! ' : '') + f.home_team_name + ' vs ' + f.away_team_name;
  const pushBody = homeScore + '-' + awayScore + ' | ' + (isWin ? 'Your pick was correct!' : 'Final score');
  const pushData = { type: 'match_result', url: '/results', outcome, fixture_id: fixtureId };
  broadcastPush({ title: pushTitle, body: pushBody, data: pushData, url: '/results' }).catch(()=>{});
  saveNotification({ userId: null, type: 'match_result', title: pushTitle, body: pushBody, data: pushData }).catch(()=>{});
}
let pollTimer = null; let isConnected = false;
async function pollLiveScores() { try { const matches = await fetchLiveMatches(); if (matches.length > 0) { if (!isConnected) { isConnected = true; } for (const m of matches) { const parts = String(m.score || '0 - 0').replace(/ /g,'').split('-'); const hs = parseInt(parts[0]||'0',10)||0; const as2 = parseInt(parts[1]||'0',10)||0; const fid = m.fixture_id||m.match_id; await handleScoreUpdate({fixture_id:fid,home_score:hs,away_score:as2,status:m.status||'LIVE',minute:m.minute||null}).catch(()=>{}); } } } catch(err) { console.warn('[Live] Poll error:',err.message); } }
export function startLiveScoreWatcher() { if (pollTimer) return; console.log('[Live] Starting LiveScore polling (60s)'); pollLiveScores(); pollTimer = setInterval(pollLiveScores, 60000); isConnected = true; }
export function getLiveStatus() { return { connected: isConnected, sseClients: sseClients.size }; }
export function stopLiveScoreWatcher() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } isConnected = false; }
