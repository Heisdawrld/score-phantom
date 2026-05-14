import { broadcastPush, saveNotification } from './pushService.js';
// wsLiveScores.js — BSD live scores polling + SSE push to frontend
import db from '../config/database.js';
import { bsdFetchAll, fetchLiveMatches, fetchEventDetail } from './bsd.js';
import { normalizeEventStatsPayload } from './bsdStatsNormalizer.js';
import { computeProfitUnits } from '../storage/profitUnits.js';

const sseClients = new Set();
let pollTimer = null;
let isConnected = false;

// Periodic heartbeat to detect and clean up dead SSE connections
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':heartbeat\n\n');
    } catch (_) {
      sseClients.delete(client);
    }
  }
}, 30000);

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

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function fetchKickoffWindowCandidates() {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 35 * 60 * 1000).toISOString();
    const r = await db.execute({
      sql: `SELECT id, home_score, away_score, match_status, live_minute
            FROM fixtures
            WHERE match_date >= ?
              AND match_date <= ?
              AND COALESCE(match_status, 'NS') NOT IN ('FT', 'AET', 'PEN', 'CANC', 'PPD', 'finished')
            ORDER BY match_date ASC
            LIMIT 80`,
      args: [from, to],
    });
    return (r.rows || []).map(row => ({ id: row.id, _fromKickoffWindow: true, ...row }));
  } catch (err) {
    console.warn('[Live] Failed kickoff-window scan:', err.message);
    return [];
  }
}

async function fetchExpandedLiveMatches() {
  const statuses = ['inprogress', 'halftime', '1st_half', '2nd_half', 'ht', 'live'];
  const batches = await Promise.all([
    fetchLiveMatches().catch(() => []),
    fetchKickoffWindowCandidates().catch(() => []),
    ...statuses.map(status => bsdFetchAll('/events/', { status }, { maxPages: 2 }).catch(() => [])),
  ]);
  const byId = new Map();
  for (const row of batches.flat()) {
    if (!row?.id) continue;
    byId.set(String(row.id), row);
  }
  return [...byId.values()];
}

function normalizeLiveStatus(rawStatus, rawPeriod = null, homeScore = null, awayScore = null, minute = null) {
  const s = String(rawStatus || '').toLowerCase();
  const p = String(rawPeriod || '').toLowerCase();
  if (s === 'finished' || s === 'ft' || p === 'ft') return 'FT';
  if (s === 'halftime' || s === 'half_time' || s === 'ht' || p === 'ht' || p.includes('half time')) return 'HT';
  if (s === '1st_half' || s === '2nd_half' || s === 'inprogress' || s === 'live') return 'LIVE';
  if (p.includes('1') || p.includes('2')) return 'LIVE';
  if ((homeScore != null || awayScore != null) && (minute != null || s === 'notstarted')) return 'LIVE';
  return s ? s.toUpperCase() : 'LIVE';
}

function isPreMatchEvent(event) {
  const s = String(event?.status || '').toLowerCase();
  const p = String(event?.period || '').toLowerCase();
  return (s === 'notstarted' || s === 'ns') && !p && event?.home_score == null && event?.away_score == null;
}

async function updateLiveFixtureMeta(fixtureId, finalOrLiveEvent, partialLiveStats = null) {
  if (!fixtureId) return null;
  try {
    const existing = await db.execute({ sql: 'SELECT meta, home_team_id, away_team_id FROM fixtures WHERE id = ? LIMIT 1', args: [fixtureId] });
    const row = existing.rows?.[0] || {};
    const meta = safeJsonParse(row.meta, {});
    const statsPayload = {
      stats: finalOrLiveEvent?.stats || finalOrLiveEvent?.live_stats || partialLiveStats || null,
      shotmap: finalOrLiveEvent?.shotmap || meta.shotmap || [],
      momentum: finalOrLiveEvent?.momentum || meta.momentum || [],
      average_positions: finalOrLiveEvent?.average_positions || meta.average_positions || null,
      xg_per_minute: finalOrLiveEvent?.xg_per_minute || meta.xg_per_minute || [],
      actual_home_xg: finalOrLiveEvent?.actual_home_xg,
      actual_away_xg: finalOrLiveEvent?.actual_away_xg,
      home_xg_live: finalOrLiveEvent?.home_xg_live,
      away_xg_live: finalOrLiveEvent?.away_xg_live,
    };
    const normalized = normalizeEventStatsPayload(statsPayload, row.home_team_id, row.away_team_id);
    const nextMeta = {
      ...meta,
      live: true,
      lastLiveUpdateAt: new Date().toISOString(),
      matchStats: normalized.matchStats || meta.matchStats || partialLiveStats || null,
      live_stats: normalized.matchStats || partialLiveStats || meta.live_stats || null,
      shotmap: (normalized.shotmap && normalized.shotmap.length) ? normalized.shotmap : (meta.shotmap || null),
      momentum: (normalized.momentum && normalized.momentum.length) ? normalized.momentum : (meta.momentum || null),
      xg_per_minute: (normalized.xg_per_minute && normalized.xg_per_minute.length) ? normalized.xg_per_minute : (meta.xg_per_minute || null),
      average_positions: normalized.average_positions || meta.average_positions || null,
      matchEvents: finalOrLiveEvent?.incidents || meta.matchEvents || null,
      actualHomeXg: normalized.actualHomeXg ?? meta.actualHomeXg ?? null,
      actualAwayXg: normalized.actualAwayXg ?? meta.actualAwayXg ?? null,
    };
    await db.execute({ sql: 'UPDATE fixtures SET meta = ? WHERE id = ?', args: [JSON.stringify(nextMeta), fixtureId] });
    return nextMeta;
  } catch (err) {
    console.warn('[Live] Failed to update live fixture meta:', err.message);
    return null;
  }
}

async function saveFinishedMatchMemory({ fixtureId, matchDate, homeTeam, awayTeam, homeScore, awayScore, homeXg, awayXg, momentum, shotmap }) {
  const update = await db.execute({
    sql: `UPDATE historical_matches
          SET type = 'h2h',
              date = ?,
              home_team = ?,
              away_team = ?,
              home_goals = ?,
              away_goals = ?,
              home_xg = ?,
              away_xg = ?,
              momentum = ?,
              shotmap = ?
          WHERE fixture_id = ?`,
    args: [matchDate, homeTeam, awayTeam, homeScore, awayScore, homeXg, awayXg, momentum, shotmap, fixtureId],
  });

  if ((update.rowsAffected || 0) > 0) return { action: 'updated', rowsAffected: update.rowsAffected || 0 };

  try {
    await db.execute({
      sql: `INSERT INTO historical_matches
             (fixture_id, type, date, home_team, away_team, home_goals, away_goals, home_xg, away_xg, momentum, shotmap)
            VALUES (?, 'h2h', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [fixtureId, matchDate, homeTeam, awayTeam, homeScore, awayScore, homeXg, awayXg, momentum, shotmap],
    });
    return { action: 'inserted', rowsAffected: 1 };
  } catch (err) {
    // If another live poll inserted it first, update once more. This keeps the path safe without requiring a UNIQUE constraint.
    if (String(err.message || '').toLowerCase().includes('unique')) {
      const retry = await db.execute({
        sql: `UPDATE historical_matches
              SET type = 'h2h', date = ?, home_team = ?, away_team = ?, home_goals = ?, away_goals = ?, home_xg = ?, away_xg = ?, momentum = ?, shotmap = ?
              WHERE fixture_id = ?`,
        args: [matchDate, homeTeam, awayTeam, homeScore, awayScore, homeXg, awayXg, momentum, shotmap, fixtureId],
      });
      return { action: 'updated_after_race', rowsAffected: retry.rowsAffected || 0 };
    }
    throw err;
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
    const liveMeta = await updateLiveFixtureMeta(fixtureId, msg.final_event || {}, msg.live_stats).catch(() => null);
    if (msg.home_score !== null && msg.away_score !== null) notifyMatchSubscribers(fixtureId, '', '', msg.home_score, msg.away_score, msg.minute).catch(()=>{});
    broadcast({ 
      type: 'score_update', 
      fixture_id: fixtureId, 
      home_score: msg.home_score, 
      away_score: msg.away_score, 
      status: msg.status, 
      minute: msg.minute,
      incidents: msg.incidents,
      live_stats: msg.live_stats,
      meta: liveMeta ? {
        momentum: liveMeta.momentum || null,
        shotmap: liveMeta.shotmap || null,
        matchStats: liveMeta.matchStats || null,
        xg_per_minute: liveMeta.xg_per_minute || null,
      } : null,
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
     // Check if we need to fetch the final event data from BSD.
     // Use fetchEventDetail(..., true) so this keeps working after the BSD v2 adapter
     // moves rich fields into separate event sub-endpoints.
     let evt = finalEvent;
     if (!evt) {
        try {
          evt = await fetchEventDetail(fixtureId, true);
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
     
     const memorySave = await saveFinishedMatchMemory({
       fixtureId,
       matchDate: f.match_date,
       homeTeam: f.home_team_name,
       awayTeam: f.away_team_name,
       homeScore,
       awayScore,
       homeXg: hXg,
       awayXg: aXg,
       momentum: mmt,
       shotmap: sh,
     });
     console.log(`[Engine] Saved finished match memory to H2H for ${f.home_team_name} vs ${f.away_team_name} (${memorySave.action})`);
  }

  const pred = await db.execute({ sql: 'SELECT * FROM predictions_v2 WHERE fixture_id = ? LIMIT 1', args: [fixtureId] });
  const row = pred.rows?.[0];
  if (!row || !row.best_pick_selection) return;
  if (!f) return;

  const pickRes = await db.execute({
    sql: `
      SELECT id, market_key, selection, model_probability, bookmaker_odds, model_confidence
      FROM prediction_picks
      WHERE fixture_id = ?
        AND prediction_source = 'pre_match'
        AND kickoff_at IS NOT NULL
        AND generated_at < kickoff_at
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    args: [fixtureId],
  });
  const pick = pickRes.rows?.[0] || null;

  const market = pick?.market_key || row.best_pick_market;
  const selection = pick?.selection || row.best_pick_selection;
  const probability = pick?.model_probability ?? row.best_pick_probability ?? 0;
  const odds = pick?.bookmaker_odds ?? null;
  const modelConfidence = pick ? pick.model_confidence : row.confidence_model;

  const outcome = evaluatePrediction(market, selection, homeScore, awayScore, f.home_team_name, f.away_team_name);
  const resultStatus = outcome;
  const stakeUnits = 1;
  const profitUnits = computeProfitUnits(resultStatus, odds, stakeUnits);

  await db.execute({
    sql: `
      INSERT INTO prediction_outcomes (
        fixture_id, sport_key, home_team, away_team, match_date, tournament,
        pick_id, predicted_market, predicted_selection, predicted_probability,
        best_pick_odds, stake_units, profit_units,
        model_confidence,
        home_score, away_score, full_score,
        outcome, result_status, prediction_source,
        evaluated_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, 'ws_live',
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
        prediction_source = EXCLUDED.prediction_source,
        evaluated_at = CURRENT_TIMESTAMP
    `,
    args: [
      fixtureId,
      'football',
      f.home_team_name,
      f.away_team_name,
      f.match_date,
      f.tournament_name,
      pick?.id != null ? Number(pick.id) : null,
      market,
      selection,
      parseFloat(probability || 0),
      odds != null ? parseFloat(odds) : null,
      stakeUnits,
      profitUnits,
      modelConfidence || null,
      homeScore,
      awayScore,
      homeScore + '-' + awayScore,
      outcome,
      resultStatus,
    ]
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
    const matches = await fetchExpandedLiveMatches();
    const currentLiveIds = new Set();

    if (matches && matches.length > 0) {
      if (!isConnected) isConnected = true;
      for (const m of matches) {
        const fid = String(m.id || '');
        if (!fid) continue;
        let fullLiveEvent = null;
        try {
          fullLiveEvent = await fetchEventDetail(fid, true);
        } catch (_) {}
        if (m._fromKickoffWindow && isPreMatchEvent(fullLiveEvent)) continue;
        const homeScore = fullLiveEvent?.home_score ?? m.home_score ?? 0;
        const awayScore = fullLiveEvent?.away_score ?? m.away_score ?? 0;
        const minute = fullLiveEvent?.current_minute || m.current_minute || null;
        const status = normalizeLiveStatus(fullLiveEvent?.status || m.status, fullLiveEvent?.period || m.period, homeScore, awayScore, minute);
        currentLiveIds.add(fid);
        await handleScoreUpdate({
          fixture_id: fid,
          home_score: homeScore,
          away_score: awayScore,
          status,
          minute,
          incidents:  fullLiveEvent?.incidents || m.incidents || [],
          live_stats: fullLiveEvent?.live_stats || m.live_stats || null,
          final_event: fullLiveEvent || null,
        }).catch(() => {});
      }
    }

    // Check for matches that dropped out of the live feed
    for (const oldFid of activeLiveMatchIds) {
      if (!currentLiveIds.has(oldFid)) {
        // Match disappeared from live feed! It probably finished.
        console.log(`[Live] Match ${oldFid} dropped from live feed. Fetching final status...`);
        try {
          const finalEvent = await fetchEventDetail(oldFid, true);
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
