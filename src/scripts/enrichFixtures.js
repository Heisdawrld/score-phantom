import db from '../config/database.js';
import { enrichFixture } from '../enrichment/enrichOne.js';
import dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 50;
const DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('ScorePhantom Enrichment — Bzzoiro API');
  console.log('========================================');

  const result = await db.execute({
    sql: `SELECT * FROM fixtures WHERE enriched = 0 LIMIT ?`,
    args: [BATCH_SIZE],
  });

  const fixtures = result.rows || [];

  if (fixtures.length === 0) {
    console.log('All fixtures are already enriched. Nothing to do.');
    return;
  }

  console.log(`Enriching ${fixtures.length} fixtures...\n`);

  let success = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    const label = `[${success + failed + 1}/${fixtures.length}] ${fixture.home_team_name} vs ${fixture.away_team_name}`;
    console.log(label);

    try {
      const data = await enrichFixture(fixture);
      console.log(`  ✓ H2H: ${(data.h2h || []).length} | Home form: ${(data.homeForm || []).length} | Away form: ${(data.awayForm || []).length} | Standings: ${(data.standings || []).length}`);
      success++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Success: ${success} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('Run the script again to retry failed fixtures.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
