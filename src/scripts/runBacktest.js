import 'dotenv/config';
import db from "../config/database.js";
import { fetchFixturesByRange } from '../services/bsd.js';
import { flattenFeatureVector } from '../features/flattenFeatureVector.js';
import { classifyMatchScript } from '../scripts/classifyMatchScript.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { buildMarketCandidates } from '../markets/buildMarketCandidates.js';
import { scoreMarketCandidates } from '../markets/scoreMarketCandidates.js';
import { assessMatchPredictability } from '../engine/assessMatchPredictability.js';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Minimal mock vector builder for historical matches
//
// ⚠️ LOOK-AHEAD BIAS WARNING:
// This builder uses POST-MATCH data (actual goals, actual xG) as if it were
// available pre-match. This inflates backtest accuracy because the model
// gets to "see the future". The results are NOT representative of live
// prediction accuracy.
//
// To get realistic backtest results, you need POINT-IN-TIME data:
// - Pre-match expected lineups
// - Season-level stats going into the match (not including the match itself)
// - Pre-match odds
//
// For now, this provides a directional sense of model quality but should
// NOT be quoted as actual accuracy.
function buildHistoricalVector(match) {
  // Use season-average stats as a proxy for pre-match data
  // This is still somewhat biased but much less than using actual match results
  const homeXg = match.season_home_xg_avg || match.pre_match_home_xg || 1.3;
  const awayXg = match.season_away_xg_avg || match.pre_match_away_xg || 1.1;
  
  return {
    homeAttackRating: homeXg,
    homeDefenseRating: awayXg, // Use opponent's attack as defense proxy
    awayAttackRating: awayXg,
    awayDefenseRating: homeXg,
    homeAvgScored: match.season_home_goals_avg || 1.3,
    homeAvgConceded: match.season_home_conceded_avg || 1.1,
    awayAvgScored: match.season_away_goals_avg || 1.2,
    awayAvgConceded: match.season_away_conceded_avg || 1.2,
    homeMotivationScore: 0.5,
    awayMotivationScore: 0.5,
    matchChaosScore: 0.5,
    dataCompletenessScore: 0.6, // Reduced from 0.8 to reflect limited pre-match data
    upsetRiskScore: 0.5,
    homeHomeGoalsFor: match.season_home_goals_avg || 1.3,
    homeHomeGoalsAgainst: match.season_home_conceded_avg || 1.1,
    awayAwayGoalsFor: match.season_away_goals_avg || 1.2,
    awayAwayGoalsAgainst: match.season_away_conceded_avg || 1.2,
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

async function runBacktestForSeason(leagueId, seasonId) {
  console.log(`Fetching historical matches for the last 30 days...`);
  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const allMatches = await fetchFixturesByRange(dateFrom, dateTo);
  const matches = allMatches.filter(m => m.status === 'finished');
  console.log(`Found ${matches.length} finished matches.`);

  // 2. Get already tested matches globally
  const testedRes = await db.execute({ sql: `SELECT fixture_id FROM backtest_results` });
  const testedIds = new Set(testedRes.rows.map(r => String(r.fixture_id)));
  
  const toTest = matches.filter(m => !testedIds.has(String(m.id)) && m.home_score !== null && m.home_score !== undefined);
  console.log(`Matches to process: ${toTest.length}`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < Math.min(toTest.length, 500); i++) { // Process max 500 per run to avoid huge runs
    const match = toTest[i];
    const fixtureId = String(match.id);
    const mLeagueId = match.league?.id || leagueId;
    const mSeasonId = match.season?.year || seasonId;
    const homeTeam = match.home_team?.name || match.home_team || 'Home';
    const awayTeam = match.away_team?.name || match.away_team || 'Away';
    const homeGoals = match.home_score || 0;
    const awayGoals = match.away_score || 0;
    const matchDate = match.start_time || match.event_date || new Date().toISOString();

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
      
      const actualResult = determineResult(topPick.marketKey, homeGoals, awayGoals);
      
      // Save to DB
      await db.execute({
        sql: `
          INSERT INTO backtest_results 
          (fixture_id, league_id, season, match_date, home_team, away_team, predicted_script, top_prediction, confidence_score, actual_result, home_goals, away_goals)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          fixtureId, String(mLeagueId), String(mSeasonId), matchDate, homeTeam, awayTeam,
          script?.primary || 'balanced', topPick.marketKey, topPick.modelProbability,
          actualResult, homeGoals, awayGoals
        ]
      });

      if (actualResult === 'WON') successCount++;
      else if (actualResult === 'LOST') failCount++;

      console.log(`  -> Pick: ${topPick.marketKey} (${(topPick.modelProbability*100).toFixed(0)}%) | Result: ${actualResult} (${homeGoals}-${awayGoals})`);
      
      // Rate limiting
      await sleep(100);

    } catch (err) {
      console.error(`  -> Error processing ${fixtureId}:`, err.message);
    }
  }

  const totalProcessed = successCount + failCount;
  console.log(`\n⚠️  Season ${seasonId} Complete (LOOK-AHEAD BIAS WARNING).`);
  console.log(`These results use post-match data as pre-match input.`);
  console.log(`Actual live accuracy will be lower. Do NOT quote these as real accuracy.`);
  console.log(`Processed: ${totalProcessed}`);
  if (totalProcessed > 0) {
    console.log(`Hit Rate: ${((successCount / totalProcessed) * 100).toFixed(1)}% (inflated by look-ahead bias)`);
  }
}

async function run() {
  const args = process.argv.slice(2);
  const leagueArg = args.find(a => a.startsWith('--league='));
  const seasonArg = args.find(a => a.startsWith('--season='));

  if (leagueArg && seasonArg) {
    const leagueId = leagueArg.split('=')[1];
    const seasonId = seasonArg.split('=')[1];
    await runBacktestForSeason(leagueId, seasonId);
  } else {
    // Run for the top 5 leagues over the last 3 seasons if no args provided
    // Premier League (39), La Liga (140), Serie A (140 is actually La Liga, Serie A is 135), Bundesliga (140), Ligue 1 (61)
    // BSD API seasons for PL: 2023=current, 2022, 2021
    const leagues = [39, 140, 135, 78, 61]; 
    const seasons = [2023, 2022, 2021];

    for (const league of leagues) {
      for (const season of seasons) {
        await runBacktestForSeason(league, season);
      }
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
