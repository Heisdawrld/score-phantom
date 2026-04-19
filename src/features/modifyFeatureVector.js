/**
 * Modifies a base feature vector based on user-provided simulation sliders.
 * @param {Object} vector - The original feature vector for the match
 * @param {Object} modifiers - User adjustments { homeMotivation, awayMotivation, homeInjuries, awayInjuries, weather }
 * @returns {Object} - The modified feature vector
 */
export function modifyFeatureVectorForSimulation(vector, modifiers) {
  if (!modifiers) return vector;
  
  // Clone the vector to avoid mutating the original
  const simVector = { ...vector };

  // 1. Motivation Modifiers (-1, 0, 1 representing Low, Normal, High)
  if (modifiers.homeMotivation !== undefined) {
    const boost = modifiers.homeMotivation * 0.15; // +/- 15%
    simVector.home_offensive_strength *= (1 + boost);
    simVector.home_defensive_strength *= (1 - boost); // Lower number = stronger defense
    simVector.home_momentum *= (1 + boost);
  }
  
  if (modifiers.awayMotivation !== undefined) {
    const boost = modifiers.awayMotivation * 0.15; // +/- 15%
    simVector.away_offensive_strength *= (1 + boost);
    simVector.away_defensive_strength *= (1 - boost);
    simVector.away_momentum *= (1 + boost);
  }

  // 2. Injury Modifiers (0 to 5 scale)
  if (modifiers.homeInjuries !== undefined && modifiers.homeInjuries > 0) {
    // Each injury reduces offensive output by ~6% and worsens defense by ~6%
    const penalty = Math.min(modifiers.homeInjuries * 0.06, 0.4); 
    simVector.home_offensive_strength *= (1 - penalty);
    simVector.home_defensive_strength *= (1 + penalty); 
  }

  if (modifiers.awayInjuries !== undefined && modifiers.awayInjuries > 0) {
    const penalty = Math.min(modifiers.awayInjuries * 0.06, 0.4); 
    simVector.away_offensive_strength *= (1 - penalty);
    simVector.away_defensive_strength *= (1 + penalty); 
  }

  // 3. Weather Modifiers ('normal', 'rain', 'snow')
  // Extreme weather tends to suppress goal scoring and increase chaos (draw probability)
  if (modifiers.weather === 'rain') {
    simVector.home_offensive_strength *= 0.92;
    simVector.away_offensive_strength *= 0.92;
    simVector.expected_goals_variance = (simVector.expected_goals_variance || 1.0) * 1.15;
  } else if (modifiers.weather === 'snow') {
    simVector.home_offensive_strength *= 0.85;
    simVector.away_offensive_strength *= 0.85;
    simVector.expected_goals_variance = (simVector.expected_goals_variance || 1.0) * 1.30;
  }

  return simVector;
}
