import db from '../config/database.js';

async function getTableColumns(tableName) {
  const result = await db.execute(`PRAGMA table_info('${tableName}')`);
  return new Set((result.rows || []).map((row) => String(row.name || '').toLowerCase()));
}

async function runMaintenanceJobs() {
  console.log("🧹 Starting Scheduled Maintenance Jobs (Memory Pruner)...");
  
  try {
    // JOB 1: Cache Pruning (Remove old JSON blobs from predictions_v2 > 14 days)
    console.log("Running Job 1: Pruning stale prediction caches...");
    const pruneCacheRes = await db.execute(`
      UPDATE predictions_v2
      SET prediction_json = NULL,
          explanation_json = NULL,
          backup_picks_json = NULL
      WHERE created_at < datetime('now', '-14 days')
        AND (prediction_json IS NOT NULL OR explanation_json IS NOT NULL)
    `);
    console.log(`✅ Cleared JSON blobs from ${pruneCacheRes.rowsAffected} stale predictions.`);

    // JOB 2: Inactive Free User Cleanup
    console.log("Running Job 2: Cleaning up inactive free-trial users...");
    const trialColumns = await getTableColumns('trial_daily_counts');
    const trialDateColumn = trialColumns.has('date_str') ? 'date_str' : 'date';
    const pruneUsersRes = await db.execute(`
      DELETE FROM trial_daily_counts 
      WHERE ${trialDateColumn} < date('now', '-30 days')
    `);
    console.log(`✅ Removed ${pruneUsersRes.rowsAffected} stale daily trial counts.`);

    // JOB 3: Memory Compaction (Prune historical matches older than 6 months)
    console.log("Running Job 3: Compacting engine memory...");
    const pruneHistoryRes = await db.execute(`
      DELETE FROM historical_matches 
      WHERE date < datetime('now', '-6 months')
    `);
    console.log(`✅ Pruned ${pruneHistoryRes.rowsAffected} outdated historical matches.`);

    // JOB 4: Prune stale prediction picks
    console.log("Running Job 4: Pruning stale prediction picks...");
    const prunePicksRes = await db.execute(`
      DELETE FROM prediction_picks
      WHERE generated_at < datetime('now', '-30 days')
    `);
    console.log(`✅ Pruned ${prunePicksRes.rowsAffected} old prediction picks.`);

    console.log("🎉 All Maintenance Jobs Completed Successfully.");
  } catch (err) {
    console.error("❌ Error running maintenance jobs:", err);
  }
}

// If executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMaintenanceJobs().then(() => process.exit(0)).catch(() => process.exit(1));
}

export { runMaintenanceJobs };
