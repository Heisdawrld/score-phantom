import db from '../config/database.js';
import { didHeadlinePickMateriallyChange as didMaterialChange } from './predictionPicksMaterialChange.js';

let _initialized = false;
let _initPromise = null;

export function didHeadlinePickMateriallyChange(prevPick, nextPick) {
  return didMaterialChange(prevPick, nextPick);
}

async function initPredictionPicksTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_picks (
      id SERIAL PRIMARY KEY,
      fixture_id TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      prediction_source TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      kickoff_at TIMESTAMPTZ,
      market_key TEXT NOT NULL,
      selection TEXT NOT NULL,
      bookmaker_odds REAL,
      implied_probability REAL,
      edge REAL,
      model_probability REAL,
      phantom_score REAL,
      volatility_score REAL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_generated ON prediction_picks(fixture_id, generated_at DESC)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_source_generated ON prediction_picks(fixture_id, prediction_source, generated_at DESC)`);
}

async function ensureInit() {
  if (_initialized) return;
  if (!_initPromise) _initPromise = initPredictionPicksTable().then(() => { _initialized = true; });
  await _initPromise;
}

export async function getLatestPredictionPick({ fixtureId, predictionSource }) {
  await ensureInit();
  const r = await db.execute({
    sql: `
      SELECT id, fixture_id, engine_version, prediction_source, generated_at, kickoff_at,
             market_key, selection, bookmaker_odds, implied_probability, edge, model_probability
      FROM prediction_picks
      WHERE fixture_id = ? AND prediction_source = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    args: [String(fixtureId), String(predictionSource)],
  });
  return r.rows?.[0] || null;
}

export async function insertPredictionPickIfMaterialChange(pick) {
  await ensureInit();
  const fixtureId = String(pick.fixture_id);
  const predictionSource = String(pick.prediction_source);

  const latest = await getLatestPredictionPick({ fixtureId, predictionSource });
  if (!didHeadlinePickMateriallyChange(latest, pick)) return null;

  const res = await db.execute({
    sql: `
      INSERT INTO prediction_picks
        (fixture_id, engine_version, prediction_source, generated_at, kickoff_at,
         market_key, selection, bookmaker_odds, implied_probability, edge, model_probability,
         phantom_score, volatility_score)
      VALUES
        (?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?)
      RETURNING id
    `,
    args: [
      fixtureId,
      pick.engine_version,
      predictionSource,
      pick.generated_at,
      pick.kickoff_at,
      pick.market_key,
      pick.selection,
      pick.bookmaker_odds,
      pick.implied_probability,
      pick.edge,
      pick.model_probability,
      pick.phantom_score ?? null,
      pick.volatility_score ?? null,
    ],
  });

  const id = res.rows?.[0]?.id;
  return id != null ? Number(id) : null;
}
