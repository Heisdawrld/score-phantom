import { safeNum, clamp } from '../../utils/math.js';

/**
 * Computes homeControlScore and awayControlScore from:
 * - possession proxy (shots/total shots — approximated from scoring rate)
 * - defensive strength
 * - form momentum
 */
export function scoreControlModel(featureVector) {
  const fv = featureVector || {};

  // Possession proxy: derived from relative scoring rates and attack ratings
  const homeAttack = safeNum(fv.homeAttackRating, 0.7);
  const awayAttack = safeNum(fv.awayAttackRating, 0.7);
  const totalAttack = homeAttack + awayAttack || 1;

  // Possession proxy (0-1) based on relative attack
  const homePossessionProxy = clamp(homeAttack / totalAttack, 0.3, 0.7);
  const awayPossessionProxy = 1 - homePossessionProxy;

  // Defensive strength (higher = stronger defense = better control)
  const homeDefStr = clamp(safeNum(fv.homeDefenseRating, 0.9) / 2.5, 0, 1);
  const awayDefStr = clamp(safeNum(fv.awayDefenseRating, 0.9) / 2.5, 0, 1);

  // Form momentum (weighted points per match, normalized 0-1)
  const homeFormMomentum = clamp(safeNum(fv.homeWeightedPts, 1.2) / 3, 0, 1);
  const awayFormMomentum = clamp(safeNum(fv.awayWeightedPts, 1.0) / 3, 0, 1);

  // Home advantage bonus
  const homeAdvBonus = 0.05;

  // Control score = weighted combination
  const homeControlScore = clamp(
    homePossessionProxy * 0.40 +
    homeDefStr * 0.30 +
    homeFormMomentum * 0.25 +
    homeAdvBonus,
    0, 1
  );

  const awayControlScore = clamp(
    awayPossessionProxy * 0.40 +
    awayDefStr * 0.30 +
    awayFormMomentum * 0.25,
    0, 1
  );

  return {
    homeControlScore: parseFloat(homeControlScore.toFixed(3)),
    awayControlScore: parseFloat(awayControlScore.toFixed(3)),
  };
}
