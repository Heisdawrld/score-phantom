import { safeNum } from "../utils/math.js";
const MK = { home_win:"homeWin",away_win:"awayWin",draw:"draw",btts_yes:"bttsYes",over_25:"over25",under_25:"under25",over_15:"over15" };
const TRACKED = ["homeWin","awayWin","draw","bttsYes","over25","under25","over15"];
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
