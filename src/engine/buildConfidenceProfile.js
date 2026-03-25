import { safeNum } from '../utils/math.js';

/**
 * Build a confidence profile for the best pick.
 *
 * modelConfidence: high if modelProbability > 0.65, medium if > 0.52, low otherwise
 * valueConfidence: high if edge > 0.12, medium if > 0.06, low otherwise
 * volatility: low if matchChaosScore < 0.35, medium if < 0.6, high otherwise
 *
 * @param {object|null} bestPick
 * @param {object} featureVector
 * @returns {ConfidenceProfile}
 */
export function buildConfidenceProfile(bestPick, featureVector) {
  const fv = featureVector || {};
  const pick = bestPick || {};

  const modelProbability = safeNum(pick.modelProbability, 0);
  const edge = pick.edge != null ? safeNum(pick.edge, null) : null;
  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);

  // Model confidence
  let model;
  if (modelProbability > 0.65) model = 'high';
  else if (modelProbability > 0.52) model = 'medium';
  else model = 'low';

  // Value confidence
  let value;
  if (edge === null) {
    value = 'low'; // no odds data = can't assess value
  } else if (edge > 0.12) {
    value = 'high';
  } else if (edge > 0.06) {
    value = 'medium';
  } else {
    value = 'low';
  }

  // Volatility
  let volatility;
  if (matchChaosScore < 0.35) volatility = 'low';
  else if (matchChaosScore < 0.6) volatility = 'medium';
  else volatility = 'high';

  return { model, value, volatility };
}
