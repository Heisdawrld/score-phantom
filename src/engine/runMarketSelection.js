import { buildMarketCandidates } from "../markets/buildMarketCandidates.js";
import { computeImpliedProbabilities } from "../markets/computeImpliedProbabilities.js";
import { scoreMarketCandidates } from "../markets/scoreMarketCandidates.js";
import { applyMarketFilters } from "../markets/applyMarketFilters.js";
import { rankMarkets } from "../markets/rankMarkets.js";
import { computeLayer2Override } from "../markets/computeLayer2Override.js";
import { selectBestPick } from "./selectBestPick.js";
import { getRecentMarkets } from "../storage/marketTracking.js";

/**
 * Stage 3 — Market selection pipeline.
 * Builds candidates, scores them, filters, ranks, applies L2 override, selects best pick.
 */
export async function runMarketSelection({ calibratedProbs, odds, script, features, fixtureId, shiftMap, maxShift, maxShiftMarket }) {
  const candidates = buildMarketCandidates(calibratedProbs, odds);
  const candidatesWithEdge = computeImpliedProbabilities(candidates, odds);
  const recentMarkets = await getRecentMarkets(fixtureId, 24);
  const scored = scoreMarketCandidates(candidatesWithEdge, script, features, recentMarkets);
  const filtered = applyMarketFilters(scored);
  const ranked = rankMarkets(filtered);
  const { override: layer2Override, topProbKey } = computeLayer2Override({ rankedCandidates: ranked, shiftMap, features });
  const { bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied } =
    selectBestPick(ranked, script, features, { layer2Override, layer2ShiftMarket: maxShiftMarket, layer2ShiftPp: maxShift });
  return { bestPick, backupPicks, noSafePick, noSafePickReason, rankedCandidates: ranked, layer2Override, layer2OverrideApplied: layer2OverrideApplied ?? false, maxShift, maxShiftMarket, topProbKey };
}
