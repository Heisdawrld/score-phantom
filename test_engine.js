import { modifyFeatureVectorForSimulation } from './src/features/modifyFeatureVector.js';
import { assessMatchPredictability } from './src/engine/assessMatchPredictability.js';
import { estimateExpectedGoals } from './src/probabilities/estimateExpectedGoals.js';
import { scoreMarketCandidates } from './src/markets/scoreMarketCandidates.js';

const mockVector = {
  home_offensive_strength: 1.5,
  home_defensive_strength: 0.8,
  away_offensive_strength: 1.2,
  away_defensive_strength: 1.0,
  home_momentum: 1.1,
  away_momentum: 0.9,
  expected_goals_variance: 1.0,
  data_completeness: 0.8,
  league_volatility: 0.5,
  historical_home_goals: 1.5,
  historical_away_goals: 1.2,
  historical_h2h_home_goals: 1.5,
  historical_h2h_away_goals: 1.2,
  venue_home_advantage: 1.1,
  venue_away_disadvantage: 0.9
};

const modifiers = {
  homeMotivation: 1, // High
  awayInjuries: 3,
  weather: 'snow'
};

try {
  console.log("Testing modification logic...");
  const simVector = modifyFeatureVectorForSimulation(mockVector, modifiers);
  console.log("Sim Vector:", simVector);

  console.log("Testing predictability gate...");
  const pred = assessMatchPredictability(simVector);
  console.log("Predictability:", pred);

  console.log("Testing xG math...");
  const { home_xg, away_xg } = estimateExpectedGoals(simVector);
  console.log(`xG -> Home: ${home_xg}, Away: ${away_xg}`);

  console.log("Testing market scoring...");
  const markets = scoreMarketCandidates(home_xg, away_xg, simVector);
  console.log("Markets generated:", markets.length);
  
  console.log("✅ Engine integration tests passed!");
} catch (e) {
  console.error("❌ Test failed:", e);
}