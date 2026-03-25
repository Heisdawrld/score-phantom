/**
 * Human-readable descriptions for each reason code.
 */
const REASON_DESCRIPTIONS = {
  home_strength_gap_high: 'Home side carries a clear quality advantage',
  away_defense_weak_away: 'Away team defends poorly on the road',
  home_scoring_rate_strong: 'Home team scores consistently at their ground',
  away_failed_to_score_often: 'Away team struggles to find the net regularly',
  btts_profile_high: 'Both teams have a strong history of scoring in this fixture',
  projected_home_control: 'Projected script favors sustained home pressure and control',
  projected_open_game: 'Game projects as open with chances at both ends',
  low_event_profile: 'Match structure points toward a tight, low-scoring affair',
  high_volatility_warning: 'Match carries notable unpredictability — confidence adjusted',
  away_strength_advantage: 'Away team holds a measurable quality edge for this fixture',
  strong_away_form: 'Away team arrives in significantly stronger form',
};

/**
 * Convert reason codes to human-readable explanation lines,
 * and append a best-pick context line.
 *
 * @param {string[]} reasonCodes - from buildReasonCodes
 * @param {object|null} bestPick - the selected market pick
 * @returns {string[]} array of explanation lines
 */
export function buildExplanationPayload(reasonCodes, bestPick) {
  const lines = [];

  for (const code of (reasonCodes || [])) {
    const desc = REASON_DESCRIPTIONS[code];
    if (desc) {
      lines.push(desc);
    }
  }

  // Add best pick context line
  if (bestPick) {
    const probPct = bestPick.modelProbability != null
      ? (bestPick.modelProbability * 100).toFixed(1)
      : 'N/A';
    lines.push(
      `Best market fit: ${bestPick.marketKey} — Model probability ${probPct}%`
    );
  }

  return lines;
}
