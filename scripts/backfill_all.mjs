import dotenv from "dotenv"; dotenv.config();
import { seedAllActiveLeagues } from "./src/services/fixtureSeeder.js";

console.log("=".repeat(78));
console.log(" PROD BACKFILL — ALL ACTIVE BSD LEAGUES (upcomingOnly=true)");
console.log("=".repeat(78));

const t0 = Date.now();
const result = await seedAllActiveLeagues({ upcomingOnly: true, delayMs: 400, log: console.log });
const ms = Date.now() - t0;

console.log("\n" + "=".repeat(78));
console.log(` DONE in ${(ms/1000).toFixed(1)}s`);
console.log("=".repeat(78));
console.log(JSON.stringify({ total: result.total, seeded: result.seeded, skipped: result.skipped, failed: result.failed, fixturesUpserted: result.fixturesUpserted }, null, 2));

console.log("\nPer-league results:");
for (const r of result.leagues) {
  if (r.error) console.log(`  [${String(r.leagueId).padStart(3)}] ${r.leagueName} — ERROR: ${r.error}`);
  else console.log(`  [${String(r.leagueId).padStart(3)}] ${(r.leagueName||'').padEnd(40).slice(0,40)} | total=${String(r.total).padStart(4)} | inserted=${String(r.inserted).padStart(4)} | failed=${r.failed} | season=${r.seasonName}`);
}

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const totalFix = await c.execute({ sql: `SELECT COUNT(*) n FROM fixtures`, args: [] });
const totalTour = await c.execute({ sql: `SELECT COUNT(*) n FROM tournaments`, args: [] });
console.log(`\nFINAL DB STATE: ${totalFix.rows[0].n} fixtures across ${totalTour.rows[0].n} tournaments`);
process.exit(0);
