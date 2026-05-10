/**
 * Modifies a base feature vector based on user-provided simulation sliders.
 * @param {Object} vector - The original feature vector for the match
 * @param {Object} modifiers - User adjustments { weather, lineupStrength }
 * @returns {Object} - The modified feature vector
 */
export function modifyFeatureVectorForSimulation(vector, modifiers) {
  if (!modifiers) return vector;

  const simVector = { ...vector };

  const mult = (field, factor) => {
    if (simVector[field] !== undefined && simVector[field] !== null) {
      simVector[field] *= factor;
    }
  };

  const homeMotivation = (simVector.homeMomentumScore || 50) / 100;
  const awayMotivation = (simVector.awayMomentumScore || 50) / 100;
  const hBoost = (homeMotivation - 0.5) * 0.15;
  mult('homeAttackRating', 1 + hBoost);
  mult('homeAvgScored', 1 + hBoost);
  mult('homeAvgXgFor', 1 + hBoost);
  mult('homeHomeGoalsFor', 1 + hBoost);
  mult('homeDefenseRating', 1 - hBoost);
  mult('homeAvgConceded', 1 - hBoost);
  mult('homeAvgXgAgainst', 1 - hBoost);
  mult('homeHomeGoalsAgainst', 1 - hBoost);

  const aBoost = (awayMotivation - 0.5) * 0.15;
  mult('awayAttackRating', 1 + aBoost);
  mult('awayAvgScored', 1 + aBoost);
  mult('awayAvgXgFor', 1 + aBoost);
  mult('awayAwayGoalsFor', 1 + aBoost);
  mult('awayDefenseRating', 1 - aBoost);
  mult('awayAvgConceded', 1 - aBoost);
  mult('awayAvgXgAgainst', 1 - aBoost);
  mult('awayAwayGoalsAgainst', 1 - aBoost);

  const hInjuries = simVector.homeKeyMissing || 0;
  if (hInjuries > 0) {
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

  // Weather modifiers also set the same context flags used by the production xG model.
  if (modifiers.weather === 'rain') {
    mult('homeAttackRating', 0.92);
    mult('awayAttackRating', 0.92);
    mult('homeAvgScored', 0.92);
    mult('awayAvgScored', 0.92);
    mult('homeHomeGoalsFor', 0.92);
    mult('awayAwayGoalsFor', 0.92);
    mult('matchChaosScore', 1.15);
    simVector.hasBadWeather = true;
    simVector.hasBadPitch = true;
    simVector.eventContext = { ...(simVector.eventContext || {}), weather: 'rain', pitch_condition: 'wet' };
  } else if (modifiers.weather === 'snow') {
    mult('homeAttackRating', 0.85);
    mult('awayAttackRating', 0.85);
    mult('homeAvgScored', 0.85);
    mult('awayAvgScored', 0.85);
    mult('homeHomeGoalsFor', 0.85);
    mult('awayAwayGoalsFor', 0.85);
    mult('matchChaosScore', 1.30);
    simVector.hasBadWeather = true;
    simVector.hasBadPitch = true;
    simVector.eventContext = { ...(simVector.eventContext || {}), weather: 'snow', pitch_condition: 'heavy' };
  } else {
    simVector.hasBadWeather = false;
  }

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
    simVector.homePredictedStrength = Math.min(simVector.homePredictedStrength ?? 1, 0.93);
    simVector.awayPredictedStrength = Math.min(simVector.awayPredictedStrength ?? 1, 0.93);
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
    simVector.homePredictedStrength = Math.min(simVector.homePredictedStrength ?? 1, 0.82);
    simVector.awayPredictedStrength = Math.min(simVector.awayPredictedStrength ?? 1, 0.82);
  }

  return simVector;
}
