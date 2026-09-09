import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createTrackRecordRouter } from '../../src/api/trackRecordRouter.js';

export function createFixtureApp() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE prediction_outcomes (
    fixture_id TEXT, home_team TEXT, away_team TEXT, match_date TEXT, tournament TEXT,
    predicted_market TEXT, predicted_selection TEXT, predicted_probability REAL,
    model_confidence TEXT, home_score INTEGER, away_score INTEGER, full_score TEXT,
    outcome TEXT, best_pick_odds REAL, stake_units REAL, profit_units REAL,
    sport_key TEXT, prediction_source TEXT, is_retroactive INTEGER,
    engine_version TEXT, is_sharp_value INTEGER, evaluated_at TEXT
  ); CREATE TABLE backtest_results (actual_result TEXT);`);
  const insert = sqlite.prepare(`INSERT INTO prediction_outcomes VALUES (
    ?, 'Example Home', 'Example Away', datetime('now'), 'Test League',
    'over_25', 'Over 2.5', 0.7, 'HIGH', 2, 1, '2-1', ?, ?, ?, ?,
    'football', ?, ?, ?, 0, datetime('now')
  )`);
  const rows = [
    ['win', 'win', 2, 2, 2, 'live', 0, '5.5.0'],
    ['loss', 'loss', 2, 1, -1, 'live', 0, '5.5.0'],
    ['unpriced', 'loss', null, 100, null, 'live', 0, '4.0.0'],
    ['unknown-profit', 'win', 2, 50, null, 'live', 0, '5.5.0'],
    ['void', 'void', 2, 10, 0, 'live', 0, '5.5.0'],
    ['zero-stake', 'win', 2, 0, 0, 'live', 0, '5.5.0'],
    ['backtest', 'win', 2, 1000, 1000, 'backtest', 0, '5.5.0'],
    ['retroactive', 'win', 2, 1000, 1000, 'live', 1, '5.5.0'],
    ['pending', null, 2, 1000, null, 'live', 0, '5.5.0'],
  ];
  for (const row of rows) insert.run(...row);
  const db = {
    async execute(statement) {
      const { sql, args = [] } = typeof statement === 'string' ? { sql: statement } : statement;
      return { rows: sqlite.prepare(sql).all(...args) };
    },
  };
  const app = express();
  app.use('/api/track-record', createTrackRecordRouter(db));
  return { app, sqlite };
}
