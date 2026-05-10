import db from './src/config/database.js';

async function run() {
  console.log("Clearing prediction cache to force re-enrichment with Polymarket & Manager data...");
  await db.execute(`UPDATE predictions_v2 SET updated_at = '2000-01-01 00:00:00'`);
  await db.execute(`UPDATE fixtures SET enriched = 0`);
  console.log("Cache cleared. Next fetch will trigger full BSD API enrichment.");
  process.exit(0);
}
run();
