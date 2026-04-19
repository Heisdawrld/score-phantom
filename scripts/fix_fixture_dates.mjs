/**
 * fix_fixture_dates.mjs
 * One-time migration: converts all fixture match_dates from UTC ISO strings
 * to Africa/Lagos timezone ISO strings.
 * 
 * Why: Lagos = UTC+1. Matches at "midnight Lagos" are stored as
 * "2026-04-18T23:00:00Z" which fails LIKE '2026-04-19%' queries.
 * After fix: "2026-04-18T23:00:00Z" → "2026-04-19T00:00:00+01:00"
 * 
 * Run: node scripts/fix_fixture_dates.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    // Check current state
    const before = await client.query(`
      SELECT COUNT(*) total,
        COUNT(*) FILTER (WHERE match_date LIKE '%+01:00' OR match_date LIKE '%+0100') as already_lagos,
        COUNT(*) FILTER (WHERE match_date LIKE '%Z' OR match_date LIKE '%+00:00') as utc_format
      FROM fixtures
    `);
    const b = before.rows[0];
    console.log(`Current fixtures: ${b.total} total | ${b.already_lagos} already Lagos | ${b.utc_format} UTC format\n`);

    if (Number(b.utc_format) === 0) {
      console.log('✅ All fixtures already in Lagos timezone. Nothing to fix.');
      return;
    }

    // Convert UTC timestamps to Lagos (+01:00) format
    const result = await client.query(`
      UPDATE fixtures
      SET match_date = to_char(
        match_date::timestamptz AT TIME ZONE 'Africa/Lagos',
        'YYYY-MM-DD"T"HH24:MI:SS+01:00'
      )
      WHERE match_date ~ '^\d{4}-\d{2}-\d{2}T'
        AND (match_date LIKE '%Z' OR match_date LIKE '%+00:00')
      RETURNING id
    `);

    console.log(`✅ Updated ${result.rowCount} fixtures to Lagos timezone format\n`);

    // Verify
    const after = await client.query(`
      SELECT COUNT(*) total,
        COUNT(*) FILTER (WHERE match_date LIKE '%+01:00') as lagos,
        COUNT(*) FILTER (WHERE match_date LIKE '%Z') as utc_remaining
      FROM fixtures
    `);
    const a = after.rows[0];
    console.log(`After: ${a.total} total | ${a.lagos} Lagos format | ${a.utc_remaining} UTC remaining`);

    // Spot check
    const sample = await client.query(`
      SELECT id, home_team_name, away_team_name, match_date 
      FROM fixtures ORDER BY match_date LIMIT 5
    `);
    console.log('\nSample fixtures after fix:');
    for (const r of sample.rows) {
      console.log(` ${r.home_team_name} vs ${r.away_team_name} → ${r.match_date}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
