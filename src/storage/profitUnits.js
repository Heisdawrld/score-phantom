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

