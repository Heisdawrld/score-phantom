import db from '../config/database.js';
import { runMaintenanceJobs } from './maintenance.js';

async function stressTest() {
  console.log("🚀 Starting DB Stress Test for Memory Pruner...");
  
  try {
    // 1. Insert 100 "stale" predictions
    console.log("Inserting 100 stale predictions...");
    const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago
    for (let i = 0; i < 100; i++) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO predictions_v2 (fixture_id, prediction_json, created_at) VALUES (?, ?, ?)",
        args: [`stale_${i}`, JSON.stringify({ data: "large blob content" }), staleDate]
      });
    }

    // 2. Insert 100 "fresh" predictions
    console.log("Inserting 100 fresh predictions...");
    const freshDate = new Date().toISOString();
    for (let i = 0; i < 100; i++) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO predictions_v2 (fixture_id, prediction_json, created_at) VALUES (?, ?, ?)",
        args: [`fresh_${i}`, JSON.stringify({ data: "fresh content" }), freshDate]
      });
    }

    // 3. Run Maintenance
    console.log("Running maintenance jobs...");
    await runMaintenanceJobs();

    // 4. Verify
    const staleCheck = await db.execute("SELECT COUNT(*) as count FROM predictions_v2 WHERE prediction_json IS NOT NULL AND fixture_id LIKE 'stale_%'");
    const freshCheck = await db.execute("SELECT COUNT(*) as count FROM predictions_v2 WHERE prediction_json IS NOT NULL AND fixture_id LIKE 'fresh_%'");

    console.log(`Results: Stale predictions with JSON: ${staleCheck.rows[0].count} (Expected: 0)`);
    console.log(`Results: Fresh predictions with JSON: ${freshCheck.rows[0].count} (Expected: 100)`);

    // Cleanup
    await db.execute("DELETE FROM predictions_v2 WHERE fixture_id LIKE 'stale_%' OR fixture_id LIKE 'fresh_%'");
    console.log("✅ Stress Test Complete & Cleanup Done.");
  } catch (err) {
    console.error("❌ Stress Test Failed:", err);
  }
}

stressTest().then(() => process.exit(0));
