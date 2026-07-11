/**
 * Market Escalation / De-escalation Logic
 *
 * If a market at low odds (e.g., Over 2.5 at 1.32) has very high probability,
 * the analyst checks if the next tier up (Over 3.5) offers better value.
 * If the data supports it, they escalate — take more risk for better reward.
 *
 * Conversely, if Over 3.5 has only 38% probability but Over 2.5 has 62%,
 * de-escalate — take the safer line unless very confident.
 *
 * This is Phase 5 of the Intelligent Analyst Engine.
 */

import { safeNum, clamp } from '../utils/math.js';

/**
 * Escalation pairs: low-tier → high-tier market
 */
const ESCALATION_PAIRS = [
  { from: 'over_15',  to: 'over_25', minFromProb: 0.72, minToProb: 0.42, minToOdds: 1.55 },
  { from: 'over_25',  to: 'over_35', minFromProb: 0.68, minToProb: 0.38, minToOdds: 1.60 },
  { from: 'under_35', to: 'under_25', minFromProb: 0.76, minToProb: 0.50, minToOdds: 1.50 },
  { from: 'btts_no',  to: 'under_25', minFromProb: 0.72, minToProb: 0.48, minToOdds: 1.55 },
];

/**
 * Check if a candidate should be escalated to a higher-tier market.
 *
 * Escalation rules:
 * 1. Original market probability must be high (≥ minFromProb)
 * 2. Target market probability must be decent (≥ minToProb)
 * 3. Target market odds must be significantly better (≥ minToOdds)
 * 4. EV of target must be better than EV of original
 * 5. Narrative supports the escalation (high-event match)
 *
 * @param {object} candidate — the current top candidate
 * @param {object[]} allCandidates — all scored candidates
 * @param {object} narrative — match narrative
 * @returns {{ shouldEscalate: boolean, escalatedTo: object|null, reason: string|null }}
 */
export function checkMarketEscalation(candidate, allCandidates, narrative) {
  if (!candidate || !allCandidates) return { shouldEscalate: false, escalatedTo: null, reason: null };

  const marketKey = candidate.marketKey;
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);

  // Find the escalation pair for this market
  const pair = ESCALATION_PAIRS.find(p => p.from === marketKey);
  if (!pair) return { shouldEscalate: false, escalatedTo: null, reason: null };

  // Rule 1: Original market probability must be high enough
  if (prob < pair.minFromProb) {
    return { shouldEscalate: false, escalatedTo: null, reason: null };
  }

  // Find the target candidate
  const target = allCandidates.find(c => c.marketKey === pair.to);
  if (!target) return { shouldEscalate: false, escalatedTo: null, reason: 'Target market not available' };

  const targetProb = safeNum(target.modelProbability, 0);
  const targetOdds = safeNum(target.bookmakerOdds, 0);

  // Rule 2: Target probability must be decent
  if (targetProb < pair.minToProb) {
    return {
      shouldEscalate: false,
      escalatedTo: null,
      reason: `Target ${pair.to} prob ${(targetProb*100).toFixed(1)}% below ${(pair.minToProb*100).toFixed(0)}% threshold`,
    };
  }

  // Rule 3: Target odds must be significantly better
  if (targetOdds < pair.minToOdds || targetOdds <= 1.0) {
    return {
      shouldEscalate: false,
      escalatedTo: null,
      reason: `Target ${pair.to} odds ${targetOdds.toFixed(2)} below ${pair.minToOdds.toFixed(2)} threshold`,
    };
  }

  // Rule 4: EV comparison
  const originalEV = odds > 1.0 ? (prob * odds) - 1 : 0;
  const targetEV = targetOdds > 1.0 ? (targetProb * targetOdds) - 1 : 0;

  if (targetEV <= originalEV) {
    return {
      shouldEscalate: false,
      escalatedTo: null,
      reason: `Target EV ${(targetEV*100).toFixed(1)}% not better than original EV ${(originalEV*100).toFixed(1)}%`,
    };
  }

  // Rule 5: Narrative support
  const nar = narrative || {};
  const isEscalationToHigherGoals = pair.to.includes('over');
  const isEscalationToLowerGoals = pair.to.includes('under');

  let narrativeSupport = false;
  if (isEscalationToHigherGoals && (nar.goalExpectation === 'very_high' || nar.goalExpectation === 'high')) {
    narrativeSupport = true;
  } else if (isEscalationToLowerGoals && (nar.goalExpectation === 'low')) {
    narrativeSupport = true;
  } else if (nar.narrativeConfidence === 'high') {
    narrativeSupport = true; // High narrative confidence supports escalation
  }

  // Even without narrative support, if the EV difference is significant, escalate
  const evImprovement = targetEV - originalEV;
  if (evImprovement > 0.05) {
    narrativeSupport = true; // Strong EV improvement overrides narrative
  }

  if (!narrativeSupport) {
    return {
      shouldEscalate: false,
      escalatedTo: null,
      reason: 'Narrative does not support escalation — match profile too uncertain',
    };
  }

  return {
    shouldEscalate: true,
    escalatedTo: {
      ...target,
      escalatedFrom: marketKey,
      escalatedFromOdds: odds,
      escalatedFromProb: prob,
      escalationEVImprovement: parseFloat(evImprovement.toFixed(4)),
      escalationReason: `${marketKey} at ${odds.toFixed(2)} escalated to ${pair.to} at ${targetOdds.toFixed(2)} — EV ${(originalEV*100).toFixed(1)}% → ${(targetEV*100).toFixed(1)}%`,
    },
    reason: `Escalating ${marketKey} → ${pair.to}: better EV (${(originalEV*100).toFixed(1)}% → ${(targetEV*100).toFixed(1)}%), odds ${odds.toFixed(2)} → ${targetOdds.toFixed(2)}`,
  };
}

/**
 * Check if a candidate should be de-escalated to a lower-tier market.
 *
 * De-escalation rules:
 * 1. Original market probability is borderline (not high enough for confidence)
 * 2. Lower-tier market has significantly higher probability
 * 3. Lower-tier market has acceptable odds (still offers return)
 *
 * @param {object} candidate — the current top candidate
 * @param {object[]} allCandidates — all scored candidates
 * @param {object} narrative — match narrative
 * @returns {{ shouldDeEscalate: boolean, deEscalatedTo: object|null, reason: string|null }}
 */
export function checkMarketDeEscalation(candidate, allCandidates, narrative) {
  if (!candidate || !allCandidates) return { shouldDeEscalate: false, deEscalatedTo: null, reason: null };

  const marketKey = candidate.marketKey;
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);

  // Only de-escalate from higher-tier markets when probability is moderate
  if (prob >= 0.60) return { shouldDeEscalate: false, deEscalatedTo: null, reason: null };

  // Find de-escalation target (reverse of escalation pairs)
  const pair = ESCALATION_PAIRS.find(p => p.to === marketKey);
  if (!pair) return { shouldDeEscalate: false, deEscalatedTo: null, reason: null };

  // Find the lower-tier candidate
  const target = allCandidates.find(c => c.marketKey === pair.from);
  if (!target) return { shouldDeEscalate: false, deEscalatedTo: null, reason: null };

  const targetProb = safeNum(target.modelProbability, 0);
  const targetOdds = safeNum(target.bookmakerOdds, 0);

  // Lower-tier must have significantly higher probability
  if (targetProb < prob + 0.12) {
    return { shouldDeEscalate: false, deEscalatedTo: null, reason: 'Probability improvement too small' };
  }

  // Lower-tier must have acceptable odds
  if (targetOdds < 1.25 || targetOdds <= 1.0) {
    return { shouldDeEscalate: false, deEscalatedTo: null, reason: 'Target odds too low for de-escalation' };
  }

  // EV comparison — de-escalation should not destroy EV
  const originalEV = odds > 1.0 ? (prob * odds) - 1 : 0;
  const targetEV = targetOdds > 1.0 ? (targetProb * targetOdds) - 1 : 0;

  // Only de-escalate if target EV is not much worse
  if (targetEV < originalEV - 0.05) {
    return { shouldDeEscalate: false, deEscalatedTo: null, reason: 'Target EV too much worse' };
  }

  return {
    shouldDeEscalate: true,
    deEscalatedTo: {
      ...target,
      deEscalatedFrom: marketKey,
      deEscalatedFromOdds: odds,
      deEscalatedFromProb: prob,
      deEscalationReason: `${marketKey} at ${odds.toFixed(2)} de-escalated to ${pair.from} at ${targetOdds.toFixed(2)} — higher confidence`,
    },
    reason: `De-escalating ${marketKey} → ${pair.from}: better probability (${(prob*100).toFixed(1)}% → ${(targetProb*100).toFixed(1)}%)`,
  };
}

// ── Cross-market escalation ────────────────────────────────────────────────
// When a result/DC/DNB market is the top pick but offers poor value
// (low odds, volatile context), check if a goals/BTTS market offers
// better risk/reward. An experienced bettor thinks:
//   "Home Win is too risky here, but both teams attack → Over 2.5 is the smart play."

const CROSS_MARKET_ESCALATION = [
  // Result → Specific goals market
  { from: 'home_win', to: 'home_over_15', condition: 'dominant_side_goals',
    minFromProb: 0.50, minToProb: 0.55, minToOdds: 1.40 },
  { from: 'home_win', to: 'over_25', condition: 'high_event_script',
    minFromProb: 0.48, minToProb: 0.50, minToOdds: 1.50 },
  { from: 'away_win', to: 'away_over_15', condition: 'dominant_side_goals',
    minFromProb: 0.50, minToProb: 0.55, minToOdds: 1.40 },
  { from: 'away_win', to: 'over_25', condition: 'high_event_script',
    minFromProb: 0.48, minToProb: 0.50, minToOdds: 1.50 },
  // Result → BTTS (when both teams score profile is strong)
  { from: 'home_win', to: 'btts_yes', condition: 'btts_profile',
    minFromProb: 0.48, minToProb: 0.52, minToOdds: 1.50 },
  { from: 'away_win', to: 'btts_yes', condition: 'btts_profile',
    minFromProb: 0.48, minToProb: 0.52, minToOdds: 1.50 },
  // DC → Goals (DC is a safety blanket, look for value instead)
  { from: 'double_chance_home', to: 'over_25', condition: 'high_event_script',
    minFromProb: 0.60, minToProb: 0.50, minToOdds: 1.55 },
  { from: 'double_chance_home', to: 'btts_yes', condition: 'btts_profile',
    minFromProb: 0.60, minToProb: 0.52, minToOdds: 1.50 },
  { from: 'double_chance_away', to: 'over_25', condition: 'high_event_script',
    minFromProb: 0.60, minToProb: 0.50, minToOdds: 1.55 },
  { from: 'double_chance_away', to: 'btts_yes', condition: 'btts_profile',
    minFromProb: 0.60, minToProb: 0.52, minToOdds: 1.50 },
  // DNB → Specific goals (DNB is half-measure, goals are clearer)
  { from: 'dnb_home', to: 'home_over_15', condition: 'dominant_side_goals',
    minFromProb: 0.55, minToProb: 0.55, minToOdds: 1.40 },
  { from: 'dnb_away', to: 'away_over_15', condition: 'dominant_side_goals',
    minFromProb: 0.55, minToProb: 0.55, minToOdds: 1.40 },
];

/**
 * Check if a cross-market escalation condition is met.
 */
function checkCrossEscalationCondition(condition, narrative, script) {
  const nar = narrative || {};
  const sc = script || {};
  const scriptPrimary = sc.primary || '';

  switch (condition) {
    case 'high_event_script':
      return scriptPrimary === 'open_end_to_end' || scriptPrimary === 'balanced_high_event'
        || nar.goalExpectation === 'high' || nar.goalExpectation === 'very_high';

    case 'btts_profile':
      return (nar.styleProfile === 'both_attacking' || nar.bttsRate > 0.50)
        && (nar.goalExpectation === 'high' || nar.goalExpectation === 'very_high' || nar.goalExpectation === 'moderate');

    case 'dominant_side_goals':
      return nar.scriptAssessment === 'one_sided'
        || nar.qualityAssessment === 'home_clearly_better'
        || nar.qualityAssessment === 'away_clearly_better';

    default:
      return false;
  }
}

/**
 * Check if a candidate should be cross-escalated to a different market category.
 *
 * Cross-escalation triggers when:
 *   1. The current pick is a result/DC/DNB market
 *   2. The current pick offers poor odds-to-value ratio (odds too low for the risk)
 *   3. The narrative/script supports a goals/BTTS alternative
 *   4. The target market has better EV and adequate probability
 *
 * @param {object} candidate — the current top candidate
 * @param {object[]} allCandidates — all scored candidates
 * @param {object} narrative — match narrative
 * @param {object} script — script output
 * @returns {{ shouldEscalate: boolean, escalatedTo: object|null, reason: string|null }}
 */
export function checkCrossMarketEscalation(candidate, allCandidates, narrative, script) {
  if (!candidate || !allCandidates) return { shouldEscalate: false, escalatedTo: null, reason: null };

  const marketKey = candidate.marketKey;
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);

  // Find matching cross-market escalation pairs
  const pairs = CROSS_MARKET_ESCALATION.filter(p => p.from === marketKey);
  if (pairs.length === 0) return { shouldEscalate: false, escalatedTo: null, reason: null };

  // Check if current pick has poor value (low odds / low EV for the risk)
  const currentEV = odds > 1.0 ? (prob * odds) - 1 : 0;
  const isPoorValue = odds < 1.40 || (odds < 1.60 && currentEV < 0.03);
  if (!isPoorValue) {
    return { shouldEscalate: false, escalatedTo: null, reason: 'Current pick has acceptable value' };
  }

  // Evaluate each cross-market pair
  let bestEscalation = null;
  let bestEVImprovement = -Infinity;

  for (const pair of pairs) {
    // Check condition
    if (!checkCrossEscalationCondition(pair.condition, narrative, script)) continue;

    // Find target candidate
    const target = allCandidates.find(c => c.marketKey === pair.to);
    if (!target) continue;

    const targetProb = safeNum(target.modelProbability, 0);
    const targetOdds = safeNum(target.bookmakerOdds, 0);

    // Check thresholds
    if (prob < pair.minFromProb) continue;
    if (targetProb < pair.minToProb) continue;
    if (targetOdds < pair.minToOdds || targetOdds <= 1.0) continue;

    // EV comparison
    const targetEV = targetOdds > 1.0 ? (targetProb * targetOdds) - 1 : 0;
    if (targetEV <= currentEV) continue; // Target must have better EV

    const evImprovement = targetEV - currentEV;
    if (evImprovement > bestEVImprovement) {
      bestEVImprovement = evImprovement;
      bestEscalation = {
        pair,
        target,
        targetProb,
        targetOdds,
        targetEV,
        evImprovement,
      };
    }
  }

  if (!bestEscalation) {
    return { shouldEscalate: false, escalatedTo: null, reason: 'No cross-market target meets criteria' };
  }

  return {
    shouldEscalate: true,
    escalatedTo: {
      ...bestEscalation.target,
      escalatedFrom: marketKey,
      escalatedFromOdds: odds,
      escalatedFromProb: prob,
      escalationEVImprovement: parseFloat(bestEscalation.evImprovement.toFixed(4)),
      escalationType: 'cross_market',
      escalationCondition: bestEscalation.pair.condition,
      escalationReason: `${marketKey} at ${odds.toFixed(2)} cross-escalated to ${bestEscalation.pair.to} at ${bestEscalation.targetOdds.toFixed(2)} — EV ${(currentEV*100).toFixed(1)}% → ${(bestEscalation.targetEV*100).toFixed(1)}%`,
    },
    reason: `Cross-escalating ${marketKey} → ${bestEscalation.pair.to}: better value (${(currentEV*100).toFixed(1)}% → ${(bestEscalation.targetEV*100).toFixed(1)}% EV), condition=${bestEscalation.pair.condition}`,
  };
}

/**
 * Apply escalation bonus to scored candidates.
 * If narrative strongly supports high-event, boost Over 3.5 / BTTS Yes scoring.
 *
 * @param {object[]} scored — scored candidates (after scoreMarketCandidates)
 * @param {object} narrative — match narrative
 * @returns {object[]} scored candidates with escalation bonuses applied
 */
export function applyEscalationBonuses(scored, narrative) {
  if (!scored || !narrative) return scored;

  const nar = narrative;
  const isHighEvent = nar.goalExpectation === 'very_high' || nar.goalExpectation === 'high';
  const isLowEvent = nar.goalExpectation === 'low';
  const hasNarrativeConfidence = nar.narrativeConfidence === 'high';

  return scored.map(candidate => {
    let bonus = 0;
    const key = candidate.marketKey || '';

    // High-event narrative: boost Over 3.5 and higher-tier goal markets
    if (isHighEvent && hasNarrativeConfidence) {
      if (key === 'over_35') bonus += 0.08;
      else if (key === 'btts_yes') bonus += 0.05;
      else if (key === 'over_25') bonus += 0.03;
    }

    // Low-event narrative: boost Under markets
    if (isLowEvent && hasNarrativeConfidence) {
      if (key === 'under_25') bonus += 0.06;
      else if (key === 'under_35') bonus += 0.04;
      else if (key === 'btts_no') bonus += 0.04;
    }

    // Narrative-boosted markets get extra scoring
    if (nar.boostedMarkets && nar.boostedMarkets.includes(key)) {
      bonus += 0.04;
    }

    if (bonus > 0) {
      return {
        ...candidate,
        finalScore: parseFloat((candidate.finalScore + bonus).toFixed(4)),
        escalationBonus: parseFloat(bonus.toFixed(4)),
      };
    }

    return candidate;
  });
}
