import 'dotenv/config';
import { createClient } from '@libsql/client';
import { fetchFixturesBySeason } from '../services/bsd.js';
import { flattenFeatureVector } from '../features/flattenFeatureVector.js';
import { classifyMatchScript } from '../scripts/archive/classifyMatchScript.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { buildMarketCandidates } from '../markets/buildMarketCandidates.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { assessMatchPredictability } from '../engine/assessMatchPredictability.js';

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Minimal mock vector builder for historical matches
// In a real scenario, this would use point-in-time data
function buildHistoricalVector(match) {
  // Try to use actual post-match xG if available, otherwise fallback
  const homeXg = match.actual_home_xg || match.home_xg || 1.5;
  const awayXg = match.actual_away_xg || match.away_xg || 1.2;
  
  return {
    homeAttackRating: homeXg,
    homeDefenseRating: awayXg,
    awayAttackRating: awayXg,
    awayDefenseRating: homeXg,
    homeAvgScored: match.home_goals || 1,
    homeAvgConceded: match.away_goals || 1,
    awayAvgScored: match.away_goals || 1,
    awayAvgConceded: match.home_goals || 1,
    homeMotivationScore: 0.5,
    awayMotivationScore: 0.5,
    matchChaosScore: 0.5,
    dataCompletenessScore: 0.8,
    upsetRiskScore: 0.5,
    homeHomeGoalsFor: match.home_goals || 1,
    homeHomeGoalsAgainst: match.away_goals || 1,
    awayAwayGoalsFor: match.away_goals || 1,
    awayAwayGoalsAgainst: match.home_goals || 1,
    homeAvgXgFor: homeXg,
    homeAvgXgAgainst: awayXg,
    awayAvgXgFor: awayXg,
    awayAvgXgAgainst: homeXg
  };
}

function determineResult(market, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  switch (market) {
    case 'home_win': return homeGoals > awayGoals ? 'WON' : 'LOST';
    case 'away_win': return awayGoals > homeGoals ? 'WON' : 'LOST';
    case 'draw': return homeGoals === awayGoals ? 'WON' : 'LOST';
    case 'home_draw': return homeGoals >= awayGoals ? 'WON' : 'LOST';
    case 'away_draw': return awayGoals >= homeGoals ? 'WON' : 'LOST';
    case 'home_away': return homeGoals !== awayGoals ? 'WON' : 'LOST';
    case 'over_1_5': return total > 1.5 ? 'WON' : 'LOST';
    case 'under_1_5': return total < 1.5 ? 'WON' : 'LOST';
    case 'over_2_5': return total > 2.5 ? 'WON' : 'LOST';
    case 'under_2_5': return total < 2.5 ? 'WON' : 'LOST';
    case 'over_3_5': return total > 3.5 ? 'WON' : 'LOST';
    case 'under_3_5': return total < 3.5 ? 'WON' : 'LOST';
    case 'btts_yes': return (homeGoals > 0 && awayGoals > 0) ? 'WON' : 'LOST';
    case 'btts_no': return (homeGoals === 0 || awayGoals === 0) ? 'WON' : 'LOST';
    case 'home_over_0_5': return homeGoals > 0.5 ? 'WON' : 'LOST';
    case 'away_over_0_5': return awayGoals > 0.5 ? 'WON' : 'LOST';
    case 'home_over_1_5': return homeGoals > 1.5 ? 'WON' : 'LOST';
    case 'away_over_1_5': return awayGoals > 1.5 ? 'WON' : 'LOST';
    default: return 'VOID';
  }
}

async function run() {
  const args = process.argv.slice(2);
  const leagueArg = args.find(a => a.startsWith('--league='));
  const seasonArg = args.find(a => a.startsWith('--season='));

  if (!leagueArg || !seasonArg) {
    console.error("Usage: node runBacktest.js --league=<id> --season=<year>");
    process.exit(1);
  }

  const leagueId = leagueArg.split('=')[1];
  const seasonId = seasonArg.split('=')[1];

  console.log(`\n🚀 Starting Backtest for League ${leagueId}, Season ${seasonId}`);

  // 1. Fetch matches
  console.log(`Fetching historical matches...`);
  const matches = await fetchFixturesBySeason(seasonId, { status: 'finished' });
  console.log(`Found ${matches.length} finished matches.`);

  // 2. Get already tested matches
  const testedRes = await db.execute({
    sql: `SELECT fixture_id FROM backtest_results WHERE league_id = ? AND season = ?`,
    args: [leagueId, seasonId]
  });
  const testedIds = new Set(testedRes.rows.map(r => r.fixture_id));
  
  const toTest = matches.filter(m => !testedIds.has(String(m.id)) && m.home_score?.current !== undefined);
  console.log(`Matches to process: ${toTest.length}`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toTest.length; i++) {
    const match = toTest[i];
    const fixtureId = String(match.id);
    const homeTeam = match.home_team?.name || 'Home';
    const awayTeam = match.away_team?.name || 'Away';
    const homeGoals = match.home_score?.current || 0;
    const awayGoals = match.away_score?.current || 0;
    const matchDate = match.start_time || new Date().toISOString();

    console.log(`[${i+1}/${toTest.length}] Testing ${homeTeam} vs ${awayTeam}...`);

    try {
      // Build vector & run engine
      const vectorNested = buildHistoricalVector(match);
      const flatVector = flattenFeatureVector(vectorNested);
      
      const script = classifyMatchScript(flatVector);
      const xg = estimateExpectedGoals(flatVector, script);
      const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);
      const rawProbs = deriveMarketProbabilities(scoreMatrix);
      const calibratedProbs = calibrateProbabilities(rawProbs, script);
      const candidates = buildMarketCandidates(calibratedProbs, null);
      const markets = scoreMarketCandidates(candidates, script, flatVector, {}, null);

      if (!markets || markets.length === 0) {
        console.log(`  -> No markets found, skipping.`);
        continue;
      }

      // Sort by finalScore descending
      markets.sort((a, b) => b.finalScore - a.finalScore);
      const topPick = markets[0];
      
      const actualResult = determineResult(topPick.id, homeGoals, awayGoals);
      
      // Save to DB
      await db.execute({
        sql: `
          INSERT INTO backtest_results 
          (fixture_id, league_id, season, match_date, home_team, away_team, predicted_script, top_prediction, confidence_score, actual_result, home_goals, away_goals)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          fixtureId, leagueId, seasonId, matchDate, homeTeam, awayTeam,
          script?.primary || 'balanced', topPick.id, topPick.probability,
          actualResult, homeGoals, awayGoals
        ]
      });

      if (actualResult === 'WON') successCount++;
      else failCount++;

      console.log(`  -> Pick: ${topPick.id} (${(topPick.probability*100).toFixed(0)}%) | Result: ${actualResult} (${homeGoals}-${awayGoals})`);
      
      // Rate limiting
      await sleep(100);

    } catch (err) {
      console.error(`  -> Error processing ${fixtureId}:`, err.message);
    }
  }

  const totalProcessed = successCount + failCount;
  console.log(`\n✅ Backtest Complete.`);
  console.log(`Processed: ${totalProcessed}`);
  if (totalProcessed > 0) {
    console.log(`Hit Rate: ${((successCount / totalProcessed) * 100).toFixed(1)}%`);
  }
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});