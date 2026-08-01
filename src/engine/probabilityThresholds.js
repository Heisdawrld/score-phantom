// Half of one displayed tenth of a percentage point. Values that render as the
// floor (for example 72.0% vs 72%) must not be rejected by floating-point noise.
export const PROBABILITY_FLOOR_EPSILON = 0.0005;

export function isBelowProbabilityFloor(probability, floor) {
  return Number(probability) + PROBABILITY_FLOOR_EPSILON < Number(floor);
}
