import { broadcastPush, saveNotification } from './pushService.js';
// wsLiveScores.js — BSD live scores polling + SSE push to frontend
import db from '../config/database.js';
import { fetchLiveMatches } from './bsd.js';

const sseClients = new Set();
let pollTimer = null;
let isConnected = false;

export function addSseClient(res) {
  if (sseClients.size >= 250) {
    res.write(`event: error\ndata: {"error":"Max connections reached"}\n\n`);
    res.end();
    return;
  }
  res.write(`data: {"connected":true,"count":${sseClients.size + 1}}\n\n`);
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
      const { sendToUsers } = await import('./pushService.js');
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
      await sendToUsers(userIds, { title, body, data: { type: 'live_score', url: '/', fixture_id: fixtureId } });
    }
  } catch(e) { console.warn('[WS] notifyMatchSubscribers error:', e.message); }
}
async function handleScoreUpdate(msg) {
  try {
    const fixtureId = String(msg.fixture_id || '');
    if (!fixtureId) return;
    await db.execute({ sql: 'UPDATE fixtures SET home_score = ?, away_score = ?, match_status = ?, live_minute = ? WHERE id = ?', args: [msg.home_score, msg.away_score, msg.status || 'LIVE', msg.minute || null, fixtureId] });
    if (msg.home_score !== null && msg.away_score !== null) notifyMatchSubscribers(fixtureId, '', '', msg.home_score, msg.away_score, msg.minute).catch(()=>{});
    broadcast({ 
      type: 'score_update', 
      fixture_id: fixtureId, 
      home_score: msg.home_score, 
      away_score: msg.away_score, 
      status: msg.status, 
      minute: msg.minute,
      incidents: msg.incidents,
      live_stats: msg.live_stats
    });
    if (msg.status === 'FT' || msg.status === 'AET' || msg.status === 'Pen') {
        setTimeout(() => triggerResultCheck(fixtureId, msg.home_score, msg.away_score, msg.final_event).catch(() => {}), 5000);
      }
  } catch (err) {
    console.warn('[WS] handleScoreUpdate error:', err.message);
  }
}

// Immediately evaluate predictions when a match finishes via WebSocket
async function triggerResultCheck(fixtureId, homeScore, awayScore, finalEvent = null) {
  const { evaluatePrediction } = await import('./resultChecker.js');
  
  // Update H2H Historical Matches Memory for the Prediction Engine
  const fix = await db.execute({ sql: 'SELECT * FROM fixtures WHERE id = ? LIMIT 1', args: [fixtureId] });
  const f = fix.rows?.[0];
  
  if (f) {
     // Check if we need to fetch the final event data from BSD
     let evt = finalEvent;
     if (!evt) {
        try {
          const { bsdFetch } = await import('./bsd.js');
          evt = await bsdFetch(`/events/${fixtureId}/`, { full: 'true' }, { cacheable: false });
        } catch(e) { /* ignore */ }
     }
     
     // Save match to historical_matches for future engine predictions (H2H memory)
     let hXg = null, aXg = null, mmt = null, sh = null;
     if (evt) {
       hXg = evt.actual_home_xg ?? evt.home_xg_live ?? null;
       aXg = evt.actual_away_xg ?? evt.away_xg_live ?? null;
       mmt = evt.momentum ? JSON.stringify(evt.momentum) : null;
       sh = evt.shotmap ? JSON.stringify(evt.shotmap) : null;
     }
     
     await db.execute({
        sql: `INSERT INTO historical_matches 
               (fixture_id, type, date, home_team, away_team, home_goals, away_goals, home_xg, away_xg, momentum, shotmap) 
              VALUES (?, 'h2h', ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (fixture_id) DO UPDATE SET
                type = EXCLUDED.type,
                date = EXCLUDED.date,
                home_team = EXCLUDED.home_team,
                away_team = EXCLUDED.away_team,
                home_goals = EXCLUDED.home_goals,
                away_goals = EXCLUDED.away_goals,
                home_xg = EXCLUDED.home_xg,
                away_xg = EXCLUDED.away_xg,
                momentum = EXCLUDED.momentum,
                shotmap = EXCLUDED.shotmap`,
        args: [
          fixtureId, f.match_date, f.home_team_name, f.away_team_name, 
          homeScore, awayScore, hXg, aXg, mmt, sh
        ]
     });
     console.log(`[Engine] Saved finished match memory to H2H for ${f.home_team_name} vs ${f.away_team_name}`);
  }

  const pred = await db.execute({ sql: 'SELECT * FROM predictions_v2 WHERE fixture_id = ? LIMIT 1', args: [fixtureId] });
  const row = pred.rows?.[0];
  if (!row || !row.best_pick_selection) return;
  if (!f) return;
  const outcome = evaluatePrediction(row.best_pick_market, row.best_pick_selection, homeScore, awayScore, f.home_team_name, f.away_team_name);
  await db.execute({ 
    sql: 'INSERT INTO prediction_outcomes (fixture_id,home_team,away_team,match_date,tournament,predicted_market,predicted_selection,predicted_probability,model_confidence,home_score,away_score,full_score,outcome,evaluated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (fixture_id) DO UPDATE SET home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, full_score=EXCLUDED.full_score, outcome=EXCLUDED.outcome, evaluated_at=CURRENT_TIMESTAMP', 
    args: [fixtureId, f.home_team_name, f.away_team_name, f.match_date, f.tournament_name, row.best_pick_market, row.best_pick_selection, parseFloat(row.best_pick_probability || 0), row.confidence_model || '', homeScore, awayScore, homeScore + '-' + awayScore, outcome] 
  });
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
let activeLiveMatchIds = new Set();

async function pollLiveScores() {
  try {
    const matches = await fetchLiveMatches();
    const currentLiveIds = new Set();

    if (matches && matches.length > 0) {
      if (!isConnected) isConnected = true;
      for (const m of matches) {
        // BSD live event fields: id, home_score, away_score, current_minute, status
        const fid = String(m.id || '');
        if (!fid) continue;
        currentLiveIds.add(fid);
        await handleScoreUpdate({
          fixture_id: fid,
          home_score: m.home_score ?? 0,
          away_score: m.away_score ?? 0,
          status:     m.status === 'finished' ? 'FT' : 'LIVE',
          minute:     m.current_minute || null,
          incidents:  m.incidents || [],
          live_stats: m.live_stats || null
        }).catch(() => {});
      }
    }

    // Check for matches that dropped out of the live feed
    for (const oldFid of activeLiveMatchIds) {
      if (!currentLiveIds.has(oldFid)) {
        // Match disappeared from live feed! It probably finished.
        console.log(`[Live] Match ${oldFid} dropped from live feed. Fetching final status...`);
        try {
          const { bsdFetch } = await import('./bsd.js');
          const finalEvent = await bsdFetch(`/events/${oldFid}/`, { full: 'true' }, { cacheable: false });
          if (finalEvent && (finalEvent.status === 'finished' || finalEvent.status === 'FT')) {
            console.log(`[Live] Match ${oldFid} confirmed finished! Score: ${finalEvent.home_score}-${finalEvent.away_score}`);
            await handleScoreUpdate({
              fixture_id: oldFid,
              home_score: finalEvent.home_score ?? 0,
              away_score: finalEvent.away_score ?? 0,
              status: 'FT',
              minute: null,
              incidents: finalEvent.incidents || [],
              live_stats: finalEvent.live_stats || null,
              final_event: finalEvent // Pass the full event for memory storage
            }).catch(() => {});
          } else if (finalEvent && finalEvent.status) {
             // Maybe postponed or cancelled?
             await db.execute({ sql: 'UPDATE fixtures SET match_status = ? WHERE id = ?', args: [finalEvent.status, oldFid] });
          }
        } catch(e) {
          console.warn(`[Live] Failed to verify dropped match ${oldFid}:`, e.message);
        }
      }
    }
    
    // Update our tracking set for the next poll
    activeLiveMatchIds = currentLiveIds;

  } catch (err) {
    console.warn('[Live] BSD poll error:', err.message);
  }
}
export function startLiveScoreWatcher() { if (pollTimer) return; console.log('[Live] Starting BSD live polling (60s)'); pollLiveScores(); pollTimer = setInterval(pollLiveScores, 60000); isConnected = true; }
export function getLiveStatus() { return { connected: isConnected, sseClients: sseClients.size }; }
export function stopLiveScoreWatcher() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } isConnected = false; }
