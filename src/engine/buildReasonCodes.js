import { safeNum } from '../utils/math.js';

/**
 * Check feature thresholds and return array of reason codes.
 *
 * @param {object} featureVector - flat feature vector
 * @param {object} scriptOutput
 * @returns {string[]}
 */
export function buildReasonCodes(featureVector, scriptOutput) {
  const fv = featureVector || {};
  const script = scriptOutput || {};
  const primary = script.primary || '';

  const codes = [];

  // home_strength_gap_high
  const homeBase = safeNum(fv.homeBaseRating, 1.2);
  const awayBase = safeNum(fv.awayBaseRating, 1.2);
  if (homeBase - awayBase > 0.2) {
    codes.push('home_strength_gap_high');
  }

  // away_defense_weak_away
  const awayAwayGoalsAgainst = safeNum(fv.awayAwayGoalsAgainst, null);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, 1.1);
  const awayDefProxy = awayAwayGoalsAgainst != null ? awayAwayGoalsAgainst : awayAvgConceded;
  if (awayDefProxy > 1.4) {
    codes.push('away_defense_weak_away');
  }

  // home_scoring_rate_strong
  const homeHomeGoalsFor = safeNum(fv.homeHomeGoalsFor, null);
  const homeAvgScored = safeNum(fv.homeAvgScored, 1.2);
  const homeScoringProxy = homeHomeGoalsFor != null ? homeHomeGoalsFor : homeAvgScored;
  if (homeScoringProxy > 1.5) {
    codes.push('home_scoring_rate_strong');
  }

  // away_failed_to_score_often
  const awayFailedRate = safeNum(fv.awayFailedToScoreRate, 0.35);
  if (awayFailedRate > 0.35) {
    codes.push('away_failed_to_score_often');
  }

  // btts_profile_high
  const h2hBtts = safeNum(fv.h2hBttsRate, null);
  const homeBtts = safeNum(fv.homeBttsRate, 0.45);
  const awayBtts = safeNum(fv.awayBttsRate, 0.45);
  const bothTeamsAvgScore = (homeAvgScored + safeNum(fv.awayAvgScored, 1.0)) / 2;
  if ((h2hBtts != null ? h2hBtts > 0.5 : (homeBtts + awayBtts) / 2 > 0.5) && bothTeamsAvgScore > 1.2) {
    codes.push('btts_profile_high');
  }

  // projected_home_control
  if (primary === 'dominant_home_pressure') {
    codes.push('projected_home_control');
  }

  // projected_open_game
  if (primary === 'open_end_to_end') {
    codes.push('projected_open_game');
  }

  // low_event_profile
  if (primary === 'tight_low_event') {
    codes.push('low_event_profile');
  }

  // high_volatility_warning
  const chaosScore = safeNum(fv.matchChaosScore, 0.5);
  if (chaosScore > 0.6) {
    codes.push('high_volatility_warning');
  }

  // away_strength_advantage
  if (awayBase - homeBase > 0.15) {
    codes.push('away_strength_advantage');
  }

  // strong_away_form
  const homePtsLast5 = safeNum(fv.homePointsLast5, null);
  const awayPtsLast5 = safeNum(fv.awayPointsLast5, null);
  if (homePtsLast5 != null && awayPtsLast5 != null && awayPtsLast5 > homePtsLast5 + 2) {
    codes.push('strong_away_form');
  }

  return codes;
}
