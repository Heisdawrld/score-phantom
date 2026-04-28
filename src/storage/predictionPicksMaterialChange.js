import { safeNum } from '../utils/math.js';

export function didHeadlinePickMateriallyChange(prevPick, nextPick) {
  if (!prevPick) return true;
  if (!nextPick) return false;

  const prevMarket = String(prevPick.market_key || '').toLowerCase();
  const nextMarket = String(nextPick.market_key || '').toLowerCase();
  if (prevMarket !== nextMarket) return true;

  const prevSel = String(prevPick.selection || '');
  const nextSel = String(nextPick.selection || '');
  if (prevSel !== nextSel) return true;

  const prevOdds = safeNum(prevPick.bookmaker_odds, 0);
  const nextOdds = safeNum(nextPick.bookmaker_odds, 0);
  if (prevOdds !== nextOdds) return true;

  return false;
}

