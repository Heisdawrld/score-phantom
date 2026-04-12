import { safeNum } from '../utils/math.js';

// ── Market family helpers ─────────────────────────────────────────────────────

function isResultPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk === 'home_win' || mk === 'away_win' || mk === 'draw' ||
         mk === 'double_chance_home' || mk === 'double_chance_away' ||
         mk === 'dnb_home' || mk === 'dnb_away';
}

function isGoalsPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('over') || mk.includes('under');
}

function isUnderPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('under');
}

function isOverPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('over');
}

function isBttsPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('btts');
}

function isHomePick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('home');
}

function isAwayPick(marketKey) {
  const mk = (marketKey || '').toLowerCase();
  return mk.includes('away');
}

// ── Code conflict check — returns true if the code CONTRADICTS the pick ───────

function contradictsPick(code, marketKey) {
  const mk = (marketKey || '').toLowerCase();

  if (isUnderPick(mk)) {
    // Unders are killed by codes that signal high scoring
    return ['home_scoring_rate_strong', 'both_teams_high_scoring_tendency',
            'btts_profile_high', 'h2h_high_scoring_history', 'projected_open_game'].includes(code);
  }

  if (isOverPick(mk)) {
    // Overs are killed by codes that signal low scoring
    return ['both_teams_low_scoring_tendency', 'btts_profile_low',
            'h2h_low_scoring_history', 'h2h_historically_under',
            'low_event_profile', 'home_defense_strong',
            'away_struggles_to_score_away'].includes(code);
  }

  if (mk === 'btts_yes') {
    return ['btts_profile_low', 'home_defense_strong', 'away_struggles_to_score_away',
            'away_failed_to_score_often', 'home_failed_to_score_often',
            'both_teams_low_scoring_tendency', 'low_event_profile'].includes(code);
  }

  if (mk === 'btts_no') {
    return ['btts_profile_high', 'h2h_btts_rate_high', 'both_teams_high_scoring_tendency',
            'projected_open_game'].includes(code);
  }

  if (mk === 'home_win' || mk === 'dnb_home' || mk === 'double_chance_home') {
    return ['away_strength_advantage', 'strong_away_form', 'projected_away_control',
            'poor_away_venue_record'].includes(code);
  }

  if (mk === 'away_win' || mk === 'dnb_away' || mk === 'double_chance_away') {
    return ['home_strength_gap_high', 'home_form_strong', 'projected_home_control',
            'strong_home_venue_record'].includes(code);
  }

  return false;
}

/**
 * Build a rich, match-specific set of reason codes.
 *
 * Now receives bestPickMarketKey so it can:
 *   1. Prioritise codes that SUPPORT the pick
 *   2. Exclude codes that CONTRADICT the pick (they'd confuse users)
 *   3. Always include warnings (chaos, upset risk, low data)
 *
 * @param {object} featureVector
 * @param {object} scriptOutput
 * @param {string|null} bestPickMarketKey - the winning pick's marketKey (e.g. 'under_25', 'home_win')
 */
export function buildReasonCodes(featureVector, scriptOutput, bestPickMarketKey = null) {
  const fv = featureVector || {};
  const script = scriptOutput || {};
  const primary = script.primary || '';
  const codes = [];

  const homeBase = safeNum(fv.homeBaseRating, 1.2);
  const awayBase = safeNum(fv.awayBaseRating, 1.2);
  const homeAvgScored = safeNum(fv.homeAvgScored, 1.2);
  const awayAvgScored = safeNum(fv.awayAvgScored, 1.0);
  const homeAvgConceded = safeNum(fv.homeAvgConceded, 1.1);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, 1.1);
  const homeBtts = safeNum(fv.homeBttsRate, 0.45);
  const awayBtts = safeNum(fv.awayBttsRate, 0.45);
  const h2hBtts = fv.h2hBttsRate != null ? safeNum(fv.h2hBttsRate) : null;
  const h2hAvgGoals = fv.h2hAvgGoals != null ? safeNum(fv.h2hAvgGoals) : null;
  const h2hOver25 = fv.h2hOver25Rate != null ? safeNum(fv.h2hOver25Rate) : null;
  const homePointsLast5 = safeNum(fv.homePointsLast5, 6);
  const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
  const homeWinRate = safeNum(fv.homeWinRate, 0.4);
  const awayWinRate = safeNum(fv.awayWinRate, 0.35);
  const homeFailedRate = safeNum(fv.homeFailedToScoreRate, 0.3);
  const awayFailedRate = safeNum(fv.awayFailedToScoreRate, 0.35);
  const homeOver25 = safeNum(fv.homeOver25Rate, 0.4);
  const awayOver25 = safeNum(fv.awayOver25Rate, 0.4);
  const chaosScore = safeNum(fv.matchChaosScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  const homeContext = fv.homeContext || 'midtable';
  const awayContext = fv.awayContext || 'midtable';
  const homeHomeGoalsFor = fv.homeHomeGoalsFor;
  const awayAwayGoalsFor = fv.awayAwayGoalsFor;
  const awayAwayWinRate = fv.awayAwayWinRate;
  const homeHomeWinRate = fv.homeHomeWinRate;

  // ── Strength gap ───────────────────────────────────────────────────────────
  const strengthGap = homeBase - awayBase;
  if (strengthGap > 0.35) codes.push('home_strength_gap_high');
  else if (strengthGap < -0.25) codes.push('away_strength_advantage');

  // ── Form recency ───────────────────────────────────────────────────────────
  if (homePointsLast5 >= 12) codes.push('home_form_strong');
  if (awayPointsLast5 > homePointsLast5 + 3) codes.push('strong_away_form');
  if (homePointsLast5 <= 3) codes.push('home_form_poor');
  if (awayPointsLast5 <= 3) codes.push('away_form_poor');

  // ── Venue-specific scoring ────────────────────────────────────────────────
  if (homeHomeGoalsFor != null && homeHomeGoalsFor > 1.8) codes.push('home_scoring_rate_strong');
  else if (homeAvgScored > 1.6) codes.push('home_scoring_rate_strong');

  if (awayAwayGoalsFor != null && awayAwayGoalsFor < 0.6) codes.push('away_struggles_to_score_away');
  else if (awayAvgScored < 0.8) codes.push('away_struggles_to_score_away');

  // ── Defensive records ─────────────────────────────────────────────────────
  const awayDefProxy = fv.awayAwayGoalsAgainst != null ? safeNum(fv.awayAwayGoalsAgainst) : awayAvgConceded;
  if (awayDefProxy > 1.6) codes.push('away_defense_weak_away');
  if (homeAvgConceded < 0.8) codes.push('home_defense_strong');
  if (awayFailedRate > 0.4) codes.push('away_failed_to_score_often');
  if (homeFailedRate > 0.4) codes.push('home_failed_to_score_often');

  // ── H2H signals ───────────────────────────────────────────────────────────
  if (h2hBtts != null && h2hBtts > 0.65 && fv.h2hMatchesAvailable >= 3) codes.push('h2h_btts_rate_high');
  if (h2hAvgGoals != null && h2hAvgGoals < 1.8 && fv.h2hMatchesAvailable >= 3) codes.push('h2h_low_scoring_history');
  if (h2hAvgGoals != null && h2hAvgGoals > 2.8 && fv.h2hMatchesAvailable >= 3) codes.push('h2h_high_scoring_history');
  if (h2hOver25 != null && h2hOver25 < 0.3 && fv.h2hMatchesAvailable >= 3) codes.push('h2h_historically_under');

  // ── BTTS profile ──────────────────────────────────────────────────────────
  const combinedBtts = (homeBtts + awayBtts) / 2;
  if (combinedBtts > 0.60) codes.push('btts_profile_high');
  if (combinedBtts < 0.35) codes.push('btts_profile_low');

  // ── Over/under tendencies ─────────────────────────────────────────────────
  const combinedOver25 = (homeOver25 + awayOver25) / 2;
  if (combinedOver25 > 0.60) codes.push('both_teams_high_scoring_tendency');
  if (combinedOver25 < 0.28) codes.push('both_teams_low_scoring_tendency');

  // ── Game script signals ───────────────────────────────────────────────────
  if (primary === 'dominant_home_pressure') codes.push('projected_home_control');
  if (primary === 'dominant_away_pressure') codes.push('projected_away_control');
  if (primary === 'open_end_to_end') codes.push('projected_open_game');
  if (primary === 'tight_low_event') codes.push('low_event_profile');

  // ── League table context ──────────────────────────────────────────────────
  if (homeContext === 'relegation' || homeContext === 'danger') codes.push('home_in_relegation_fight');
  if (awayContext === 'relegation' || awayContext === 'danger') codes.push('away_in_relegation_fight');
  if (homeContext === 'title' || homeContext === 'ucl') codes.push('home_title_race_pressure');
  if (homeContext === 'title' && awayContext === 'relegation') codes.push('massive_table_gap');

  // ── Venue win rates ───────────────────────────────────────────────────────
  if (homeHomeWinRate != null && homeHomeWinRate > 0.65) codes.push('strong_home_venue_record');
  if (awayAwayWinRate != null && awayAwayWinRate < 0.15) codes.push('poor_away_venue_record');

  // ── Volatility / data (warnings — always included regardless of pick) ─────
  const warningCodes = [];
  if (chaosScore > 0.60) warningCodes.push('high_volatility_warning');
  if (upsetRisk > 0.65) warningCodes.push('upset_risk_elevated');
  if (dataCompleteness < 0.4) warningCodes.push('low_data_quality');

  // ── Filter and rank codes for the best pick ───────────────────────────────
  const unique = [...new Set(codes)];

  if (!bestPickMarketKey) {
    // No pick info available — return top 4 as before
    const specific = unique.filter(c => !['home_strength_gap_high', 'away_defense_weak_away'].includes(c));
    const generic  = unique.filter(c => ['home_strength_gap_high', 'away_defense_weak_away'].includes(c));
    return [...specific, ...generic, ...warningCodes].slice(0, 4);
  }

  // Separate codes into: supporting, neutral, contradicting
  const supporting    = unique.filter(c => !contradictsPick(c, bestPickMarketKey));
  const contradicting = unique.filter(c =>  contradictsPick(c, bestPickMarketKey));

  // Build final list: warnings always included, supporting prioritised,
  // contradicting fully suppressed from the headline reasons
  const ranked = [...supporting, ...warningCodes];

  // De-duplicate and take top 4
  return [...new Set(ranked)].slice(0, 4);
}
