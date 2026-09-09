import { writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client/web';
import dotenv from 'dotenv';
import { evaluatePredictionHistory } from '../src/engine/evaluatePredictionHistory.js';

// Explicit credentials file and cutoff; importing application DB would run migrations.
const [envFile, cutoff, outputFile] = process.argv.slice(2);
if (!envFile || !cutoff || !outputFile || !Number.isFinite(Date.parse(cutoff))) {
  throw new Error('Usage: node scripts/evaluateHistory.mjs <env-file> <ISO-cutoff> <output-json>');
}
dotenv.config({ path: envFile });
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  const result = await db.execute(`
    SELECT po.fixture_id, po.pick_id, po.engine_version, po.prediction_source,
           po.is_retroactive, po.outcome, pp.fixture_id AS pick_fixture_id,
           pp.engine_version AS pick_version, pp.prediction_source AS pick_source,
           pp.generated_at, pp.kickoff_at, pp.model_probability,
           pp.bookmaker_odds, pp.stake_units
    FROM prediction_outcomes po
    LEFT JOIN prediction_picks pp ON pp.id = po.pick_id
    WHERE COALESCE(po.sport_key, 'football') = 'football'
    ORDER BY po.fixture_id, po.pick_id
  `);
  const report = { evaluatedAt: new Date().toISOString(), ...evaluatePredictionHistory(result.rows, { cutoff }) };
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { db.close(); }
