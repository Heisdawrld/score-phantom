import dotenv from 'dotenv';
dotenv.config();
import { fetchAndStoreEnrichment } from './src/enrichment/enrichmentService.js';
import db from './src/config/database.js';
import { predict } from './src/predictions/poissonEngine.js';

async function main() {
  const upcoming = await db.execute({
    sql: `SELECT * FROM fixtures WHERE match_status = 'NS' LIMIT 1`
  });
  
  if (!upcoming.rows.length) {
    console.log("No upcoming matches found.");
    return;
  }
  
  const fixture = upcoming.rows[0];
  console.log(`Testing enrichment for: ${fixture.home_team_name} vs ${fixture.away_team_name}`);
  
  const data = await fetchAndStoreEnrichment(fixture);
  console.log("Enrichment data completeness:", data.completeness);
  console.log("Home form length:", data.homeForm.length);
  console.log("Away form length:", data.awayForm.length);
  
  const pred = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
  console.log("Prediction Recommendation:", pred.predictions.recommendation);
  console.log("Data Quality:", pred.model.dataQuality);
}

main().catch(console.error);
