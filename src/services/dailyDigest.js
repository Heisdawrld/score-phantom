// dailyDigest.js — 7am daily push + email digest scheduler
import db from '../config/database.js';
import { broadcastPush, saveNotification } from './pushService.js';
import { sendDailyDigest } from './emailService.js';

async function runDigest() {
  console.log('[Digest] 7am triggered');
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    const r = await db.execute({
      sql: 'SELECT p.home_team,p.away_team,p.best_pick_market,p.best_pick_selection,p.best_pick_probability,f.tournament_name,f.match_date FROM predictions_v2 p JOIN fixtures f ON f.id=p.fixture_id WHERE f.match_date LIKE ? AND p.best_pick_selection IS NOT NULL AND p.best_pick_probability>=0.55 ORDER BY p.best_pick_probability DESC LIMIT 5',
      args: [today + '%'],
    });
    const picks = (r.rows || []).map(row => ({
      match: row.home_team + ' vs ' + row.away_team,
      market: row.best_pick_market,
      pick: row.best_pick_selection,
      probability: parseFloat((parseFloat(row.best_pick_probability || 0) * 100).toFixed(1)),
      tournament: row.tournament_name,
      time: row.match_date ? new Date(row.match_date).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '',
    }));
    if (picks.length === 0) { console.log('[Digest] No picks yet for today'); return; }
    await broadcastPush({ title: 'Today\'s top picks are ready!', body: picks.length + ' high-confidence picks selected. Tap to view.', data: { type: 'top_picks_ready', url: '/top-picks' }, url: '/top-picks' });
    await saveNotification({ userId: null, type: 'top_picks_ready', title: 'Top Picks Ready!', body: picks.length + ' high-confidence picks for ' + today, data: { url: '/top-picks', count: picks.length } });
    const users = await db.execute({ sql: 'SELECT email FROM users WHERE email_digest_enabled=1 AND status=\'active\' LIMIT 500', args: [] });
    let emailsSent = 0;
    for (const u of (users.rows || [])) {
      try { await sendDailyDigest({ to: u.email, picks, date: today }); emailsSent++; await new Promise(r => setTimeout(r, 200)); } catch(_) {}
    }
    console.log('[Digest] Push sent, emails sent:', emailsSent);
  } catch(err) { console.error('[Digest] failed:', err.message); }
}

export function scheduleDaily7amDigest() {
  function scheduleNext() {
    const lagosNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const next7am = new Date(lagosNow);
    next7am.setHours(7, 0, 0, 0);
    if (lagosNow.getHours() >= 7) next7am.setDate(next7am.getDate() + 1);
    const ms = next7am - lagosNow;
    setTimeout(async () => { await runDigest(); scheduleNext(); }, ms);
    console.log('[Digest] Next 7am digest in ~' + Math.round(ms / 3600000) + 'h');
  }
  scheduleNext();
}
