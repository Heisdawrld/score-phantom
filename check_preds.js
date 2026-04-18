import db from './src/config/database.js';

async function checkPredictions() {
  try {
    const res = await db.execute(`
      SELECT 
        p.id, p.fixture_id, p.market, p.value, p.probability, p.confidence, p.generated_at,
        f.home_team_name, f.away_team_name, f.match_date
      FROM predictions p
      JOIN fixtures f ON p.fixture_id = f.id
      ORDER BY p.generated_at DESC
      LIMIT 15
    `);
    
    if (res.rows.length === 0) {
      console.log("No predictions found in the database (table 'predictions'). Checking 'predictions_v2'...");
      
      const resV2 = await db.execute(`
        SELECT 
          p.id, p.fixture_id, p.prediction_json, p.generated_at,
          f.home_team_name, f.away_team_name, f.match_date
        FROM predictions_v2 p
        JOIN fixtures f ON p.fixture_id = f.id
        ORDER BY p.generated_at DESC
        LIMIT 10
      `);
      
      if (resV2.rows.length === 0) {
        console.log("No predictions found in 'predictions_v2' either.");
      } else {
        console.log("Found predictions in 'predictions_v2':");
        resV2.rows.forEach(row => {
          console.log(`\nMatch: ${row.home_team_name} vs ${row.away_team_name} (${row.match_date})`);
          try {
            const data = JSON.parse(row.prediction_json);
            console.log(`  Best Pick: ${data.bestPick} (${data.confidence}) - Prob: ${data.probability}%`);
            console.log(`  xG: Home ${data.expectedGoals?.home} - Away ${data.expectedGoals?.away}`);
            console.log(`  Script: ${data.matchScript}`);
            if (data.reasons) console.log(`  Reasons: ${data.reasons.join(" | ")}`);
          } catch (e) {
            console.log(`  Could not parse JSON: ${e.message}`);
          }
        });
      }
    } else {
      console.log("Found predictions in 'predictions':");
      console.table(res.rows);
    }
    
  } catch (error) {
    console.error("Error querying database:", error.message);
  }
}

checkPredictions();