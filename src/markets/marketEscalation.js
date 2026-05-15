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
