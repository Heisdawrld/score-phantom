import db from "../config/database.js";
import { enrichFixture } from "../enrichment/enrichOne.js";

async function run() {
  const today = new Date().toISOString().slice(0,10);
  const result = await db.execute({ 
    sql: "SELECT id, home_team_name, away_team_name, home_team_id, away_team_id, tournament_id, match_date FROM fixtures WHERE enriched = 0 AND match_date >= ? ORDER BY match_date ASC LIMIT 5", 
    args: [today] 
  });
  const fixtures = result.rows; 
  console.log("Enriching", fixtures.length, "fixtures from", today);
  let ok = 0, fail = 0;
  for (const f of fixtures) { 
    try { 
      console.log(`Enriching: ${f.home_team_name} vs ${f.away_team_name}...`);
      await enrichFixture(f); 
      ok++; 
    } catch(e) { 
      console.error(`Failed ${f.home_team_name}:`, e.message);
      fail++; 
    } 
  }
  console.log("Done:", ok, "enriched,", fail, "failed");
  process.exit(0);
}

run();
