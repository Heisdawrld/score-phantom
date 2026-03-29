import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./api/routes.js";
import adminRoutes from "./api/adminRoutes.js";
import authRoutes, { initUsersTable } from "./auth/authRoutes.js";
import { initPredictionsTable } from "./storage/savePrediction.js";
import db from "./config/database.js";
import errorHandler from "./middlewares/errorHandler.js";
import { seedFixtures } from "./services/fixtureSeeder.js";

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
const BUILD_VERSION = '2026-03-29T04:51:57.005Z';
app.get('/api/version', (req, res) => {
  res.json({ version: BUILD_VERSION, ts: Date.now() });
});

// Legacy admin page
app.get("/admin", (req, res) => {
  const adminHtmlPath = path.join(__dirname, "..", "admin.html");
  if (fs.existsSync(adminHtmlPath)) {
    res.sendFile(adminHtmlPath);
  } else {
    res.status(404).json({ error: "Admin page not found" });
  }
});

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
    if (!process.env.LIVESCORE_API_KEY || !process.env.LIVESCORE_API_SECRET) {
      console.warn("[AutoSeed] No LiveScore keys — skipping seed.");
      return;
    }

    // Check for TODAY's fixtures specifically — not just any stale data
    const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const result = await db.execute({
      sql: "SELECT COUNT(*) as count FROM fixtures WHERE match_date LIKE ?",
      args: [`${today}%`],
    });
    const todayCount = Number(result.rows[0].count || 0);

    if (todayCount > 0) {
      console.log(`[AutoSeed] DB already has ${todayCount} fixtures for today (${today}), skipping.`);
      return;
    }

    console.log(`[AutoSeed] No fixtures for today (${today}) — clearing stale data and reseeding...`);
    const result2 = await seedFixtures({ days: 7, clearFirst: true });
    console.log(`[AutoSeed] Seeded ${result2.inserted} fixtures.`);
  } catch (err) {
    console.error("[AutoSeed] Failed:", err.message);
  }
}

// ── Auto-enrichment: runs at startup and every 4 hours ───────────────────────
const ENRICH_BATCH = 50;
const ENRICH_DELAY_MS = 2500; // increased to avoid rate limiting

async function autoEnrich({ limit = ENRICH_BATCH, dateFilter = null } = {}) {
  try {
    const today = dateFilter || new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    // Count pending unenriched fixtures for today + next 6 days
    const pending = await db.execute({
      sql: `SELECT id, home_team_name, away_team_name, match_date
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
        sql: `SELECT id, home_team_name, away_team_name, match_date
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
  await initUsersTable();
  await initPredictionsTable();

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

  // Enrich today's fixtures immediately after seed (non-blocking)
  autoEnrich().catch((err) => console.error("[AutoEnrich] startup error:", err.message));

  // Re-run enrichment every 4 hours to catch any newly added or failed fixtures
  setInterval(() => {
    autoEnrich().catch((err) => console.error("[AutoEnrich] scheduled error:", err.message));
  }, 4 * 60 * 60 * 1000);

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
        await seedFixtures({ days: 7, clearFirst: true });
        console.log('[DailySeed] Fixtures re-seeded');
        await autoEnrich();
      } catch (err) {
        console.error('[DailySeed] Failed:', err.message);
      }
      scheduleNextMidnightSeed();
    }, msUntilMidnight);
    const hrs = Math.round(msUntilMidnight / 3600000);
    console.log('[DailySeed] Next seed in ~' + hrs + 'h');
  }
  scheduleNextMidnightSeed();
});

export default app;
