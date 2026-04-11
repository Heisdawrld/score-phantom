import { safeNum } from '../utils/math.js';

export function assessMatchPredictability(features, script, calibratedProbs) {
  const fv = features || {};
  const sc = script || {};
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 1.0);
  const matchChaosScore  = safeNum(fv.matchChaosScore, 0.5);
  const upsetRiskScore   = safeNum(fv.upsetRiskScore, 0.5);
  const scriptConfidence = safeNum(sc.confidence, 0);
  const scriptPrimary    = sc.primary || '';
  const volatilityScore  = safeNum(sc.volatilityScore, 0.5);
  // 1. Low data completeness
  if (dataCompleteness < 0.35) {
    return { predictable: false, reason: 'Insufficient data completeness (' + (dataCompleteness*100).toFixed(0) + '% < 35% minimum)', code: 'LOW_DATA' };
  }
  // 2. Chaotic script with high confidence
  if (scriptPrimary === 'chaotic_unreliable' && scriptConfidence > 0.65) {
    return { predictable: false, reason: 'Match classified chaotic_unreliable with high confidence — no reliable pick possible', code: 'CHAOTIC_SCRIPT' };
  }
  // 3. Extreme chaos score
  if (matchChaosScore > 0.88) {
    return { predictable: false, reason: 'Chaos score too high (' + (matchChaosScore*100).toFixed(0) + '% > 88%) — match too volatile', code: 'HIGH_CHAOS' };
  }
  // 4. High upset risk + weak data
  if (upsetRiskScore > 0.75 && dataCompleteness < 0.55) {
    return { predictable: false, reason: 'High upset risk (' + (upsetRiskScore*100).toFixed(0) + '%) with weak data (' + (dataCompleteness*100).toFixed(0) + '%) — too uncertain', code: 'UPSET_RISK_WEAK_DATA' };
  }
  // 5. Contradictory 1X2 probabilities — all outcomes near-equal
  if (calibratedProbs) {
    const hw = safeNum(calibratedProbs.homeWin, 0.33);
    const aw = safeNum(calibratedProbs.awayWin, 0.33);
    const dr = safeNum(calibratedProbs.draw, 0.33);
    const maxP = Math.max(hw, aw, dr);
    const minP = Math.min(hw, aw, dr);
    if (maxP - minP < 0.08) {
      return { predictable: false, reason: '1X2 probs too close (spread ' + ((maxP-minP)*100).toFixed(1) + 'pp) — no dominant signal', code: 'CONTRADICTORY_SIGNALS' };
    }
  }
  // 6. Open end-to-end + high volatility
  if (scriptPrimary === 'open_end_to_end' && volatilityScore > 0.75 && scriptConfidence > 0.60) {
    return { predictable: false, reason: 'Open end-to-end script with high volatility — outcome too unpredictable', code: 'HIGH_VOLATILITY_SCRIPT' };
  }

  return { predictable: true };
}
