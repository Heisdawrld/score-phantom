import { safeNum } from "../utils/math.js";
// BUG FIX: Added missing market→probability key mappings. The old map only covered 7 markets,
// causing Layer2 Override to silently fail (topShift=0) for DNB, Double Chance, Over/Under 3.5,
// Under 1.5, BTTS No, and Home/Away team goals markets.
const MK = {
  home_win:"homeWin", away_win:"awayWin", draw:"draw",
  btts_yes:"bttsYes", btts_no:"bttsNo",
  over_15:"over15", over_25:"over25", over_35:"over35",
  under_15:"under15", under_25:"under25", under_35:"under35",
  double_chance_home:"homeWinOrDraw", double_chance_away:"awayWinOrDraw",
  dnb_home:"homeWinDnb", dnb_away:"awayWinDnb",
  home_over_05:"homeOver05", home_over_15:"homeOver15", home_over_25:"homeOver25",
  home_under_15:"homeUnder15",
  away_over_05:"awayOver05", away_over_15:"awayOver15", away_over_25:"awayOver25",
  away_under_15:"awayUnder15",
  win_either_half_home:"homeWinEitherHalf", win_either_half_away:"awayWinEitherHalf",
};
const TRACKED = Object.values(MK);
export function computeLayer2Shifts(rawProbs, baseProbs) {
  const shiftMap = {}; let maxShift = 0, maxShiftMarket = null;
  for (const m of TRACKED) { const s = Math.abs((rawProbs[m]??0)-(baseProbs[m]??0)); shiftMap[m]=s; if(s>maxShift){maxShift=s;maxShiftMarket=m;} }
  return { shiftMap, maxShift, maxShiftMarket };
}
export function computeLayer2Override({ rankedCandidates, shiftMap, features }) {
  const top = rankedCandidates[0]??null, second = rankedCandidates[1]??null;
  const topProbKey = top ? (MK[top.marketKey]??null) : null;
  const topShift = topProbKey ? (shiftMap[topProbKey]??0) : 0;
  const scoreGap = (top&&second) ? safeNum(top.finalScore,0)-safeNum(second.finalScore,0) : 1;
  const dataOk = safeNum(features.dataCompletenessScore,0) >= 0.55;
  const override = dataOk && topShift>=0.06 && safeNum(top?.modelProbability,0)>=0.58 && safeNum(top?.tacticalFitScore,0)>=0.50 && scoreGap>=0.005;
  return { override, topProbKey, topShift, scoreGap, dataOk };
}
