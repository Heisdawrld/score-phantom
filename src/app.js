import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./api/routes.js";
import authRoutes, { initUsersTable } from "./auth/authRoutes.js";
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", routes);
app.use("/api/auth", authRoutes);

// ── Admin: trigger a manual reseed (protected by ADMIN_ACTIVATION secret) ────
app.post("/api/admin/seed", async (req, res) => {
  const secret = req.headers["x-admin-secret"] || req.query.secret;
  const expected = process.env.ADMIN_ACTIVATION || process.env.ADMIN_SECRET;
  if (!expected || secret !== expected) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const clearFirst = req.query.clear === "true";
    const days = parseInt(req.query.days || "7", 10);
    const msgs = [];
    const result = await seedFixtures({
      days,
      clearFirst,
      log: (m) => { console.log(m); msgs.push(m); },
    });
    res.json({ success: true, ...result, log: msgs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

async function autoSeed() {
  try {
    if (!process.env.LIVESCORE_API_KEY || !process.env.LIVESCORE_API_SECRET) {
      console.warn("[AutoSeed] No LiveScore keys — skipping seed.");
      return;
    }

    // Check for TODAY's fixtures specifically — not just any stale data
    const today = new Date().toISOString().split('T')[0];
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

app.listen(PORT, async () => {
  console.log("ScorePhantom running on port " + PORT);
  await initUsersTable();
  await autoSeed();
  await backfillMissingCountries();
});

app.use(errorHandler);

export default app;
