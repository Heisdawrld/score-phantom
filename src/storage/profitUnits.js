/**
* Computes profit units for a given outcome.
* NOTE: The `decimalOdds` parameter should ideally be the actual matched odds
* from the prediction outcome (the odds the user got when the pick was made).
* Currently, callers may pass `best_pick_odds` from the prediction_outcomes table
* instead of the actual odds at the time of bet placement. These can differ when
* odds drift between prediction generation and bet placement.
* If the matched odds field is available (e.g. prediction_outcomes.best_pick_odds),
* it IS the actual matched odds — no discrepancy. The known discrepancy only applies
* if the caller passes stale bookmaker odds instead of the stored best_pick_odds.
*/
export function computeProfitUnits(resultStatus, decimalOdds, stakeUnits = 1) {
const stake = Number(stakeUnits);
if (!Number.isFinite(stake) || stake <= 0) return null;

const status = String(resultStatus || '').toLowerCase();
if (status === 'void') return 0;

const odds = Number(decimalOdds);
if (!Number.isFinite(odds) || odds <= 1) return null;

if (status === 'win') return Number(((odds - 1) * stake).toFixed(6));
if (status === 'loss') return Number((-1 * stake).toFixed(6));
return null;
}