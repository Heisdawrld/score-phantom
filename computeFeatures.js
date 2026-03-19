import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./api/routes.js";
import { fileURLToPath } from "url";
import path from "path";
import { readFileSync, existsSync } from "fs";
import db from "./config/database.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));
app.use("/api", routes);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

async function autoSeed() {
  try {
    const result = await db.execute("SELECT COUNT(*) as count FROM fixtures");
    const count = result.rows[0].count;

    if (count > 0) {
      console.log("DB already has " + count + " fixtures, skipping seed.");
      return;
    }

    const filePath = path.join(__dirname, "..", "fixtures.json");
    if (!existsSync(filePath)) {
      console.warn("fixtures.json not found, skipping seed.");
      return;
    }

    const fixtures = JSON.parse(readFileSync(filePath, "utf-8"));

    for (const f of fixtures) {
      await db.batch([
        {
          sql: "INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
          args: [
            f.home_team_id,
            f.home_team_name,
            f.home_team_short_name || "",
          ],
        },
        {
          sql: "INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
          args: [
            f.away_team_id,
            f.away_team_name,
            f.away_team_short_name || "",
          ],
        },
        {
          sql: "INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)",
          args: [
            f.tournament_id,
            f.tournament_name,
            f.category_name || "",
            f.tournament_url || "",
          ],
        },
        {
          sql: "INSERT OR IGNORE INTO fixtures (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, tournament_name, category_name, match_date, match_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          args: [
            f.match_id,
            f.home_team_id,
            f.away_team_id,
            f.tournament_id,
            f.home_team_name,
            f.away_team_name,
            f.tournament_name,
            f.category_name || "",
            f.match_date,
            f.match_url,
          ],
        },
      ]);
    }

    console.log("Auto-seeded " + fixtures.length + " fixtures.");
  } catch (err) {
    console.error("Auto-seed failed:", err.message);
  }
}

app.listen(PORT, async () => {
  console.log("ScorePhantom running on port " + PORT);
  await autoSeed();
});

export default app;
