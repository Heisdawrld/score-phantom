/**
 * fixStatsData.mjs — One-shot script to fix existing prediction_outcomes data
 * 1. Add prediction_source and is_retroactive columns if missing
 * 2. Re-evaluate all void outcomes that have scores (using fixed evaluatePrediction)
 * 3. Tag outcomes as 'backtest' if they have no pre-match prediction_picks
 * 4. Tag remaining NULL rows as 'live'
 * 
 * Run: node src/scripts/fixStatsData.mjs
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('=== Fix Stats Data Script ===\n');

  // Step 0: Add columns if missing
  console.log('Step 0: Ensuring columns exist...');
  for (const [col, def] of [['prediction_source', "TEXT DEFAULT 'live'"], ['is_retroactive', "INTEGER DEFAULT 0"]]) {
    try {
      const info = await db.execute(`PRAGMA table_info(prediction_outcomes)`);
      const exists = (info.rows || []).some(r => r.name === col);
      if (!exists) {
        await db.execute(`ALTER TABLE prediction_outcomes ADD COLUMN ${col} ${def}`);
        console.log(`  Added column ${col}`);
      } else {
        console.log(`  Column ${col} already exists`);
      }
    } catch (e) {
      console.log(`  Column ${col}: ${e.message}`);
    }
  }

  // Step 1: Re-evaluate void outcomes that have scores
  console.log('\nStep 1: Re-evaluating void outcomes with scores...');
  
  // Import evaluatePrediction inline (we can't use ESM imports from this script easily)
  function evaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
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
      const mktOver = mkt.match(/over[_\s]?(\d)(\d)?/);
      const mktUnder = mkt.match(/under[_\s]?(\d)(\d)?/);
      if (mktOver) { const t = mktOver[2] ? parseFloat(mktOver[1]+'.'+mktOver[2]) : parseFloat(mktOver[1]); return total > t ? 'win' : 'loss'; }
      if (mktUnder) { const t = mktUnder[2] ? parseFloat(mktUnder[1]+'.'+mktUnder[2]) : parseFloat(mktUnder[1]); return total < t ? 'win' : 'loss'; }
    }
    if (mkt.includes('btts') || mkt.includes('both teams')) {
      const btts = homeScore > 0 && awayScore > 0;
      if (mkt.includes('no') || sel.includes('no') || sel.includes('not to score')) return btts ? 'loss' : 'win';
      return btts ? 'win' : 'loss';
    }
    if (mkt.includes('1x2') || mkt.includes('match result') || mkt.includes('result') || mkt === 'home_win' || mkt === 'away_win' || mkt === 'draw') {
      if (mkt === 'home_win' || sel === '1' || sel.includes('home win') || isHomePick) return homeScore > awayScore ? 'win' : 'loss';
      if (mkt === 'away_win' || sel === '2' || sel.includes('away win') || isAwayPick) return awayScore > homeScore ? 'win' : 'loss';
      if (mkt === 'draw' || sel === 'x' || sel === 'draw') return homeScore === awayScore ? 'win' : 'loss';
      if (homeScore > awayScore) return (sel === '1' || sel.includes('home') || isHomePick) ? 'win' : 'loss';
      if (awayScore > homeScore) return (sel === '2' || sel.includes('away') || isAwayPick) ? 'win' : 'loss';
      return (sel === 'x' || sel === 'draw') ? 'win' : 'loss';
    }
    if (mkt.includes('double chance') || mkt.includes('double_chance')) {
      if (mkt.includes('home') || sel.includes('1x') || sel.includes('home or draw')) return homeScore >= awayScore ? 'win' : 'loss';
      if (mkt.includes('away') || sel.includes('x2') || sel.includes('draw or away')) return awayScore >= homeScore ? 'win' : 'loss';
      if (sel.includes('12') || sel.includes('home or away')) return homeScore !== awayScore ? 'win' : 'loss';
      if (isHomePick || sel.includes('home') || sel === '1') return homeScore >= awayScore ? 'win' : 'loss';
      if (isAwayPick || sel.includes('away') || sel === '2') return awayScore >= homeScore ? 'win' : 'loss';
      return homeScore >= awayScore ? 'win' : 'loss';
    }
    if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
      if (mkt.includes('home') || sel.includes('home') || sel === '1' || isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
      if (mkt.includes('away') || sel.includes('away') || sel === '2' || isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
      if (isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
      if (isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
      return 'void';
    }
    if (mkt.includes('home team goals') || mkt.startsWith('home_over') || mkt.startsWith('home_under')) {
      const om2 = sel.match(/over\s+(\d+\.?\d*)/i); const um2 = sel.match(/under\s+(\d+\.?\d*)/i);
      const mktO = mkt.match(/over[_\s]?(\d)(\d)?/); const mktU = mkt.match(/under[_\s]?(\d)(\d)?/);
      if (om2) return homeScore > parseFloat(om2[1]) ? 'win' : 'loss';
      if (um2) return homeScore < parseFloat(um2[1]) ? 'win' : 'loss';
      if (mktO) { const t = mktO[2] ? parseFloat(mktO[1]+'.'+mktO[2]) : parseFloat(mktO[1]); return homeScore > t ? 'win' : 'loss'; }
      if (mktU) { const t = mktU[2] ? parseFloat(mktU[1]+'.'+mktU[2]) : parseFloat(mktU[1]); return homeScore < t ? 'win' : 'loss'; }
    }
    if (mkt.includes('away team goals') || mkt.startsWith('away_over') || mkt.startsWith('away_under')) {
      const om3 = sel.match(/over\s+(\d+\.?\d*)/i); const um3 = sel.match(/under\s+(\d+\.?\d*)/i);
      const mktO = mkt.match(/over[_\s]?(\d)(\d)?/); const mktU = mkt.match(/under[_\s]?(\d)(\d)?/);
      if (om3) return awayScore > parseFloat(om3[1]) ? 'win' : 'loss';
      if (um3) return awayScore < parseFloat(um3[1]) ? 'win' : 'loss';
      if (mktO) { const t = mktO[2] ? parseFloat(mktO[1]+'.'+mktO[2]) : parseFloat(mktO[1]); return awayScore > t ? 'win' : 'loss'; }
      if (mktU) { const t = mktU[2] ? parseFloat(mktU[1]+'.'+mktU[2]) : parseFloat(mktU[1]); return awayScore < t ? 'win' : 'loss'; }
    }
    if (mkt.includes('handicap') || mkt.includes('ahc')) {
      const hm = sel.match(/([+-]?\d+\.?\d*)/);
      if (hm) {
        const line = parseFloat(hm[1]);
        const isHome = sel.includes('home') || sel === '1' || isHomePick;
        const diff = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
        const adjusted = diff + (isHome ? -line : line);
        if (adjusted > 0.25) return 'win';
        if (adjusted < -0.25) return 'loss';
        return 'void';
      }
    }
    return 'void';
  }

  const voids = await db.execute(`
    SELECT id, fixture_id, predicted_market, predicted_selection,
           home_team, away_team, home_score, away_score, best_pick_odds, stake_units
    FROM prediction_outcomes
    WHERE outcome = 'void' AND home_score IS NOT NULL AND away_score IS NOT NULL
  `);

  let reclassified = 0;
  let stillVoid = 0;
  for (const row of (voids.rows || [])) {
    const newOutcome = evaluatePrediction(
      row.predicted_market, row.predicted_selection,
      Number(row.home_score), Number(row.away_score),
      row.home_team, row.away_team
    );
    if (newOutcome !== 'void') {
      // Compute simple profit_units: win = odds-1, loss = -1
      const odds = Number(row.best_pick_odds) || 0;
      const profitUnits = newOutcome === 'win' ? (odds > 1 ? odds - 1 : 0) : -1;
      await db.execute({
        sql: `UPDATE prediction_outcomes SET outcome = ?, result_status = ?, profit_units = ?, evaluated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [newOutcome, newOutcome, profitUnits, row.id]
      });
      reclassified++;
      if (reclassified <= 10) {
        console.log(`  ${row.home_team} vs ${row.away_team} | ${row.predicted_market} | ${row.home_score}-${row.away_score} | void → ${newOutcome}`);
      }
    } else {
      stillVoid++;
    }
  }
  console.log(`  Reclassified: ${reclassified}, Still void: ${stillVoid}`);

  // Step 2: Tag outcomes without pre-match picks as 'backtest'
  console.log('\nStep 2: Tagging backtest outcomes...');
  const tagResult = await db.execute(`
    UPDATE prediction_outcomes
    SET prediction_source = 'backtest', is_retroactive = 1
    WHERE prediction_source IS NULL
      AND fixture_id NOT IN (
        SELECT DISTINCT pp.fixture_id
        FROM prediction_picks pp
        WHERE pp.prediction_source = 'pre_match'
          AND pp.kickoff_at IS NOT NULL
          AND pp.generated_at < pp.kickoff_at
      )
  `);
  console.log(`  Tagged ${tagResult.rowsAffected} outcomes as 'backtest'`);

  // Step 3: Tag remaining NULL as 'live'
  console.log('\nStep 3: Tagging live outcomes...');
  const tagResult2 = await db.execute(`
    UPDATE prediction_outcomes SET prediction_source = 'live' WHERE prediction_source IS NULL
  `);
  console.log(`  Tagged ${tagResult2.rowsAffected} outcomes as 'live'`);

  // Step 4: Clean ghost voids (void with no scores — truly meaningless)
  console.log('\nStep 4: Cleaning ghost voids...');
  const ghostResult = await db.execute(`DELETE FROM prediction_outcomes WHERE outcome = 'void' AND home_score IS NULL`);
  console.log(`  Deleted ${ghostResult.rowsAffected} ghost voids`);

  // Step 5: Show final stats
  console.log('\n=== Final Stats ===');
  const stats = await db.execute(`
    SELECT
      prediction_source,
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voids,
      SUM(CASE WHEN is_retroactive = 1 THEN 1 ELSE 0 END) as retroactive
    FROM prediction_outcomes
    GROUP BY prediction_source
  `);
  for (const row of (stats.rows || [])) {
    const wr = (Number(row.wins) + Number(row.losses)) > 0 
      ? ((Number(row.wins) / (Number(row.wins) + Number(row.losses))) * 100).toFixed(1) 
      : '0';
    console.log(`  Source: ${row.prediction_source} | Total: ${row.total} | W: ${row.wins} | L: ${row.losses} | V: ${row.voids} | Retro: ${row.retroactive} | WR: ${wr}%`);
  }

  console.log('\n=== DONE ===');
  process.exit(0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

# Actually, let me add the migration to the app's startup sequence instead
