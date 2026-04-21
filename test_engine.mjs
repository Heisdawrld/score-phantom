import db from './src/config/database.js';
import { runPredictionEngine } from './src/engine/runPredictionEngine.js';
import { ensureFixtureData } from './src/services/predictionCache.js';

async function test() {
  console.log("Looking for a fixture...");
  // Let's grab the most recently updated fixture
  const r = await db.execute("SELECT id, home_team_name, away_team_name FROM fixtures ORDER BY match_date DESC LIMIT 1");
  if (!r.rows || r.rows.length === 0) {
    console.log("No fixtures found in DB.");
    return;
  }
  const fix = r.rows[0];
  console.log(`Found fixture: ${fix.home_team_name} vs ${fix.away_team_name} (${fix.id})`);
  
  console.log("Fetching bundle...");
  const bundle = await ensureFixtureData(fix.id);
  console.log("Bundle keys:", Object.keys(bundle));
  console.log("Meta keys:", Object.keys(bundle.meta));
  
  console.log("\nRunning Engine...");
  const engineResult = await runPredictionEngine(fix.id, bundle);
  
  console.log("Engine Result:");
  console.log("- Expected Goals:", engineResult.expectedGoals);
  console.log("- Best Pick:", engineResult.bestPick?.marketKey, engineResult.bestPick?.selection);
  console.log("- isSharpValue:", engineResult.bestPick?.isSharpValue);
  console.log("- Tactical Data Present:", !!engineResult.features?.homeManager);
  console.log("- Polymarket Data Present:", !!engineResult.features?.polymarketOdds);
  
  if (engineResult.bestPick?.isSharpValue) {
    console.log("🚨 Sharp Value Flag is Working!");
  }
  
  process.exit(0);
}
test();
