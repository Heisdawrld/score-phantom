import { normalizeFixture } from "../data/normalizeFixture.js";
import { buildFeatureVector } from "../features/buildFeatureVector.js";
import { flattenFeatureVector } from "../features/flattenFeatureVector.js";
import { classifyMatchScript } from "../scripts/archive/classifyMatchScript.js";
import { computeTacticalMatchup } from "../tactics/computeTacticalMatchup.js";

/**
 * Stage 1 — Prepare prediction context.
 * Normalises raw data, builds + flattens the feature vector, classifies the match script.
 * Returns everything downstream stages need.
 */
export async function preparePredictionContext(fixtureId, rawData) {
  const normalized = normalizeFixture(rawData);
  const homeTeamName = normalized.homeTeamName || rawData?.fixture?.home_team_name || "";
  const awayTeamName = normalized.awayTeamName || rawData?.fixture?.away_team_name || "";
  const odds = normalized.odds || rawData?.odds || null;
  const rawFeatures = await buildFeatureVector(fixtureId, homeTeamName, awayTeamName, odds);
  const features = flattenFeatureVector(rawFeatures);
  const tacticalMatchup = computeTacticalMatchup(features);
  features.tacticalMatchup = tacticalMatchup;
  const script = classifyMatchScript(features);
  return { fixtureId, homeTeamName, awayTeamName, odds, features, script, tacticalMatchup };
}
