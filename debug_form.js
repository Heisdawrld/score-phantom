import db from "./src/config/database.js";
import { fetchTeamRecentEvents } from "./src/services/bsd.js";

async function run() {
  const fixtures = await db.execute("SELECT * FROM fixtures WHERE match_date LIKE '2026-04-19%' LIMIT 1");
  if (fixtures.rows.length === 0) {
    console.log("No fixtures found for today");
    return;
  }
  const f = fixtures.rows[0];
  console.log("Fixture:", f.home_team_name, "vs", f.away_team_name);
  
  const history = await db.execute("SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type", [f.id]);
  console.log("DB History Rows:", history.rows.length);
  const homeForm = history.rows.filter(r => r.type === "home_form");
  console.log("DB Home Form:", homeForm.map(r => `${r.date} ${r.home_team} ${r.home_goals}-${r.away_goals} ${r.away_team}`));

  console.log("\nFetching real BSD data for", f.home_team_name, "...");
  const bsdHome = await fetchTeamRecentEvents(f.home_team_name, 5);
  console.log("BSD Home Form:", bsdHome.map(r => `${r.event_date} ${r.home_team} ${r.home_score}-${r.away_score} ${r.away_team}`));
}
run().catch(console.error).finally(() => process.exit(0));
