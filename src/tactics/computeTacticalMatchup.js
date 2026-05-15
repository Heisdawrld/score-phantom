/**
 * Unifies tactical intelligence from manager profiles, lineups, and match stats.
 * Provides a single source of truth for tactical reasoning across the engine and UI.
 */
export function computeTacticalMatchup(features) {
  const {
    homeManager,
    awayManager,
    homeAvgPossession = 50,
    awayAvgPossession = 50,
    homeMissingXgImpact = 0,
    awayMissingXgImpact = 0,
    enrichmentCompleteness = 0,
  } = features;

  // Initialize output shape
  const tactical = {
    homeStyleEdge: 0,
    awayStyleEdge: 0,
    transitionRisk: 'low',
    pressResistanceGap: 0,
    lineBreakRisk: 'low',
    tacticalConfidence: 'low',
    summary: 'Standard tactical matchup.',
  };

  // Build basic tactical profile even if managers are missing
  const homeControl = homeAvgPossession > 55;
  const awayControl = awayAvgPossession > 55;

  if (homeControl && awayControl) {
    tactical.transitionRisk = 'high';
    tactical.summary = 'Both teams prefer possession; likely a contested midfield battle.';
  } else if (homeControl && !awayControl) {
    tactical.homeStyleEdge += 1;
    tactical.summary = 'Home side likely to dictate tempo against away counter-attacks.';
  } else if (!homeControl && awayControl) {
    tactical.awayStyleEdge += 1;
    tactical.summary = 'Away side likely to control possession; home will rely on transitions.';
  }

  // Add manager specific insights if available
  let managerDataCount = 0;
  if (homeManager) {
    managerDataCount++;
    if (homeManager.preferred_formation?.includes('3-')) tactical.homeStyleEdge += 0.5; // Back 3 bonus
  }
  if (awayManager) {
    managerDataCount++;
    if (awayManager.preferred_formation?.includes('3-')) tactical.awayStyleEdge += 0.5;
  }

  // Adjust for injuries
  if (homeMissingXgImpact > 0.5) tactical.homeStyleEdge -= 1;
  if (awayMissingXgImpact > 0.5) tactical.awayStyleEdge -= 1;

  // Confidence scales with available data
  if (managerDataCount === 2 && enrichmentCompleteness > 0.8) {
    tactical.tacticalConfidence = 'high';
  } else if (managerDataCount >= 1 || enrichmentCompleteness > 0.5) {
    tactical.tacticalConfidence = 'medium';
  }

  return tactical;
}