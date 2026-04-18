#!/usr/bin/env node
/**
 * migrate_to_bsd.mjs — One-time DB migration script
 *
 * Run once after deploying the BSD migration code.
 * Clears stale LiveScore/SportAPI data from the database and reseeds from BSD.
 *
 * SAFE: Preserves users, payments, referrals, accuracy_cache.
 *       Only clears fixture-related tables that contain old API data.
 *
 * Usage:
 *   node src/scripts/migrate_to_bsd.mjs
 *
 * Or via admin panel → "Reseed" with clearFirst: true
 */

import dotenv from 'dotenv';
dotenv.config();

// Verify required env vars
if (!process.env.BSD_API_KEY) {
  console.error('❌ BSD_API_KEY not set. Cannot proceed.');
  process.exit(1);
}
if (!process.env.TURSO_URL && !process.env.TURSO_DATABASE_URL) {
  console.error('❌ TURSO_URL not set. Cannot proceed.');
  process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  ScorePhantom — BSD Migration Script                        ║');
console.log('║  Clearing stale data + reseeding from Bzzoiro Sports Data   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// Dynamic import so dotenv applies first
const { default: db } = await import('../config/database.js');

// ── Phase 1: Clear stale tables ─────────────────────────────────────────────

console.log('Phase 1: Clearing stale fixture data...');
console.log('  ⚠  Preserving: users, payments, referrals, accuracy_cache');

const tablesToClear = [
  'predictions_v2',
  'fixture_odds',
  'historical_matches',
  'fixtures',
  'teams',
  'tournaments',
];

for (const table of tablesToClear) {
  try {
    const countBefore = await db.execute(`SELECT COUNT(*) as c FROM ${table}`);
    const rows = countBefore.rows[0]?.c || 0;
    await db.execute(`DELETE FROM ${table}`);
    console.log(`  ✓ Cleared ${table} (${rows} rows deleted)`);
  } catch (err) {
    console.warn(`  ⚠ ${table}: ${err.message} (may not exist — OK)`);
  }
}

// Also clear sportmonks_cache if it exists
try {
  await db.execute('DELETE FROM sportmonks_cache');
  console.log('  ✓ Cleared sportmonks_cache');
} catch (_) {}

// Also clear team_logos table (no longer needed — BSD serves logos via URL)
try {
  await db.execute('DELETE FROM team_logos');
  console.log('  ✓ Cleared team_logos (no longer needed)');
} catch (_) {}

console.log('');

// ── Phase 2: Reseed from BSD ────────────────────────────────────────────────

console.log('Phase 2: Seeding fixtures from BSD...');

const { seedFixtures } = await import('../services/fixtureSeeder.js');

const result = await seedFixtures({
  days: 7,
  startOffset: 0,
  clearFirst: false, // Already cleared above
  log: console.log,
});

console.log('');
console.log(`  Fixtures inserted: ${result.inserted}`);
console.log(`  Odds written:      ${result.oddsWritten || 0}`);
console.log(`  Failed:            ${result.failed}`);
console.log(`  Total BSD events:  ${result.total}`);

// ── Phase 3: Quick validation ───────────────────────────────────────────────

console.log('');
console.log('Phase 3: Validation...');

const fixtureCount = await db.execute('SELECT COUNT(*) as c FROM fixtures');
const teamCount = await db.execute('SELECT COUNT(*) as c FROM teams');
const tournCount = await db.execute('SELECT COUNT(*) as c FROM tournaments');
const oddsCount = await db.execute('SELECT COUNT(*) as c FROM fixture_odds');

const fc = fixtureCount.rows[0]?.c || 0;
const tc = teamCount.rows[0]?.c || 0;
const trc = tournCount.rows[0]?.c || 0;
const oc = oddsCount.rows[0]?.c || 0;

console.log(`  Fixtures:    ${fc}`);
console.log(`  Teams:       ${tc}`);
console.log(`  Tournaments: ${trc}`);
console.log(`  Odds:        ${oc}`);

// Sample a few fixtures to verify data quality
const sample = await db.execute('SELECT id, home_team_name, away_team_name, tournament_name, category_name, match_date, home_team_logo FROM fixtures LIMIT 5');
if (sample.rows?.length) {
  console.log('');
  console.log('  Sample fixtures:');
  for (const row of sample.rows) {
    const logo = row.home_team_logo ? '✓' : '✗';
    console.log(`    ${row.home_team_name} vs ${row.away_team_name} | ${row.tournament_name} (${row.category_name}) | ${row.match_date} | logo:${logo}`);
  }
}

// Verify at least some odds were written
const oddsSample = await db.execute('SELECT f.home_team_name, f.away_team_name, o.home, o.draw, o.away FROM fixture_odds o JOIN fixtures f ON f.id = o.fixture_id LIMIT 3');
if (oddsSample.rows?.length) {
  console.log('');
  console.log('  Sample odds:');
  for (const row of oddsSample.rows) {
    console.log(`    ${row.home_team_name} vs ${row.away_team_name} | H:${row.home} D:${row.draw} A:${row.away}`);
  }
}

// Check user/payment tables are untouched
const userCount = await db.execute('SELECT COUNT(*) as c FROM users');
console.log('');
console.log(`  Users preserved: ${userCount.rows[0]?.c || 0} ✓`);

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  Migration complete. BSD is now the sole data provider.');
console.log('  Next: push to GitHub → Render autodeploy.');
console.log('══════════════════════════════════════════════════════════════');
