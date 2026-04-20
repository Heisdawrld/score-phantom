import db from './src/config/database.js';

async function run() {
  const predictions = await db.execute("SELECT explanation_text FROM predictions_v2 LIMIT 1000");
  const starvationCount = (predictions.rows || []).filter(r => r.explanation_text && r.explanation_text.includes('Minimal data')).length;
  const partialCount = (predictions.rows || []).filter(r => r.explanation_text && r.explanation_text.includes('Limited historical data')).length;
  console.log("Total predictions checked:", (predictions.rows || []).length);
  console.log("Starved (Minimal Data):", starvationCount);
  console.log("Partial Data:", partialCount);

  const stats = await db.execute("SELECT enrichment_status, COUNT(*) as c FROM fixtures GROUP BY enrichment_status");
  console.log("Fixture enrichment statuses:");
  console.table(stats.rows || []);
}
run().catch(console.error);
