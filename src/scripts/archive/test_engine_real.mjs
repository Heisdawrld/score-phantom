import db from '../../config/database.js';
import { runPredictionEngine } from '../../engine/runPredictionEngine.js';
import { ensureFixtureData } from '../../services/predictionCache.js';

async function testEngine() {
  try {
    // 1. Get a sample enriched fixture
    const sampleRes = await db.execute('SELECT id, home_team_name, away_team_name FROM fixtures WHERE enriched = 1 LIMIT 1');
    if (!sampleRes.rows.length) {
      console.log('No enriched fixtures found. Run enrichment first.');
      process.exit(0);
    }
    const fixture = sampleRes.rows[0];
    console.log(`\nTesting Prediction for: ${fixture.home_team_name} vs ${fixture.away_team_name} (${fixture.id})`);

    // 2. Fetch full data bundle (exactly like the API does)
    const bundle = await ensureFixtureData(fixture.id);
    if (!bundle) {
      console.log('Failed to fetch fixture data bundle.');
      process.exit(1);
    }
    console.log(`- Data Quality Score: ${bundle.meta?.completeness?.score ?? 'N/A'}`);
    console.log(`- Home Form Matches: ${bundle.historyRows.filter(m => m.type === 'home_form').length}`);
    console.log(`- Away Form Matches: ${bundle.historyRows.filter(m => m.type === 'away_form').length}`);
    console.log(`- Odds Available: ${bundle.odds ? 'Yes' : 'No'}`);

    // 3. Run the engine
    const prediction = await runPredictionEngine(fixture.id, bundle);

    // 4. Output results
    console.log('\n--- Engine Output ---');
    if (prediction.noSafePick) {
      console.log(`🚫 ABSTAINED: ${prediction.noSafePickReason} (${prediction.abstainCode})`);
    } else {
      console.log(`✅ PICK: ${prediction.bestPick.marketKey} (${prediction.bestPick.selection})`);
      console.log(`- Probability: ${(prediction.bestPick.modelProbability * 100).toFixed(1)}%`);
      console.log(`- Value Edge: ${(prediction.bestPick.edge * 100).toFixed(1)}%`);
      console.log(`- Confidence: ${prediction.confidence.model} (Value: ${prediction.confidence.value}, Volatility: ${prediction.confidence.volatility})`);
    }

    console.log(`\n- Game Script: ${prediction.script.primary} (${(prediction.script.confidence * 100).toFixed(0)}% sure)`);
    console.log(`- Expected Goals: ${prediction.expectedGoals.home} - ${prediction.expectedGoals.away} (Total: ${prediction.expectedGoals.total})`);
    console.log(`- Reason Codes: ${prediction.reasonCodes.join(', ')}`);
    
    if (prediction.rankedMarkets && prediction.rankedMarkets.length > 0) {
      console.log('\n- Top 3 Market Candidates:');
      prediction.rankedMarkets.slice(0, 3).forEach((m, i) => {
        console.log(`  ${i+1}. ${m.marketKey}: ${(m.modelProbability * 100).toFixed(1)}% (Score: ${m.finalScore.toFixed(3)})`);
      });
    }

  } catch (err) {
    console.error('Test Failed:', err.message);
    console.error(err.stack);
  }
  process.exit(0);
}

testEngine();
