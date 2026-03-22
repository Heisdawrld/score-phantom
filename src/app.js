import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./api/routes.js";
import authRoutes, { initUsersTable } from "./auth/authRoutes.js";
import { fileURLToPath } from "url";
import path from "path";
import db from "./config/database.js";
import errorHandler from "./middlewares/errorHandler.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api", routes);
// Mount authentication routes only once under /api/auth. We no longer mount under /api/webhook
app.use("/api/auth", authRoutes);

app.get("/payment-success", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

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
    console.warn("No fixtures found. Run the seed script manually.");
  } catch (err) {
    console.error("Auto-seed check failed:", err.message);
  }
}

app.listen(PORT, async () => {
  console.log("ScorePhantom running on port " + PORT);
  await initUsersTable();
  await autoSeed();
});

// Register the centralised error handler AFTER all routes
app.use(errorHandler);

export default app;
