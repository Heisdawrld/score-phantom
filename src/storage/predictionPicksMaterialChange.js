import { safeNum } from '../utils/math.js';

function normalizeOdds(odds) {
  if (odds == null) return null;
  const n = safeNum(odds, NaN);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(4));
}

export function computePickMaterialSignature(pick) {
  const market = String(pick?.market_key || '').toLowerCase();
  const selection = String(pick?.selection || '');
  const odds = normalizeOdds(pick?.bookmaker_odds);
  return `${market}|${selection}|${odds == null ? 'null' : odds}`;
}

export function didHeadlinePickMateriallyChange(prevPick, nextPick) {
  if (!prevPick) return true;
  if (!nextPick) return false;

  const prevMarket = String(prevPick.market_key || '').toLowerCase();
  const nextMarket = String(nextPick.market_key || '').toLowerCase();
  if (prevMarket !== nextMarket) return true;

  const prevSel = String(prevPick.selection || '');
  const nextSel = String(nextPick.selection || '');
  if (prevSel !== nextSel) return true;

  const prevOdds = normalizeOdds(prevPick.bookmaker_odds);
  const nextOdds = normalizeOdds(nextPick.bookmaker_odds);
  if (prevOdds !== nextOdds) return true;

  return false;
}
