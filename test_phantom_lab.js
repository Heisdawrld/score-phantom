import { buildHypotheticalFeatureVector } from './src/features/buildHypotheticalFeatureVector.js';
import { modifyFeatureVectorForSimulation } from './src/features/modifyFeatureVector.js';
import { estimateExpectedGoals } from './src/probabilities/estimateExpectedGoals.js';
import { scoreMarketCandidates } from './src/markets/scoreMarketCandidates.js';
import { assessMatchPredictability } from './src/engine/assessMatchPredictability.js';
import db from './src/config/database.js';

async function run() {
  try {
    // Pick two teams that likely have NO H2H in the local DB (e.g., a PL team and a La Liga team)
    // We'll just mock the names since the DB lookup is by name in buildHypotheticalFeatureVector
    console.log("Simulating Arsenal vs Real Madrid...");
    const baseVector = await buildHypotheticalFeatureVector(42, 541, "Arsenal", "Real Madrid");
    
    console.log("--- Base Vector Generated ---");
    console.log("Form features:", baseVector.homeFormFeatures.matches_played, baseVector.awayFormFeatures.matches_played);
    console.log("H2H features:", baseVector.h2hFeatures.matches_played);
    console.log("Data Completeness:", baseVector.enrichmentCompleteness);
    
    const pred = assessMatchPredictability(baseVector);
    const { home_xg, away_xg } = estimateExpectedGoals(baseVector);
    const markets = scoreMarketCandidates(home_xg, away_xg, baseVector);
    
    console.log("\n--- Engine Output ---");
    console.log("Predictability:", pred);
    console.log("xG:", home_xg, " - ", away_xg);
    console.log("Top Market:", markets[0]?.market, " | Advisor:", markets[0]?.advisor_status);
    
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
