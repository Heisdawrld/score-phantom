import db from '../config/database.js';
import { storeOpeningOdds, initClvColumns } from './clvTracker.js';

const MODEL_VERSION = '5.1.0'; // Keep in sync with CURRENT_ENGINE_VERSION in predictionCache.js
let predictionsTableReady = false;

async function getTableColumns(tableName) {
  const info = await db.execute(`PRAGMA table_info('${tableName}')`);
  return new Set((info.rows || []).map((column) => String(column.name)));
}

async function addColumnIfMissing(tableName, columns, columnName, columnDef) {
  if (columns.has(columnName)) return false;
  await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  columns.add(columnName);
  console.log(`[PredictionsMigration] Added ${tableName}.${columnName}`);
  return true;
}

export async function initPredictionsTable() {
  if (predictionsTableReady) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS predictions_v2 (
      fixture_id TEXT PRIMARY KEY,
      model_version TEXT,
      script_primary TEXT,
      script_secondary TEXT,
      script_confidence REAL,
      home_xg REAL,
      away_xg REAL,
      total_xg REAL,
      best_pick_market TEXT,
      best_pick_selection TEXT,
      best_pick_probability REAL,
      best_pick_implied_probability REAL,
      best_pick_edge REAL,
      best_pick_score REAL,
      confidence_model TEXT,
      confidence_value TEXT,
      confidence_volatility TEXT,
      explanation_json TEXT,
      explanation_text TEXT,
      reason_codes TEXT,
      no_safe_pick INTEGER,
      no_safe_pick_reason TEXT,
      backup_picks_json TEXT,
      prediction_json TEXT,
      home_team TEXT,
      away_team TEXT,
      home_manager_tactics TEXT,
      away_manager_tactics TEXT,
      polymarket_home_prob REAL,
      polymarket_draw_prob REAL,
      polymarket_away_prob REAL,
      is_sharp_value INTEGER DEFAULT 0,
      stake_units REAL DEFAULT 1,
      kelly_full REAL,
      adversarial_challenge_json TEXT,
      adversarial_recommendation TEXT,
      clv_adjustment REAL,
      confidence_json TEXT,
      odds_comparison_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await getTableColumns('predictions_v2');
  const migrations = [
    ['script_primary', 'TEXT'],
    ['script_secondary', 'TEXT'],
    ['script_confidence', 'REAL'],
    ['explanation_text', 'TEXT'],
    ['no_safe_pick_reason', 'TEXT'],
    ['backup_picks_json', 'TEXT'],
    ['home_team', 'TEXT'],
    ['away_team', 'TEXT'],
    ['best_pick_implied_probability', 'REAL'],
    ['best_pick_edge', 'REAL'],
    ['best_pick_score', 'REAL'],
    ['confidence_model', 'TEXT'],
    ['confidence_value', 'TEXT'],
    ['confidence_volatility', 'TEXT'],
    ['prediction_json', 'TEXT'],
    ['home_manager_tactics', 'TEXT'],
    ['away_manager_tactics', 'TEXT'],
    ['polymarket_home_prob', 'REAL'],
    ['polymarket_draw_prob', 'REAL'],
    ['polymarket_away_prob', 'REAL'],
    ['is_sharp_value', 'INTEGER DEFAULT 0'],
    // Tier 2/3 columns — queryable for admin dashboards
    ['stake_units', 'REAL DEFAULT 1'],
    ['kelly_full', 'REAL'],
    ['adversarial_challenge_json', 'TEXT'],
    ['adversarial_recommendation', 'TEXT'],
    ['clv_adjustment', 'REAL'],
    ['confidence_json', 'TEXT'],
    ['odds_comparison_json', 'TEXT'],
  ];

  for (const [columnName, columnDef] of migrations) {
    await addColumnIfMissing('predictions_v2', columns, columnName, columnDef);
  }

  // Ensure indexes exist for cache lookup performance
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_predictions_v2_updated_at ON predictions_v2(updated_at)`,
  ];
  for (const sql of indexes) {
    try { await db.execute(sql); } catch (_) { /* already exists */ }
  }

  predictionsTableReady = true;
}

/**
 * Save or upsert a prediction result.
 *
 * @param {object} predictionResult - full result from runPredictionEngine
 */
export async function savePrediction(predictionResult) {
  try {
    await initPredictionsTable();

    const r = predictionResult || {};
    const script = r.script || {};
    const xg = r.expectedGoals || {};
    const bp = r.bestPick || null;
    const conf = r.confidence || {};
    const now = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT INTO predictions_v2 (
          fixture_id, model_version,
          script_primary, script_secondary, script_confidence,
          home_xg, away_xg, total_xg,
          best_pick_market, best_pick_selection, best_pick_probability,
          best_pick_implied_probability, best_pick_edge, best_pick_score,
          confidence_model, confidence_value, confidence_volatility,
          explanation_json, explanation_text, reason_codes,
          no_safe_pick, no_safe_pick_reason, backup_picks_json,
          home_team, away_team, prediction_json,
          home_manager_tactics, away_manager_tactics,
          polymarket_home_prob, polymarket_draw_prob, polymarket_away_prob, is_sharp_value,
          stake_units, kelly_full,
          adversarial_challenge_json, adversarial_recommendation,
          clv_adjustment, confidence_json,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?
        ) ON CONFLICT (fixture_id) DO UPDATE SET
          model_version = EXCLUDED.model_version,
          script_primary = EXCLUDED.script_primary,
          script_secondary = EXCLUDED.script_secondary,
          script_confidence = EXCLUDED.script_confidence,
          home_xg = EXCLUDED.home_xg,
          away_xg = EXCLUDED.away_xg,
          total_xg = EXCLUDED.total_xg,
          best_pick_market = EXCLUDED.best_pick_market,
          best_pick_selection = EXCLUDED.best_pick_selection,
          best_pick_probability = EXCLUDED.best_pick_probability,
          best_pick_implied_probability = EXCLUDED.best_pick_implied_probability,
          best_pick_edge = EXCLUDED.best_pick_edge,
          best_pick_score = EXCLUDED.best_pick_score,
          confidence_model = EXCLUDED.confidence_model,
          confidence_value = EXCLUDED.confidence_value,
          confidence_volatility = EXCLUDED.confidence_volatility,
          explanation_json = EXCLUDED.explanation_json,
          explanation_text = EXCLUDED.explanation_text,
          reason_codes = EXCLUDED.reason_codes,
          no_safe_pick = EXCLUDED.no_safe_pick,
          no_safe_pick_reason = EXCLUDED.no_safe_pick_reason,
          backup_picks_json = EXCLUDED.backup_picks_json,
          prediction_json = EXCLUDED.prediction_json,
          home_team = EXCLUDED.home_team,
          away_team = EXCLUDED.away_team,
          home_manager_tactics = EXCLUDED.home_manager_tactics,
          away_manager_tactics = EXCLUDED.away_manager_tactics,
          polymarket_home_prob = EXCLUDED.polymarket_home_prob,
          polymarket_draw_prob = EXCLUDED.polymarket_draw_prob,
          polymarket_away_prob = EXCLUDED.polymarket_away_prob,
          is_sharp_value = EXCLUDED.is_sharp_value,
          stake_units = EXCLUDED.stake_units,
          kelly_full = EXCLUDED.kelly_full,
          adversarial_challenge_json = EXCLUDED.adversarial_challenge_json,
          adversarial_recommendation = EXCLUDED.adversarial_recommendation,
          clv_adjustment = EXCLUDED.clv_adjustment,
          confidence_json = EXCLUDED.confidence_json,
          updated_at = EXCLUDED.updated_at
      `,
      args: [
        r.fixtureId || null,
        MODEL_VERSION,
        script.primary || null,
        script.secondary || null,
        script.confidence || null,
        xg.homeExpectedGoals || xg.home || null,
        xg.awayExpectedGoals || xg.away || null,
        xg.totalExpectedGoals || xg.total || null,
        bp?.marketKey || null,
        bp?.selection || null,
        bp?.modelProbability || null,
        bp?.impliedProbability || null,
        bp?.edge || null,
        bp?.finalScore || null,
        conf.model || null,
        conf.value || null,
        conf.volatility || null,
        JSON.stringify(r.explanationLines || []),
        r.explanationText || null,
        JSON.stringify(r.reasonCodes || []),
        r.noSafePick ? 1 : 0,
        r.noSafePickReason || null,
        JSON.stringify(r.backupPicks || []),
        r.homeTeam || null,
        r.awayTeam || null,
        JSON.stringify(r),
        JSON.stringify(r.features?.homeManager || null),
        JSON.stringify(r.features?.awayManager || null),
        r.features?.polymarketOdds?.odds?.['1x2']?.home || null,
        r.features?.polymarketOdds?.odds?.['1x2']?.draw || null,
        r.features?.polymarketOdds?.odds?.['1x2']?.away || null,
        bp?.isSharpValue ? 1 : 0,
        // Tier 2/3 fields
        r.stake?.stakeUnits ?? bp?.stake?.stakeUnits ?? 1,
        r.stake?.kellyFull ?? bp?.stake?.kellyFull ?? null,
        r.adversarialChallenge ? JSON.stringify(r.adversarialChallenge) : null,
        r.adversarialChallenge?.recommendation || null,
        conf.clvAdjustment ?? null,
        JSON.stringify(conf),
        r.createdAt || now,
        r.updatedAt || now,
      ],
    });

    // ── CLV Tracking: store opening odds for this prediction ────────────────
    // We capture the bookmaker odds at prediction time as the "opening" line.
    // Later, a cron job will fetch closing odds ~30-60min before kickoff and
    // compute CLV = closing_implied - opening_implied.
    //
    // This is non-blocking — if it fails, the prediction is still saved.
    try {
      await initClvColumns();
      const bestPickMarket = bp?.market || bp?.marketKey || r.bestPick?.market || null;
      // The odds at prediction time are in features.advancedOdds or features.marketOdds
      const openingOdds = r.features?.advancedOdds || r.features?.marketOdds || null;
      if (bestPickMarket && openingOdds && r.fixtureId) {
        storeOpeningOdds(r.fixtureId, openingOdds, bestPickMarket).catch((e) => {
          console.warn('[savePrediction] CLV opening odds capture failed:', e.message);
        });
      }
    } catch (clvErr) {
      // CLV tracking is best-effort — never fail the prediction save
      console.warn('[savePrediction] CLV init skipped:', clvErr.message);
    }

    return true;
  } catch (err) {
    console.error('[savePrediction] Failed:', err.message);
    return false;
  }
}

/**
 * Update only the explanation fields for an existing prediction.
 * Called after Groq generates text (async, non-blocking save).
 */
export async function updatePredictionExplanation(fixtureId, explanationLines, explanationText) {
  try {
    const now = new Date().toISOString();
    await db.execute({
      sql: `UPDATE predictions_v2 SET explanation_json = ?, explanation_text = ?, updated_at = ? WHERE fixture_id = ?`,
      args: [
        JSON.stringify(explanationLines || []),
        explanationText || null,
        now,
        fixtureId,
      ],
    });
    return true;
  } catch (err) {
    console.error('[updatePredictionExplanation] Failed:', err.message);
    return false;
  }
}

/**
 * Get a cached prediction for a fixture.
 *
 * @param {string} fixtureId
 * @returns {object|null}
 */
export async function getPrediction(fixtureId) {
  try {
    await initPredictionsTable();
    const result = await db.execute({
      sql: `SELECT * FROM predictions_v2 WHERE fixture_id = ? LIMIT 1`,
      args: [fixtureId],
    });
    return result.rows?.[0] || null;
  } catch (err) {
    console.error('[getPrediction] Failed:', err.message);
    return null;
  }
}
