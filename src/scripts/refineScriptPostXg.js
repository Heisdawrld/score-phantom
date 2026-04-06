export function refineScriptPostXg(script, xg) {
  const xgDiff = Math.abs(xg.homeExpectedGoals - xg.awayExpectedGoals);
  const isDominant = ["dominant_home_pressure","dominant_away_pressure"].includes(script.primary);
  if (isDominant && xgDiff < 0.5) { script.primary = "balanced_high_event"; script.secondary = null; script._refinedPostXg = true; }
  return script;
}
