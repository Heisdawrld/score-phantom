/**
 * adversarialChallenge.js — Deterministic self-challenge before publishing a pick.
 *
 * The engine challenges its own pick by scanning for failure-mode flags.
 * If enough flags stack, confidence is downgraded or the pick is flipped to SKIP.
 *
 * 12 flags: FATIGUE, LINEUP_RISK, SHARP_DISAGREE, NEGATIVE_CLV_HISTORY,
 * DERBY_CHAOS, H2H_COUNTER, KEY_ABSENCE, MOTIVATION_MISMATCH, TRAVEL_FATIGUE,
 * VOLATILITY_HIGH, REST_DIFFERENTIAL, UPSET_RISK.
 *
 * Recommendation: <0.20 PASS, 0.20-0.35 REVIEW, 0.35-0.50 DOWNGRADE, >0.50 FAIL
 */

import { safeNum, clamp } from '../utils/math.js';
import { computeSharpMoneySignal } from '../probabilities/sharpMoneySignal.js';
import { getClvConfidenceAdjustment } from '../storage/clvCalibration.js';

export function challengePick(pick, features, oddsComparison, clvCalibration) {
  const fv = features || {};
  const marketKey = pick?.marketKey || '';
  const flags = [];

  const pickSide = (() => {
    const k = String(marketKey).toLowerCase();
    if (k.includes('home') || k === 'double_chance_home' || k === 'dnb_home') return 'home';
    if (k.includes('away') || k === 'double_chance_away' || k === 'dnb_away') return 'away';
    return 'both';
  })();

  // 1. FATIGUE
  const homeFatigue = safeNum(fv.homeFatigue, 0);
  const awayFatigue = safeNum(fv.awayFatigue, 0);
  const relevantFatigue = pickSide === 'home' ? homeFatigue : pickSide === 'away' ? awayFatigue : Math.max(homeFatigue, awayFatigue);
  if (relevantFatigue >= 0.20) {
    flags.push({
      code: 'FATIGUE',
      severity: clamp(relevantFatigue * 0.6, 0.05, 0.20),
      reason: `${pickSide === 'both' ? 'Both teams' : pickSide.charAt(0).toUpperCase() + pickSide.slice(1) + ' team'} on heavy schedule (fatigue ${(relevantFatigue * 100).toFixed(0)}%)`,
      side: pickSide,
    });
  }

  // 2. LINEUP_RISK
  const hasLineupData = fv.hasLineupData || false;
  const lineupCertaintyScore = safeNum(fv.lineupCertaintyScore, null);
  if (!hasLineupData) {
    flags.push({ code: 'LINEUP_RISK', severity: 0.12, reason: 'No lineup data — team composition unknown', side: 'both' });
  } else if (lineupCertaintyScore != null && lineupCertaintyScore < 0.55) {
    flags.push({ code: 'LINEUP_RISK', severity: 0.10, reason: `Predicted lineup at low confidence (${(lineupCertaintyScore * 100).toFixed(0)}%)`, side: 'both' });
  }

  // 3. SHARP_DISAGREE
  if (oddsComparison && pick?.marketKey) {
    const sharpSignal = computeSharpMoneySignal(oddsComparison, pick);
    if (sharpSignal.alignment === 'contradicts') {
      const severity = sharpSignal.strength === 'strong' ? 0.20 : sharpSignal.strength === 'medium' ? 0.12 : 0.06;
      flags.push({ code: 'SHARP_DISAGREE', severity, reason: `Pinnacle ${sharpSignal.strength} drifting against this pick`, side: pickSide });
    }
  }

  // 4. NEGATIVE_CLV_HISTORY
  if (clvCalibration && marketKey) {
    const clvResult = getClvConfidenceAdjustment(marketKey, clvCalibration);
    if (clvResult.adjustment <= -0.04 && clvResult.clvStats) {
      flags.push({
        code: 'NEGATIVE_CLV_HISTORY',
        severity: clamp(Math.abs(clvResult.adjustment) * 1.5, 0.06, 0.18),
        reason: `Market avgCLV ${(clvResult.clvStats.avgClv * 100).toFixed(1)}pp over ${clvResult.clvStats.sampleSize} picks`,
        side: null,
      });
    }
  }

  // 5. DERBY_CHAOS
  const isLocalDerby = fv.isLocalDerby || false;
  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);
  if (isLocalDerby && matchChaosScore > 0.55) {
    flags.push({
      code: 'DERBY_CHAOS',
      severity: clamp((matchChaosScore - 0.55) * 0.4, 0.05, 0.15),
      reason: `Local derby with high chaos (${(matchChaosScore * 100).toFixed(0)}%) — form breaks down`,
      side: 'both',
    });
  }

  // 6. H2H_COUNTER
  const h2hFeatures = fv.h2hFeatures || {};
  if (h2hFeatures.counterPattern === true || h2hFeatures.contradictsForm === true) {
    flags.push({ code: 'H2H_COUNTER', severity: 0.14, reason: 'Historical H2H contradicts current form advantage', side: pickSide });
  }

  // 7. KEY_ABSENCE
  const homeAbsence = safeNum(fv.homeWeightedAbsenceScore, 0);
  const awayAbsence = safeNum(fv.awayWeightedAbsenceScore, 0);
  const relevantAbsence = pickSide === 'home' ? homeAbsence : pickSide === 'away' ? awayAbsence : Math.max(homeAbsence, awayAbsence);
  if (relevantAbsence >= 0.30) {
    flags.push({
      code: 'KEY_ABSENCE',
      severity: clamp(relevantAbsence * 0.5, 0.08, 0.20),
      reason: `Key player(s) unavailable (absence score ${(relevantAbsence * 100).toFixed(0)}%)`,
      side: pickSide,
    });
  }

  // 8. MOTIVATION_MISMATCH
  const homeMotivation = safeNum(fv.homeMotivationScore, 0.5);
  const awayMotivation = safeNum(fv.awayMotivationScore, 0.5);
  const motivationGap = homeMotivation - awayMotivation;
  if (pickSide === 'home' && motivationGap < -0.25) {
    flags.push({
      code: 'MOTIVATION_MISMATCH',
      severity: clamp(Math.abs(motivationGap) * 0.4, 0.06, 0.15),
      reason: `Away team more motivated (motivation gap ${(motivationGap * 100).toFixed(0)}pp)`,
      side: 'away',
    });
  } else if (pickSide === 'away' && motivationGap > 0.25) {
    flags.push({
      code: 'MOTIVATION_MISMATCH',
      severity: clamp(motivationGap * 0.4, 0.06, 0.15),
      reason: `Home team more motivated (motivation gap +${(motivationGap * 100).toFixed(0)}pp)`,
      side: 'home',
    });
  }

  // 9. TRAVEL_FATIGUE
  const travelDistanceKm = safeNum(fv.travelDistanceKm, 0);
  const awayDaysSinceLastMatch = safeNum(fv.awayDaysSinceLastMatch, null);
  if (pickSide === 'away' && travelDistanceKm > 1000 && awayDaysSinceLastMatch != null && awayDaysSinceLastMatch < 4) {
    flags.push({ code: 'TRAVEL_FATIGUE', severity: 0.10, reason: `Away team traveled ${travelDistanceKm}km with only ${awayDaysSinceLastMatch} days rest`, side: 'away' });
  }

  // 10. VOLATILITY_HIGH
  if (matchChaosScore >= 0.75) {
    flags.push({
      code: 'VOLATILITY_HIGH',
      severity: clamp((matchChaosScore - 0.75) * 0.6, 0.05, 0.15),
      reason: `Match volatility very high (${(matchChaosScore * 100).toFixed(0)}%) — form unreliable`,
      side: 'both',
    });
  }

  // 11. REST_DIFFERENTIAL
  const restDiffDays = safeNum(fv.restDiffDays, 0);
  if (pickSide === 'home' && restDiffDays < -2) {
    flags.push({ code: 'REST_DIFFERENTIAL', severity: clamp(Math.abs(restDiffDays) * 0.04, 0.04, 0.12), reason: `Home team has ${Math.abs(restDiffDays)} fewer rest days than away`, side: 'home' });
  } else if (pickSide === 'away' && restDiffDays > 2) {
    flags.push({ code: 'REST_DIFFERENTIAL', severity: clamp(restDiffDays * 0.04, 0.04, 0.12), reason: `Away team has ${restDiffDays} fewer rest days than home`, side: 'away' });
  }

  // 12. UPSET_RISK
  const upsetRiskScore = safeNum(fv.upsetRiskScore, 0.5);
  if (upsetRiskScore >= 0.70 && ['home_win', 'away_win', 'double_chance_home', 'double_chance_away'].includes(marketKey)) {
    flags.push({
      code: 'UPSET_RISK',
      severity: clamp((upsetRiskScore - 0.70) * 0.5, 0.05, 0.15),
      reason: `Upset risk elevated (${(upsetRiskScore * 100).toFixed(0)}%) — favorite may slip`,
      side: 'both',
    });
  }

  const totalSeverity = flags.reduce((sum, f) => sum + f.severity, 0);
  let recommendation;
  if (totalSeverity < 0.20) recommendation = 'PASS';
  else if (totalSeverity < 0.35) recommendation = 'REVIEW';
  else if (totalSeverity < 0.50) recommendation = 'DOWNGRADE';
  else recommendation = 'FAIL';

  const summary = flags.length === 0 ? 'No risk flags detected' : `${flags.length} risk flag${flags.length === 1 ? '' : 's'}: ${flags.map(f => f.code).join(', ')}`;

  return { flags, totalSeverity: parseFloat(totalSeverity.toFixed(3)), recommendation, summary };
}

export function applyChallengeResult(pick, confidence, challengeResult) {
  if (!challengeResult || !pick) return { downgraded: false, abstained: false };
  pick.challengeFlags = challengeResult.flags;
  pick.challengeSummary = challengeResult.summary;
  pick.challengeRecommendation = challengeResult.recommendation;
  if (challengeResult.recommendation === 'DOWNGRADE') {
    const currentModel = (confidence.model || 'LOW').toUpperCase();
    if (currentModel === 'HIGH') confidence.model = 'MEDIUM';
    else if (currentModel === 'MEDIUM') confidence.model = 'LEAN';
    else if (currentModel === 'LEAN') confidence.model = 'LOW';
    confidence.dataQualityNote = `Adversarial challenge: ${challengeResult.summary}`;
    return { downgraded: true, abstained: false };
  }
  if (challengeResult.recommendation === 'FAIL') {
    return { downgraded: false, abstained: true };
  }
  return { downgraded: false, abstained: false };
}
