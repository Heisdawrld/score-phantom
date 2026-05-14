/**
 * computeLeagueContext.js
 *
 * Extracts league-specific statistical baselines from enrichment standings data.
 *
 * WHY THIS EXISTS:
 * The prediction engine was using hardcoded global averages (LEAGUE_AVG = 1.35,
 * BTTS_RATE = 0.46, etc.) that are wrong for most leagues. The Swiss Super League
 * averages ~1.50 goals per team per game, the Eredivisie ~1.55, while Serie A
 * averages ~1.30. Using 1.35 for all leagues systematically biases xG estimation
 * and inflates UNDER probabilities for high-scoring leagues.
 *
 * WHAT IT COMPUTES:
 * - leagueAvgGoalsPerTeam  — average goals scored per team per game in this league
 * - leagueAvgGoalsPerGame  — average TOTAL goals per game (both teams combined)
 * - leagueBttsRate         — % of matches where both teams score
 * - leagueCleanSheetRate   — % of matches where a team keeps a clean sheet
 * - leagueOver25Rate       — % of matches with >2.5 total goals
 * - leagueOver35Rate       — % of matches with >3.5 total goals
 * - leagueScoreSuccessRate — % of matches where a team scores at least 1 goal
 *
 * Data source: enrichment standings (GF, GA, played per team) combined with
 * form profile data when available.
 *
 * Falls back to global defaults when standings data is insufficient.
 */

import { safeNum, clamp } from '../utils/math.js';

// Global defaults — used when no league-specific data is available
// These represent the median across ~50 major leagues worldwide
const GLOBAL_DEFAULTS = {
  leagueAvgGoalsPerTeam:  1.35,
  leagueAvgGoalsPerGame:  2.70,
  leagueBttsRate:         0.46,
  leagueCleanSheetRate:   0.28,
  leagueOver25Rate:       0.50,
  leagueOver35Rate:       0.30,
  leagueScoreSuccessRate: 0.70,
};

/**
 * Compute league-specific baselines from standings data.
 *
 * Each team row in standings has: played, won, draw, lost, gf (goals for), ga (goals against)
 * From this we can derive:
 *   totalLeagueGoals = sum(all GF)  — each goal counted once by the scoring team
 *   totalLeagueGames = sum(all played) / 2  — each game involves 2 teams
 *   avgGoalsPerGame  = totalLeagueGoals / totalLeagueGames
 *   avgGoalsPerTeam  = avgGoalsPerGame / 2
 *
 * For BTTS/clean sheet/over rates, we estimate from goals-per-game distributions
 * using Poisson approximation, since standings don't contain match-level granularity.
 *
 * @param {Array} standings - league standings from enrichment meta
 * @param {object} homeProfile - home team enrichment profile (optional)
 * @param {object} awayProfile - away team enrichment profile (optional)
 * @returns {object} league context features
 */
export function computeLeagueContext(standings = [], homeProfile = null, awayProfile = null) {
  // ── 1. Try computing from standings ──────────────────────────────────────
  const validTeams = (standings || []).filter(row => {
    const played = safeNum(row?.played, 0);
    const gf = safeNum(row?.gf ?? row?.goals_for ?? row?.goalsFor, 0);
    return played > 0 && gf >= 0;
  });

  let fromStandings = null;

  if (validTeams.length >= 4) {
    let totalGF = 0;
    let totalPlayed = 0;

    for (const row of validTeams) {
      const played = safeNum(row.played, 0);
      const gf = safeNum(row.gf ?? row.goals_for ?? row.goalsFor, 0);
      totalGF += gf;
      totalPlayed += played;
    }

    const totalGames = totalPlayed / 2; // each game counted twice (home + away)
    if (totalGames >= 10) { // need at least 10 games for meaningful average
      const avgGoalsPerGame = totalGF / totalGames;
      const avgGoalsPerTeam = avgGoalsPerGame / 2;

      fromStandings = {
        leagueAvgGoalsPerTeam:  avgGoalsPerTeam,
        leagueAvgGoalsPerGame:  avgGoalsPerGame,
        // Estimate BTTS/Over rates from Poisson with lambda = avgGoalsPerTeam
        // P(BTTS) = (1 - P(X=0))² where P(X=0) = e^(-lambda)
        // P(Over X.5) = 1 - sum of P(exactly k goals) for k=0..X
        leagueBttsRate:         estimateBttsRate(avgGoalsPerTeam),
        leagueCleanSheetRate:   estimateCleanSheetRate(avgGoalsPerTeam),
        leagueOver25Rate:       estimateOverRate(avgGoalsPerGame, 2.5),
        leagueOver35Rate:       estimateOverRate(avgGoalsPerGame, 3.5),
        leagueScoreSuccessRate: 1 - Math.exp(-avgGoalsPerTeam),
        _source: 'standings',
        _teamCount: validTeams.length,
        _gameCount: Math.round(totalGames),
      };
    }
  }

  // ── 2. Augment with profile data if available ────────────────────────────
  // Team profiles have direct BTTS/Over/CleanSheet rates which are more accurate
  // than Poisson estimates. If we have enough profiles, use them to correct.
  const profiles = [homeProfile, awayProfile].filter(Boolean);
  let profileCorrection = null;

  if (profiles.length >= 1) {
    const bttsRates = profiles.map(p => safeNum(p.bttsRate, null)).filter(v => v != null);
    const csRates = profiles.map(p => safeNum(p.cleanSheetRate, null)).filter(v => v != null);
    const over25Rates = profiles.map(p => safeNum(p.over25Rate ?? p.over_2_5_rate, null)).filter(v => v != null);
    const over35Rates = profiles.map(p => safeNum(p.over35Rate ?? p.over_3_5_rate, null)).filter(v => v != null);

    profileCorrection = {
      btts: bttsRates.length > 0 ? bttsRates.reduce((a, b) => a + b, 0) / bttsRates.length : null,
      cs: csRates.length > 0 ? csRates.reduce((a, b) => a + b, 0) / csRates.length : null,
      over25: over25Rates.length > 0 ? over25Rates.reduce((a, b) => a + b, 0) / over25Rates.length : null,
      over35: over35Rates.length > 0 ? over35Rates.reduce((a, b) => a + b, 0) / over35Rates.length : null,
    };
  }

  // ── 3. Merge: standings-based + profile corrections ──────────────────────
  let result;

  if (fromStandings) {
    result = { ...fromStandings };

    // Profile BTTS/Over rates are more accurate than Poisson estimates
    // Blend: 60% profile + 40% Poisson estimate when profile data exists
    if (profileCorrection) {
      if (profileCorrection.btts != null) {
        result.leagueBttsRate = clamp(0.40 * result.leagueBttsRate + 0.60 * profileCorrection.btts, 0.15, 0.85);
      }
      if (profileCorrection.over25 != null) {
        result.leagueOver25Rate = clamp(0.40 * result.leagueOver25Rate + 0.60 * profileCorrection.over25, 0.15, 0.85);
      }
      if (profileCorrection.over35 != null) {
        result.leagueOver35Rate = clamp(0.40 * result.leagueOver35Rate + 0.60 * profileCorrection.over35, 0.05, 0.70);
      }
      if (profileCorrection.cs != null) {
        result.leagueCleanSheetRate = clamp(0.40 * result.leagueCleanSheetRate + 0.60 * profileCorrection.cs, 0.10, 0.55);
      }
      result._source = 'standings+profiles';
    }
  } else if (profileCorrection) {
    // No standings, but we have profile data — use it as a rough proxy
    // Profiles are team-level, not league-level, but still better than global defaults
    const avgBtts = profileCorrection.btts ?? GLOBAL_DEFAULTS.leagueBttsRate;
    const avgOver25 = profileCorrection.over25 ?? GLOBAL_DEFAULTS.leagueOver25Rate;
    // Reverse-engineer goals-per-game from BTTS rate (rough approximation)
    const approxGpg = avgOver25 > 0.55 ? 2.9 : avgOver25 > 0.45 ? 2.6 : 2.3;

    result = {
      leagueAvgGoalsPerTeam:  approxGpg / 2,
      leagueAvgGoalsPerGame:  approxGpg,
      leagueBttsRate:         avgBtts,
      leagueCleanSheetRate:   profileCorrection.cs ?? GLOBAL_DEFAULTS.leagueCleanSheetRate,
      leagueOver25Rate:       avgOver25,
      leagueOver35Rate:       profileCorrection.over35 ?? GLOBAL_DEFAULTS.leagueOver35Rate,
      leagueScoreSuccessRate: 1 - Math.exp(-approxGpg / 2),
      _source: 'profiles_only',
      _teamCount: 0,
      _gameCount: 0,
    };
  } else {
    // No data at all — use global defaults
    result = {
      ...GLOBAL_DEFAULTS,
      _source: 'global_defaults',
      _teamCount: 0,
      _gameCount: 0,
    };
  }

  // ── 4. Final safety clamps ───────────────────────────────────────────────
  result.leagueAvgGoalsPerTeam  = clamp(result.leagueAvgGoalsPerTeam, 0.8, 2.0);
  result.leagueAvgGoalsPerGame  = clamp(result.leagueAvgGoalsPerGame, 1.6, 4.0);
  result.leagueBttsRate         = clamp(result.leagueBttsRate, 0.15, 0.85);
  result.leagueCleanSheetRate   = clamp(result.leagueCleanSheetRate, 0.10, 0.55);
  result.leagueOver25Rate       = clamp(result.leagueOver25Rate, 0.15, 0.85);
  result.leagueOver35Rate       = clamp(result.leagueOver35Rate, 0.05, 0.70);
  result.leagueScoreSuccessRate = clamp(result.leagueScoreSuccessRate, 0.40, 0.95);

  // Round for cleanliness
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'number' && !key.startsWith('_')) {
      result[key] = parseFloat(result[key].toFixed(4));
    }
  }

  return result;
}

// ── Poisson estimation helpers ─────────────────────────────────────────────

function poissonPmf(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Estimate BTTS rate from average goals per team.
 * P(both teams score) = (1 - P(X=0))² where X ~ Poisson(lambda)
 */
function estimateBttsRate(avgGoalsPerTeam) {
  const pScore = 1 - Math.exp(-avgGoalsPerTeam); // P(team scores at least 1)
  return pScore * pScore; // independent approximation
}

/**
 * Estimate clean sheet rate from average goals per team.
 * P(clean sheet) = P(opponent scores 0) = e^(-lambda)
 */
function estimateCleanSheetRate(avgGoalsPerTeam) {
  return Math.exp(-avgGoalsPerTeam);
}

/**
 * Estimate Over X.5 rate from average total goals per game.
 * P(total > threshold) = 1 - sum_{k=0}^{floor(threshold)} P(k goals)
 * where total goals ~ Poisson(lambda = avgGoalsPerGame)
 */
function estimateOverRate(avgGoalsPerGame, threshold) {
  const lambda = avgGoalsPerGame;
  let pUnderOrEqual = 0;
  for (let k = 0; k <= Math.floor(threshold); k++) {
    pUnderOrEqual += poissonPmf(k, lambda);
  }
  return 1 - pUnderOrEqual;
}
