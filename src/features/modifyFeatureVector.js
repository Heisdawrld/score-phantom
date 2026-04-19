/**
 * Modifies a base feature vector based on user-provided simulation sliders.
 * @param {Object} vector - The original feature vector for the match
 * @param {Object} modifiers - User adjustments { weather, lineupStrength }
 * @returns {Object} - The modified feature vector
 */
export function modifyFeatureVectorForSimulation(vector, modifiers) {
  if (!modifiers) return vector;

  // Clone the vector to avoid mutating the original
  const simVector = { ...vector };

  // Helper to safely multiply a field if it exists
  const mult = (field, factor) => {
    if (simVector[field] !== undefined && simVector[field] !== null) {
      simVector[field] *= factor;
    }
  };

  // 1. Motivation Modifiers (Auto-calculated from feature vector)
  // Derive motivation from recent form momentum and upset risk
  const homeMotivation = (simVector.homeMomentumScore || 50) / 100;
  const awayMotivation = (simVector.awayMomentumScore || 50) / 100;
  
  const hBoost = (homeMotivation - 0.5) * 0.15; // +/- 15%
  mult('homeAttackRating', 1 + hBoost);
  mult('homeAvgScored', 1 + hBoost);
  mult('homeAvgXgFor', 1 + hBoost);
  mult('homeHomeGoalsFor', 1 + hBoost);
  mult('homeDefenseRating', 1 - hBoost); // Lower number = stronger defense
  mult('homeAvgConceded', 1 - hBoost);
  mult('homeAvgXgAgainst', 1 - hBoost);
  mult('homeHomeGoalsAgainst', 1 - hBoost);

  const aBoost = (awayMotivation - 0.5) * 0.15; // +/- 15%
  mult('awayAttackRating', 1 + aBoost);
  mult('awayAvgScored', 1 + aBoost);
  mult('awayAvgXgFor', 1 + aBoost);
  mult('awayAwayGoalsFor', 1 + aBoost);
  mult('awayDefenseRating', 1 - aBoost);
  mult('awayAvgConceded', 1 - aBoost);
  mult('awayAvgXgAgainst', 1 - aBoost);
  mult('awayAwayGoalsAgainst', 1 - aBoost);

  // 2. Injury Modifiers (Auto-calculated from feature vector's Key Absences)
  const hInjuries = simVector.homeKeyMissing || 0;
  if (hInjuries > 0) {
    // Each key injury reduces offensive output by ~6% and worsens defense by ~6%
    const penalty = Math.min(hInjuries * 0.06, 0.4);
    mult('homeAttackRating', 1 - penalty);
    mult('homeAvgScored', 1 - penalty);
    mult('homeAvgXgFor', 1 - penalty);
    mult('homeHomeGoalsFor', 1 - penalty);
    mult('homeDefenseRating', 1 + penalty);
    mult('homeAvgConceded', 1 + penalty);
    mult('homeAvgXgAgainst', 1 + penalty);
    mult('homeHomeGoalsAgainst', 1 + penalty);
  }

  const aInjuries = simVector.awayKeyMissing || 0;
  if (aInjuries > 0) {
    const penalty = Math.min(aInjuries * 0.06, 0.4);
    mult('awayAttackRating', 1 - penalty);
    mult('awayAvgScored', 1 - penalty);
    mult('awayAvgXgFor', 1 - penalty);
    mult('awayAwayGoalsFor', 1 - penalty);
    mult('awayDefenseRating', 1 + penalty);
    mult('awayAvgConceded', 1 + penalty);
    mult('awayAvgXgAgainst', 1 + penalty);
    mult('awayAwayGoalsAgainst', 1 + penalty);
  }

  // 3. Weather Modifiers ('normal', 'rain', 'snow')
  // Extreme weather tends to suppress goal scoring and increase chaos (draw probability)
  if (modifiers.weather === 'rain') {
    mult('homeAttackRating', 0.92);
    mult('awayAttackRating', 0.92);
    mult('homeAvgScored', 0.92);
    mult('awayAvgScored', 0.92);
    mult('homeHomeGoalsFor', 0.92);
    mult('awayAwayGoalsFor', 0.92);
    mult('matchChaosScore', 1.15);
  } else if (modifiers.weather === 'snow') {
    mult('homeAttackRating', 0.85);
    mult('awayAttackRating', 0.85);
    mult('homeAvgScored', 0.85);
    mult('awayAvgScored', 0.85);
    mult('homeHomeGoalsFor', 0.85);
    mult('awayAwayGoalsFor', 0.85);
    mult('matchChaosScore', 1.30);
  }

  // 4. Lineup Strength / Rotation Risk
  if (modifiers.lineupStrength === 'rotated') {
    mult('homeAttackRating', 0.90);
    mult('homeDefenseRating', 1.10);
    mult('awayAttackRating', 0.90);
    mult('awayDefenseRating', 1.10);
    
    mult('homeAvgScored', 0.90);
    mult('awayAvgScored', 0.90);
    mult('homeHomeGoalsFor', 0.90);
    mult('awayAwayGoalsFor', 0.90);
    
    simVector.rotationRiskHome = 0.5;
    simVector.rotationRiskAway = 0.5;
  } else if (modifiers.lineupStrength === 'heavily_rotated') {
    mult('homeAttackRating', 0.75);
    mult('homeDefenseRating', 1.25);
    mult('awayAttackRating', 0.75);
    mult('awayDefenseRating', 1.25);
    
    mult('homeAvgScored', 0.75);
    mult('awayAvgScored', 0.75);
    mult('homeHomeGoalsFor', 0.75);
    mult('awayAwayGoalsFor', 0.75);
    
    simVector.rotationRiskHome = 0.9;
    simVector.rotationRiskAway = 0.9;
  }

  return simVector;
}
