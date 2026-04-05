import { broadcastPush, saveNotification } from './pushService.js';
// wsLiveScores.js - SportAPI WebSocket client + SSE push to frontend
import WebSocket from 'ws';
import db from '../config/database.js';

let ws = null;
let isConnected = false;
let reconnectTimer = null;
let pingTimer = null;
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

async function handleScoreUpdate(msg) {
  try {
    const fixtureId = String(msg.fixture_id || '');
    if (!fixtureId) return;
    await db.execute({ sql: 'UPDATE fixtures SET home_score = ?, away_score = ?, match_status = ?, live_minute = ? WHERE id = ?', args: [msg.home_score, msg.away_score, msg.status || 'LIVE', msg.minute || null, fixtureId] });
    broadcast({ type: 'score_update', fixture_id: fixtureId, home_score: msg.home_score, away_score: msg.away_score, status: msg.status, minute: msg.minute });
    if (msg.status === 'FT' || msg.status === 'AET' || msg.status === 'Pen') {
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

function connect() {
  const key = process.env.SPORTAPI_KEY;
  if (!key) { console.warn('[WS] SPORTAPI_KEY not set, skipping live score WebSocket'); return; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  console.log('[WS] Connecting to SportAPI live scores...');
  ws = new WebSocket('wss://sportapi.ai/ws', { headers: { 'X-Api-Key': key } });
  ws.on('open', () => {
    isConnected = true;
    console.log('[WS] Connected - subscribing to all live fixtures');
    ws.send(JSON.stringify({ action: 'subscribe_all' }));
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }));
      else clearInterval(pingTimer);
    }, 25000);
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'score_update') handleScoreUpdate(msg);
    } catch (_) {}
  });
  ws.on('close', () => {
    isConnected = false;
    if (pingTimer) clearInterval(pingTimer);
    console.warn('[WS] Disconnected - reconnecting in 30s');
    reconnectTimer = setTimeout(connect, 30000);
  });
  ws.on('error', (err) => { console.error('[WS] Error:', err.message); });
}

export function startLiveScoreWatcher() { connect(); }
export function getLiveStatus() { return { connected: isConnected, sseClients: sseClients.size }; }
export function stopLiveScoreWatcher() { if (ws) ws.close(); if (pingTimer) clearInterval(pingTimer); if (reconnectTimer) clearTimeout(reconnectTimer); }
