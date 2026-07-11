import db from '../config/database.js';
import { didHeadlinePickMateriallyChange as didMaterialChange, computePickMaterialSignature } from './predictionPicksMaterialChange.js';

let _initialized = false;
let _initPromise = null;

export function didHeadlinePickMateriallyChange(prevPick, nextPick) {
  return didMaterialChange(prevPick, nextPick);
}

async function initPredictionPicksTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      prediction_source TEXT NOT NULL,
      generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      kickoff_at TIMESTAMP,
      market_key TEXT NOT NULL,
      selection TEXT NOT NULL,
      bookmaker_odds REAL,
      implied_probability REAL,
      edge REAL,
      model_probability REAL,
      model_confidence TEXT,
      material_signature TEXT,
      phantom_score REAL,
      volatility_score REAL,
      stake_units REAL DEFAULT 1
    )
  `);

  try {
    const info = await db.execute(`PRAGMA table_info(prediction_picks)`);
    const cols = (info.rows || []).map(r => String(r.name).toLowerCase());
    if (!cols.includes("material_signature")) await db.execute(`ALTER TABLE prediction_picks ADD COLUMN material_signature TEXT`);
    if (!cols.includes("model_confidence")) await db.execute(`ALTER TABLE prediction_picks ADD COLUMN model_confidence TEXT`);
    if (!cols.includes("stake_units")) await db.execute(`ALTER TABLE prediction_picks ADD COLUMN stake_units REAL DEFAULT 1`);
  } catch (e) {}
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_generated ON prediction_picks(fixture_id, generated_at DESC)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_source_generated ON prediction_picks(fixture_id, prediction_source, generated_at DESC)`);
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_prediction_picks_material ON prediction_picks(fixture_id, prediction_source, material_signature)`);
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
             market_key, selection, bookmaker_odds, implied_probability, edge, model_probability, model_confidence, material_signature
      FROM prediction_picks
      WHERE fixture_id = ? AND prediction_source = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    args: [String(fixtureId), String(predictionSource)],
  });
  return r.rows?.[0] || null;
}

async function getPickIdBySignature({ fixtureId, predictionSource, materialSignature }) {
  const r = await db.execute({
    sql: `
      SELECT id
      FROM prediction_picks
      WHERE fixture_id = ? AND prediction_source = ? AND material_signature = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    args: [String(fixtureId), String(predictionSource), String(materialSignature)],
  });
  const id = r.rows?.[0]?.id;
  return id != null ? Number(id) : null;
}

export async function insertPredictionPickIfMaterialChange(pick) {
  await ensureInit();
  const fixtureId = String(pick.fixture_id);
  const predictionSource = String(pick.prediction_source);
  const materialSignature = computePickMaterialSignature(pick);

  const latest = await getLatestPredictionPick({ fixtureId, predictionSource });
  if (!didHeadlinePickMateriallyChange(latest, pick)) {
    return latest?.id != null ? Number(latest.id) : null;
  }

  const res = await db.execute({
    sql: `
      INSERT INTO prediction_picks
        (fixture_id, engine_version, prediction_source, generated_at, kickoff_at,
         market_key, selection, bookmaker_odds, implied_probability, edge, model_probability, model_confidence, material_signature,
         phantom_score, volatility_score, stake_units)
      VALUES
        (?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?)
      ON CONFLICT (fixture_id, prediction_source, material_signature) DO NOTHING
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
      pick.model_confidence ?? null,
      materialSignature,
      pick.phantom_score ?? null,
      pick.volatility_score ?? null,
      pick.stake_units ?? 1,
    ],
  });

  const id = res.rows?.[0]?.id;
  if (id != null) return Number(id);
  return await getPickIdBySignature({ fixtureId, predictionSource, materialSignature });
}
