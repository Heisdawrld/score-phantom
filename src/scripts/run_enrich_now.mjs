import db from "../config/database.js";
import { enrichFixture } from "../enrichment/enrichOne.js";
const today = new Date().toISOString().slice(0,10);
const result = await db.execute({ sql: "SELECT id, home_team_name, away_team_name, home_team_id, away_team_id, tournament_id, match_date FROM fixtures WHERE enriched = 0 AND match_date >= ? ORDER BY match_date ASC LIMIT 120", args: [today] });
const fixtures = result.rows; console.log("Enriching", fixtures.length, "fixtures from", today);
let ok = 0, fail = 0;
for (const f of fixtures) { try { await enrichFixture(f); ok++; if (ok % 10 === 0) console.log("Progress:", ok, "/", fixtures.length); } catch(e) { fail++; } }
console.log("Done:", ok, "enriched,", fail, "failed");
