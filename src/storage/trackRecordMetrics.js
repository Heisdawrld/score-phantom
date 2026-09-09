// Use the same settled, priced population for both sides of every ROI ratio.
// Voids return the stake; they are disclosed separately, not counted as turnover.
export const ROI_ELIGIBLE_SQL = `(
  outcome IN ('win', 'correct', 'loss', 'wrong')
  AND best_pick_odds > 1 AND stake_units > 0 AND profit_units IS NOT NULL
)`;

export const ROI_AGGREGATES_SQL = `
  SUM(CASE WHEN ${ROI_ELIGIBLE_SQL} THEN 1 ELSE 0 END) AS roi_total,
  SUM(CASE WHEN ${ROI_ELIGIBLE_SQL} THEN stake_units ELSE 0 END) AS roi_staked,
  SUM(CASE WHEN ${ROI_ELIGIBLE_SQL} THEN profit_units ELSE 0 END) AS roi_profit
`;

export function readRoiMetrics(row = {}) {
  const roiPicks = Number(row.roi_total || 0);
  const staked = Number(row.roi_staked || 0);
  const profit = Number(row.roi_profit || 0);
  const available = roiPicks > 0 && staked > 0 && Number.isFinite(staked) && Number.isFinite(profit);
  return {
    roiPicks,
    staked: available ? staked : null,
    profit: available ? profit : null,
    roi: available ? profit / staked : null,
  };
}
