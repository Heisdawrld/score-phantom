import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./api/routes.js";
import adminRoutes from "./api/adminRoutes.js";
import { initBacktestingTable } from "./storage/backtesting.js";
import authRoutes, { initUsersTable } from "./auth/authRoutes.js";
import { initPredictionsTable } from "./storage/savePrediction.js";
import db from "./config/database.js";
import errorHandler from "./middlewares/errorHandler.js";
import { seedFixtures } from './services/fixtureSeeder.js';
import { startLiveScoreWatcher, getLiveStatus } from './services/wsLiveScores.js';
import { getBudgetStatus } from './services/requestBudget.js';
import { scheduleDaily7amDigest } from './services/dailyDigest.js';
import { checkResults } from "./services/resultChecker.js";

dotenv.config();

// ── Startup checks ────────────────────────────────────────────────────────────
if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
  console.error("❌ FATAL: TURSO_URL and TURSO_TOKEN environment variables are required.");
  console.error("   Set them in your Render dashboard (or .env file locally).");
  console.error("   Get them from: https://app.turso.tech → your database → Connect");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow APP_URL and onrender.com
const APP_ORIGIN = (process.env.APP_URL || '').trim();
const allowedOrigins = [
  APP_ORIGIN,
  'https://score-phantom.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.endsWith('.onrender.com')) return callback(null, true);
    return callback(new Error('CORS blocked'), false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", routes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Duplicate /api/admin/seed removed — handled by adminRoutes.js

// Serve React frontend (client/dist)
const clientDistPath = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}


// Version endpoint — frontend polls this to detect new deploys
const BUILD_VERSION = process.env.BUILD_VERSION || new Date().toISOString();
app.get('/api/version', (req, res) => {
  res.json({ version: BUILD_VERSION, ts: Date.now() });
});

// Legacy admin page removed

// SPA fallback — serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  // Try React frontend first, then legacy index.html
  const reactIndex = path.join(clientDistPath, "index.html");
  if (fs.existsSync(reactIndex)) {
    // No-cache so browser always gets the latest index.html after a deploy
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(reactIndex);
  }
  const legacyIndex = path.join(__dirname, "..", "index.html");
  if (fs.existsSync(legacyIndex)) {
    return res.sendFile(legacyIndex);
  }
  res.status(404).send("Not found");
});

async function autoSeed() {
  try {
    if (!process.env.LIVESCORE_API_KEY) {
      console.warn("[AutoSeed] No LIVESCORE_API_KEY set — skipping seed.");
      return;
    }

    // Check each of the next 7 days — seed any day that has 0 fixtures
    const missingDays = [];
    for (let i = 0; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
      const r = await db.execute({
        sql: "SELECT COUNT(*) as count FROM fixtures WHERE match_date LIKE ?",
        args: [`${dateStr}%`],
      });
      const count = Number(r.rows[0]?.count || 0);
      if (count === 0) missingDays.push({ i, dateStr });
    }

    if (missingDays.length === 0) {
      console.log("[AutoSeed] All 7 days have fixtures — skipping.");
      return;
    }

    console.log(`[AutoSeed] Missing fixtures for ${missingDays.length} days: ${missingDays.map(d=>d.dateStr).join(', ')}`);

    // Seed from the earliest missing day forward (without clearing existing data)
    const fromDay = missingDays[0].i;
    const daysToSeed = missingDays[missingDays.length - 1].i - fromDay + 1;
    const result2 = await seedFixtures({ startOffset: fromDay, days: daysToSeed, clearFirst: false });
    console.log(`[AutoSeed] Seeded ${result2.inserted} missing fixtures.`);
  } catch (err) {
    console.error("[AutoSeed] Failed:", err.message);
  }
}

// ── Auto-enrichment: runs at startup and every 4 hours ───────────────────────
const ENRICH_BATCH = 200; // full week of fixtures in one pass
const ENRICH_DELAY_MS = 2500; // increased to avoid rate limiting

async function autoEnrich({ limit = ENRICH_BATCH, dateFilter = null } = {}) {
  try {
    const today = dateFilter || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

    // Count pending unenriched fixtures for today + next 6 days
    const pending = await db.execute({
      sql: `SELECT id, home_team_name, away_team_name, home_team_id, away_team_id, tournament_id, match_date
            FROM fixtures
            WHERE enriched = 0 AND match_date >= ?
            ORDER BY match_date ASC
            LIMIT ?`,
      args: [today, limit],
    });

    const fixtures = pending.rows || [];
    if (fixtures.length === 0) {
      console.log(`[AutoEnrich] All fixtures already enriched for ${today}+`);
      return { enriched: 0, failed: 0 };
    }

    console.log(`[AutoEnrich] Starting enrichment for ${fixtures.length} fixtures...`);

    // Dynamic import to avoid circular dependencies at startup
    const { enrichFixture } = await import("./enrichment/enrichOne.js");

    let success = 0;
    let failed = 0;

    for (const fixture of fixtures) {
      try {
        await enrichFixture(fixture);
        success++;
        console.log(`[AutoEnrich] ✓ ${fixture.home_team_name} vs ${fixture.away_team_name}`);
      } catch (err) {
        failed++;
        console.warn(`[AutoEnrich] ✗ ${fixture.home_team_name} vs ${fixture.away_team_name}: ${err.message}`);
      }
      // Respect API rate limits
      await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    }

    console.log(`[AutoEnrich] Done. Success: ${success} | Failed: ${failed}`);

    // Re-enrich fixtures that came back LIMITED with 0 form data (API returned empty last time)
    if (success > 0) {
      const retryResult = await db.execute({
        sql: `SELECT id, home_team_name, away_team_name, home_team_id, away_team_id, tournament_id, match_date
              FROM fixtures
              WHERE enrichment_status IN ('limited', 'no_data')
                AND match_date >= ?
              ORDER BY match_date ASC
              LIMIT 30`,
        args: [today],
      });
      const retryFixtures = retryResult.rows || [];
      if (retryFixtures.length > 0) {
        console.log(`[AutoEnrich] Retrying ${retryFixtures.length} limited/no_data fixtures...`);
        const { enrichFixture } = await import('./enrichment/enrichOne.js');
        for (const fixture of retryFixtures) {
          try {
            await enrichFixture(fixture);
            console.log(`[AutoEnrich] Retry ✓ ${fixture.home_team_name} vs ${fixture.away_team_name}`);
          } catch (err) {
            console.warn(`[AutoEnrich] Retry ✗ ${fixture.home_team_name} vs ${fixture.away_team_name}: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, ENRICH_DELAY_MS));
        }
      }
    }
    return { enriched: success, failed };
  } catch (err) {
    console.error("[AutoEnrich] Fatal:", err.message);
    return { enriched: 0, failed: 0, error: err.message };
  }
}

// Expose autoEnrich so adminRoutes can call it via dynamic import
export { autoEnrich };

async function backfillMissingCountries() {
  try {
    const result = await db.execute(`
      SELECT id, tournament_id, tournament_name, category_name
      FROM fixtures
      WHERE category_name IS NULL OR TRIM(category_name) = '' OR LOWER(category_name) = 'other'
      LIMIT 5000
    `);

    const rows = result.rows || [];
    if (!rows.length) {
      console.log("No missing fixture countries to backfill.");
      return;
    }

    const fixturesJsonPath = path.join(__dirname, "..", "fixtures.json");
    if (!fs.existsSync(fixturesJsonPath)) {
      console.warn("fixtures.json not found. Skipping country backfill.");
      return;
    }

    const raw = fs.readFileSync(fixturesJsonPath, "utf8");
    const parsed = JSON.parse(raw);

    const byMatchId = new Map();
    const byTournament = new Map();

    for (const item of parsed) {
      const matchId = String(item.match_id || "");
      const tournamentId = String(item.tournament_id || "");
      const category = String(item.category_name || "").trim();

      if (matchId && category) byMatchId.set(matchId, category);
      if (tournamentId && category && !byTournament.has(tournamentId)) {
        byTournament.set(tournamentId, category);
      }
    }

    let patched = 0;

    for (const row of rows) {
      const category =
        byMatchId.get(String(row.id)) ||
        byTournament.get(String(row.tournament_id)) ||
        "";

      if (!category) continue;

      await db.execute({
        sql: `UPDATE fixtures SET category_name = ? WHERE id = ?`,
        args: [category, row.id],
      });

      await db.execute({
        sql: `UPDATE tournaments SET category = ? WHERE id = ? AND (category IS NULL OR TRIM(category) = '' OR LOWER(category) = 'other')`,
        args: [category, row.tournament_id],
      });

      patched++;
    }

    console.log(`Backfilled fixture countries: ${patched}`);
  } catch (err) {
    console.error("Country backfill failed:", err.message);
  }
}

app.use(errorHandler);

app.listen(PORT, async () => {
  console.log("ScorePhantom running on port " + PORT);
  startLiveScoreWatcher();
  console.log("[Live] LiveScore watcher started");
  await initUsersTable();
  await initPredictionsTable();
  initBacktestingTable().catch(err => console.error("[Backtest init]", err.message));

  // Migrate fixtures table for new columns (idempotent)
  const fixtureMigrations = [
    "ALTER TABLE fixtures ADD COLUMN country_flag TEXT DEFAULT ''",
    "ALTER TABLE fixtures ADD COLUMN home_team_logo TEXT DEFAULT ''",
    "ALTER TABLE fixtures ADD COLUMN away_team_logo TEXT DEFAULT ''",
    "ALTER TABLE fixtures ADD COLUMN odds_home REAL",
    "ALTER TABLE fixtures ADD COLUMN odds_draw REAL",
    "ALTER TABLE fixtures ADD COLUMN odds_away REAL",
  ];
  for (const sql of fixtureMigrations) {
    try { await db.execute(sql); } catch (_) {}
  }

  await autoSeed();

  // Full enrichment pass immediately after seed — 200 fixtures, non-blocking
  // This ensures all fixtures for the week get enriched on startup
  console.log('[AutoEnrich] Starting full startup enrichment pass...');
  const { autoBuildPredictions } = await import('./services/predictionRunner.js');
  autoEnrich({ limit: 200 })
    .then(() => {
      console.log('[PredRunner] Enrichment done — pre-generating predictions...');
      return autoBuildPredictions({ limit: 100 });
    })
    .catch((err) => console.error("[AutoEnrich/PredRunner] startup error:", err.message));
  // Immediately backfill last 7 days of results on startup (fixes void outcomes)
  setTimeout(async () => {
    try {
      const { backfillResults } = await import("./services/resultChecker.js");
      const res = await backfillResults(7);
      console.log("[ResultChecker] Startup backfill done:", res.map(r => r.date + " " + JSON.stringify(r.outcomes)).join(", "));
    } catch (err) { console.error("[ResultChecker] Startup backfill failed:", err.message); }
  }, 30000);

  // Re-run enrichment every 1 hour, then immediately pre-generate predictions
  setInterval(async () => {
    try {
      await autoEnrich();
      await autoBuildPredictions({ limit: 100 });
    } catch (err) {
      console.error("[AutoEnrich/PredRunner] scheduled error:", err.message);
    }
  }, 60 * 60 * 1000); // every 1 hour

  // Re-seed fixtures daily at midnight Lagos time
  function scheduleNextMidnightSeed() {
    const now = new Date();
    const lagosNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const nextMidnight = new Date(lagosNow);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 5, 0, 0);
    const msUntilMidnight = nextMidnight - lagosNow;
    setTimeout(async () => {
      console.log('[DailySeed] Midnight re-seed triggered');
      try {
        // NEVER use clearFirst: true — it wipes all fixtures/predictions.
        // Instead, seed only missing days (INSERT OR IGNORE keeps existing data safe).
        const missingDays = [];
        for (let i = 0; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
          const r = await db.execute({
            sql: "SELECT COUNT(*) as count FROM fixtures WHERE match_date LIKE ?",
            args: [`${dateStr}%`],
          });
          const count = Number(r.rows[0]?.count || 0);
          if (count === 0) missingDays.push({ i, dateStr });
        }
        if (missingDays.length > 0) {
          console.log(`[DailySeed] Seeding ${missingDays.length} missing days: ${missingDays.map(d=>d.dateStr).join(', ')}`);
          const fromDay = missingDays[0].i;
          const daysToSeed = missingDays[missingDays.length - 1].i - fromDay + 1;
          const result2 = await seedFixtures({ startOffset: fromDay, days: daysToSeed, clearFirst: false });
          console.log(`[DailySeed] Seeded ${result2.inserted} fixtures.`);
        } else {
          console.log('[DailySeed] All days have fixtures — skipping seed.');
        }
        // Cleanup fixtures older than 3 days to keep DB tidy (but NEVER wipe predictions)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 3);
        const cutoffStr = cutoff.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
        await db.execute({ sql: "DELETE FROM fixtures WHERE match_date < ?", args: [`${cutoffStr}T00:00:00`] });
        console.log(`[DailySeed] Cleaned up fixtures before ${cutoffStr}`);
        await autoEnrich();
      } catch (err) {
        console.error('[DailySeed] Failed:', err.message);
      }
      scheduleDaily7amDigest();
  scheduleNextMidnightSeed();
    }, msUntilMidnight);
    const hrs = Math.round(msUntilMidnight / 3600000);
    console.log('[DailySeed] Next seed in ~' + hrs + 'h');
  }
  scheduleNextMidnightSeed();

  // ── Daily result checker: runs at 2 AM Lagos time to evaluate yesterday's picks ──
  function scheduleNextResultCheck() {
    const now = new Date();
    const lagosNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const next2AM = new Date(lagosNow);
    next2AM.setDate(next2AM.getDate() + (lagosNow.getHours() >= 2 ? 1 : 0));
    next2AM.setHours(2, 15, 0, 0); // 2:15 AM Lagos — after midnight seed completes
    const ms = next2AM - lagosNow;
    setTimeout(async () => {
      console.log('[ResultChecker] Daily check triggered');
      try {
        const r = await checkResults(); // defaults to yesterday
        console.log(`[ResultChecker] Checked ${r.checked} predictions — W:${r.outcomes?.wins} L:${r.outcomes?.losses} V:${r.outcomes?.voids}`);
      } catch (err) {
        console.error('[ResultChecker] Failed:', err.message);
      }
      scheduleNextResultCheck();
    }, ms);
    const hrs = Math.round(ms / 3600000);
    console.log(`[ResultChecker] Next check in ~${hrs}h`);
  }
  scheduleNextResultCheck();

  // Run result checker every 3h during the day to catch todays results as they finish
  setInterval(async () => {
    try {
      const today = new Date().toLocaleString("en-CA", { timeZone: "Africa/Lagos" }).split(",")[0].trim();
      const yesterday = new Date(Date.now() - 86400000).toLocaleString("en-CA", { timeZone: "Africa/Lagos" }).split(",")[0].trim();
      const r1 = await checkResults(today);
      console.log("[ResultChecker] 3h check (today):", r1.outcomes);
      const r2 = await checkResults(yesterday);
      if (r2.outcomes?.updated > 0) console.log("[ResultChecker] 3h check (yesterday updated):", r2.outcomes);
    } catch (err) { console.error("[ResultChecker] 3h check failed:", err.message); }
  }, 3 * 60 * 60 * 1000);
  // ── Keep-alive: ping self every 10 min so Render free tier stays awake ───────
  // Without this, Render spins down after 15 min of inactivity causing
  // the server to cold-start on the next request, which makes /auth/me
  // fail and logs users out on browser refresh.
  const SELF_URL = process.env.APP_URL || 'https://score-phantom.onrender.com';
  setInterval(() => {
    fetch(SELF_URL + '/api/version')
      .then(() => console.log('[KeepAlive] ping ok'))
      .catch((e) => console.warn('[KeepAlive] ping failed:', e.message));
  }, 10 * 60 * 1000); // every 10 minutes
  console.log('[KeepAlive] Self-ping started — pinging every 10 min');

});


export default app;
