import { safeNum } from '../utils/math.js';

/**
 * assessMatchPredictability
 *
 * This gate should only kill the whole fixture when the MATCH itself is unsafe.
 * Some uncertainty is market-specific. Example: if 1X2 is balanced, we should
 * block result markets, but still allow totals/BTTS/team-goals to compete.
 */
export function assessMatchPredictability(features, script, calibratedProbs) {
  const fv = features || {};
  const sc = script || {};
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 1.0);
  const matchChaosScore  = safeNum(fv.matchChaosScore, 0.5);
  const upsetRiskScore   = safeNum(fv.upsetRiskScore, 0.5);
  const scriptConfidence = safeNum(sc.confidence, 0);
  const scriptPrimary    = sc.primary || '';
  const volatilityScore  = safeNum(sc.volatilityScore, 0.5);
  const warnings = [];
  const restrictions = {
    blockMarketKeys: [],
    blockMarketTypes: [],
    notes: [],
  };

  // 1. Low data completeness — whole match is unsafe.
  if (dataCompleteness < 0.35) {
    return { predictable: false, reason: 'Insufficient data completeness (' + (dataCompleteness*100).toFixed(0) + '% < 35% minimum)', code: 'LOW_DATA' };
  }

  // 2. Strong chaotic classification — whole match is unsafe.
  if (scriptPrimary === 'chaotic_unreliable' && scriptConfidence > 0.65) {
    return { predictable: false, reason: 'Match classified chaotic_unreliable — no reliable pick possible', code: 'CHAOTIC_SCRIPT' };
  }

  // 3. Extreme chaos — whole match is unsafe.
  if (matchChaosScore > 0.88) {
    return { predictable: false, reason: 'Chaos score too high (' + (matchChaosScore*100).toFixed(0) + '% > 88%) — match too volatile', code: 'HIGH_CHAOS' };
  }

  // 4. High upset risk + weak data — whole match is unsafe.
  if (upsetRiskScore > 0.75 && dataCompleteness < 0.55) {
    return { predictable: false, reason: 'High upset risk (' + (upsetRiskScore*100).toFixed(0) + '%) with weak data (' + (dataCompleteness*100).toFixed(0) + '%) — too uncertain', code: 'UPSET_RISK_WEAK_DATA' };
  }

  // 5. Contradictory 1X2 probabilities — this is NOT always a whole-match kill.
  // It means match-result markets are unclear. Totals/BTTS may still carry value.
  if (calibratedProbs) {
    const hw = safeNum(calibratedProbs.homeWin, 0.33);
    const aw = safeNum(calibratedProbs.awayWin, 0.33);
    const dr = safeNum(calibratedProbs.draw, 0.33);
    const maxP = Math.max(hw, aw, dr);
    const minP = Math.min(hw, aw, dr);
    const spread = maxP - minP;
    if (spread < 0.08) {
      restrictions.blockMarketTypes.push('match_result');
      restrictions.blockMarketKeys.push(
        'home_win', 'away_win', 'draw',
        'double_chance_home', 'double_chance_away',
        'dnb_home', 'dnb_away'
      );
      restrictions.notes.push('1X2 probabilities too close — match-result markets blocked, totals/BTTS still allowed');
      warnings.push({
        code: 'BALANCED_1X2_MARKET_RESTRICTION',
        reason: '1X2 probs too close (spread ' + (spread*100).toFixed(1) + 'pp) — blocking match-result markets only',
      });
    }
  }

  // 6. Open end-to-end + high volatility — Phase 3A: DON'T kill the whole match.
  // Previously, this killed the entire match. But volatile matches are great for
  // Over/BTTS markets! Instead, block result markets and let goals markets compete.
  if (scriptPrimary === 'open_end_to_end' && volatilityScore > 0.75 && scriptConfidence > 0.60) {
    // Only kill if data is also weak — otherwise, restrict result markets
    if (dataCompleteness < 0.45) {
      return { predictable: false, reason: 'Open end-to-end with high volatility AND weak data — too unpredictable', code: 'HIGH_VOLATILITY_SCRIPT' };
    }
    // Volatile but decent data → block result markets, allow goals markets
    restrictions.blockMarketTypes.push('match_result');
    restrictions.blockMarketKeys.push('home_win', 'away_win', 'draw', 'double_chance_home', 'double_chance_away', 'dnb_home', 'dnb_away');
    restrictions.notes.push('Volatile open match — result markets blocked, goals/BTTS markets still allowed');
    warnings.push({
      code: 'VOLATILE_MATCH_RESULT_BLOCKED',
      reason: 'Volatile open match — blocking result markets, goals markets still in play',
    });
  }

  return { predictable: true, restrictions, warnings };
}
