/**
 * Response Format Adapter
 * 
 * Transforms new engine response format to match the old engine format
 * expected by the frontend rendering code.
 */

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

/**
 * Format a human-readable pick label from market + selection
 */
function formatPickLabel(marketKey, selection, homeTeam, awayTeam) {
  if (!marketKey) return selection || 'No Clear Edge';
  
  const key = (marketKey || '').toLowerCase();
  const sel = (selection || '').toLowerCase();

  // Over/Under
  if (key.includes('over') || key.includes('under')) {
    if (sel.includes('over')) return `Over ${sel.replace('over_', '').replace('over', '')} Goals`;
    if (sel.includes('under')) return `Under ${sel.replace('under_', '').replace('under', '')} Goals`;
  }

  // BTTS
  if (key.includes('btts')) {
    if (sel.includes('yes')) return 'Both Teams to Score';
    if (sel.includes('no')) return 'Both Teams NOT to Score';
  }

  // 1X2
  if (key.includes('home') && key.includes('win')) return `${homeTeam} Win`;
  if (key.includes('away') && key.includes('win')) return `${awayTeam} Win`;
  if (key.includes('draw')) return 'Draw';

  // Double Chance
  if (key.includes('double_chance')) {
    if (sel.includes('home') || sel.includes('draw')) return `${homeTeam} or Draw`;
    if (sel.includes('away') || sel.includes('draw')) return `${awayTeam} or Draw`;
  }

  // Fallback
  return selection || marketKey;
}

/**
 * Map confidence score (0-1) to label
 */
function mapConfidenceLabel(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.55) return 'moderate';
  if (score >= 0.35) return 'low';
  return 'very low';
}

/**
 * Derive match result probabilities from score matrix or expected goals
 * This is a simplified version - the new engine doesn't expose full score matrix
 */
function deriveMatchResultProbs(xg) {
  const homeXg = safeNum(xg.home, 1.2);
  const awayXg = safeNum(xg.away, 1.0);
  const total = homeXg + awayXg;

  // Simple heuristic based on xG difference
  const diff = homeXg - awayXg;
  
  let home, draw, away;
  
  if (diff > 0.8) {
    home = 0.50 + (diff * 0.08);
    draw = 0.25;
    away = 1 - home - draw;
  } else if (diff < -0.8) {
    away = 0.50 + (Math.abs(diff) * 0.08);
    draw = 0.25;
    home = 1 - away - draw;
  } else {
    // Close match
    draw = 0.28 + (0.05 * (1 - Math.abs(diff)));
    home = 0.36 + (diff * 0.1);
    away = 1 - home - draw;
  }

  return {
    home: parseFloat(Math.max(0.05, Math.min(0.85, home)).toFixed(4)),
    draw: parseFloat(Math.max(0.15, Math.min(0.40, draw)).toFixed(4)),
    away: parseFloat(Math.max(0.05, Math.min(0.85, away)).toFixed(4)),
  };
}

/**
 * Derive over/under probabilities from expected goals
 */
function deriveOverUnderProbs(xg) {
  const total = safeNum(xg.total, 2.5);

  // Simple Poisson-inspired heuristic
  const over25 = total > 2.5 ? 0.45 + ((total - 2.5) * 0.12) : 0.45 - ((2.5 - total) * 0.15);
  const over15 = total > 1.5 ? 0.65 + ((total - 1.5) * 0.08) : 0.65 - ((1.5 - total) * 0.20);
  const over35 = total > 3.5 ? 0.30 + ((total - 3.5) * 0.15) : 0.30 - ((3.5 - total) * 0.10);

  return {
    over_2_5: parseFloat(Math.max(0.15, Math.min(0.85, over25)).toFixed(4)),
    under_2_5: parseFloat(Math.max(0.15, Math.min(0.85, 1 - over25)).toFixed(4)),
    over_1_5: parseFloat(Math.max(0.35, Math.min(0.90, over15)).toFixed(4)),
    under_1_5: parseFloat(Math.max(0.10, Math.min(0.65, 1 - over15)).toFixed(4)),
    over_3_5: parseFloat(Math.max(0.10, Math.min(0.70, over35)).toFixed(4)),
    under_3_5: parseFloat(Math.max(0.30, Math.min(0.90, 1 - over35)).toFixed(4)),
  };
}

/**
 * Derive BTTS probabilities from expected goals
 */
function deriveBttsProbs(xg) {
  const homeXg = safeNum(xg.home, 1.2);
  const awayXg = safeNum(xg.away, 1.0);

  // Both teams likely to score if both xG > 1.0
  const bothAbove1 = homeXg > 1.0 && awayXg > 1.0;
  const avgXg = (homeXg + awayXg) / 2;

  let bttsYes;
  if (bothAbove1) {
    bttsYes = 0.50 + (Math.min(homeXg, awayXg) - 1.0) * 0.15;
  } else {
    bttsYes = 0.35 + (avgXg - 1.0) * 0.10;
  }

  return {
    yes: parseFloat(Math.max(0.20, Math.min(0.75, bttsYes)).toFixed(4)),
    no: parseFloat(Math.max(0.25, Math.min(0.80, 1 - bttsYes)).toFixed(4)),
  };
}

/**
 * Map script to goal expectation label
 */
function mapGoalExpectation(xg) {
  const total = safeNum(xg.total, 2.5);
  if (total >= 3.2) return 'high';
  if (total >= 2.5) return 'moderate';
  if (total >= 1.8) return 'low';
  return 'very low';
}

/**
 * Map script to risk level
 */
function mapRiskLevel(script, confidence) {
  const scriptPrimary = script.primary || '';
  const scriptConf = safeNum(script.confidence, 0.5);

  if (scriptPrimary === 'chaotic_unreliable' || scriptConf < 0.3) return 'extreme';
  if (scriptConf < 0.5) return 'high';
  if (scriptConf >= 0.75) return 'low';
  return 'moderate';
}

/**
 * Transform new engine response to old engine format
 * 
 * @param {object} newEngineResult - Result from runPredictionEngine
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {object} Old engine format
 */
export function adaptResponseFormat(newEngineResult, homeTeam, awayTeam) {
  const {
    fixtureId,
    script,
    expectedGoals,
    calibratedProbs,
    bestPick,
    backupPicks,
    noSafePick,
    noSafePickReason,
    confidence,
    reasonCodes,
    rankedMarkets,
  } = newEngineResult;

  // Build recommendation object
  let recommendation = null;
  if (bestPick && !noSafePick) {
    const pickLabel = formatPickLabel(bestPick.marketKey, bestPick.selection, homeTeam, awayTeam);
    const modelConf = mapConfidenceLabel(safeNum(confidence.model, 0.5));
    const valueConf = mapConfidenceLabel(safeNum(confidence.value, 0.5));
    const volatilityConf = mapConfidenceLabel(1 - safeNum(confidence.volatility, 0.5));

    recommendation = {
      pick: pickLabel,
      market: bestPick.marketKey || 'unknown',
      probability: safeNum(bestPick.modelProbability, 0),
      confidence: modelConf,
      confidence_detail: {
        model_confidence: modelConf,
        market_value: valueConf,
        match_volatility: volatilityConf,
      },
      reasons: reasonCodes || [],
      has_value: bestPick.edge && bestPick.edge > 0,
      edge: bestPick.edge ? parseFloat((bestPick.edge * 100).toFixed(1)) : null,
      is_value_bet: bestPick.edge && bestPick.edge > 0.05,
      value_edge: bestPick.edge || null,
    };
  } else {
    // No safe pick
    recommendation = {
      pick: 'No Clear Edge',
      market: 'No Edge',
      probability: 0,
      confidence: 'very low',
      confidence_detail: {
        model_confidence: 'very low',
        market_value: 'very low',
        match_volatility: 'high',
      },
      reasons: [noSafePickReason || 'Insufficient edge or data quality'],
      has_value: false,
      edge: null,
      is_value_bet: false,
      value_edge: null,
    };
  }

  // Use real Poisson-derived probabilities from the engine (calibrated)
  // Only fall back to heuristics if calibratedProbs is missing (e.g. engine error)
  const cp = calibratedProbs || {};
  const matchResult = cp.homeWin != null ? {
    home: safeNum(cp.homeWin, 0.35),
    draw: safeNum(cp.draw, 0.28),
    away: safeNum(cp.awayWin, 0.35),
  } : deriveMatchResultProbs(expectedGoals);

  const overUnder = cp.over25 != null ? {
    over_2_5: safeNum(cp.over25, 0.45),
    under_2_5: safeNum(cp.under25, 0.55),
    over_1_5: safeNum(cp.over15, 0.65),
    under_1_5: safeNum(cp.under15, 0.35),
    over_3_5: safeNum(cp.over35, 0.25),
    under_3_5: safeNum(cp.under35, 0.75),
  } : deriveOverUnderProbs(expectedGoals);

  const btts = cp.bttsYes != null ? {
    yes: safeNum(cp.bttsYes, 0.45),
    no: safeNum(cp.bttsNo, 0.55),
  } : deriveBttsProbs(expectedGoals);

  // Build rejected picks from backup picks
  const rejectedPicks = (backupPicks || []).slice(0, 3).map(bp => ({
    market: bp.marketKey || 'unknown',
    pick: formatPickLabel(bp.marketKey, bp.selection, homeTeam, awayTeam),
    probability: safeNum(bp.modelProbability, 0),
    score: safeNum(bp.finalScore, 0),
    confidence: mapConfidenceLabel(safeNum(bp.modelProbability, 0)),
    rationale: `Score: ${safeNum(bp.finalScore, 0).toFixed(3)}`,
  }));

  // Build match profile
  const goalExpectation = mapGoalExpectation(expectedGoals);
  const riskLevel = mapRiskLevel(script, confidence);

  return {
    fixture: {
      id: fixtureId,
      homeTeam,
      awayTeam,
    },
    model: {
      lambdaHome: safeNum(expectedGoals.home, 1.2),
      lambdaAway: safeNum(expectedGoals.away, 1.0),
      expectedTotalGoals: safeNum(expectedGoals.total, 2.5),
      h2hAdjusted: true, // New engine always uses h2h if available
      matchProfile: {
        script: script.primary || 'balanced',
        script_description: getScriptDescription(script.primary),
        openGame: script.primary === 'open_end_to_end',
        cageyGame: script.primary === 'tight_low_event',
        tightMatch: Math.abs(expectedGoals.home - expectedGoals.away) < 0.5,
        goalExpectation,
        riskLevel,
      },
      dataQuality: {
        homeFormMatches: 8, // New engine doesn't expose this, use reasonable default
        awayFormMatches: 8,
        h2hMatches: 5,
      },
    },
    predictions: {
      recommendation,
      rejected_picks: rejectedPicks,
      match_result: matchResult,
      over_under: overUnder,
      btts,
    },
  };
}

/**
 * Get script description
 */
function getScriptDescription(scriptPrimary) {
  const descriptions = {
    dominant_home_pressure: 'Home team expected to dominate possession and create chances',
    dominant_away_pressure: 'Away team expected to control the game',
    tight_low_event: 'Tight, cagey match with few clear chances',
    open_end_to_end: 'Open, attacking game with chances at both ends',
    balanced: 'Evenly matched teams with balanced play expected',
    chaotic_unreliable: 'Unpredictable match with high variance',
  };
  return descriptions[scriptPrimary] || 'Standard match dynamics expected';
}

