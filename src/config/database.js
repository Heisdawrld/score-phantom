import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../scorephantom.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    url TEXT
  );

  CREATE TABLE IF NOT EXISTS fixtures (
    id TEXT PRIMARY KEY,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    tournament_id TEXT,
    tournament_name TEXT,
    category_name TEXT,
    match_date TEXT,
    match_url TEXT,
    enriched INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS historical_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('h2h', 'home_form', 'away_form')),
    date TEXT,
    home_team TEXT,
    away_team TEXT,
    home_goals INTEGER,
    away_goals INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT NOT NULL,
    market TEXT NOT NULL,
    value TEXT NOT NULL,
    probability REAL,
    confidence TEXT,
    generated_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
