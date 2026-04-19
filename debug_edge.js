import db from "./src/config/database.js";

async function run() {
  const result = await db.execute("SELECT fixture_id, home_team, away_team, best_pick_selection, no_safe_pick, no_safe_pick_reason FROM predictions_v2 WHERE match_date LIKE '2026-04-19%' LIMIT 10");
  console.log(result.rows);
}
run().catch(console.error).finally(() => process.exit(0));
