import { safeNum, clamp } from '../utils/math.js';

export function scoreControlModel(featureVector) {
  const fv = featureVector || {};

  const homeAttack = safeNum(fv.homeAttackRating, 0.7);
  const awayAttack = safeNum(fv.awayAttackRating, 0.7);
  const totalAttack = homeAttack + awayAttack || 1;

  const homePossessionProxy = clamp(homeAttack / totalAttack, 0.3, 0.7);
  const awayPossessionProxy = 1 - homePossessionProxy;

  const homeDefStr = clamp(safeNum(fv.homeDefenseRating, 0.9) / 2.5, 0, 1);
  const awayDefStr = clamp(safeNum(fv.awayDefenseRating, 0.9) / 2.5, 0, 1);

  const homeFormMomentum = clamp(safeNum(fv.homeWeightedPts, 1.2) / 3, 0, 1);
  const awayFormMomentum = clamp(safeNum(fv.awayWeightedPts, 1.0) / 3, 0, 1);

  const homeAdvBonus = 0.05;

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

