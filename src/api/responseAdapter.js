/**
 * Response Format Adapter
 * 
 * Transforms SP2 engine output to match the SP1 React frontend's expected format.
 */

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ── Script name mapping: SP2 engine → SP1 frontend ──────────────────────────

const SCRIPT_MAP = {
  dominant_home_pressure: "dominant_home",
  dominant_away_pressure: "dominant_away",
  open_end_to_end: "open_end_to_end",
  tight_low_event: "tight_low_event",
  balanced: "balanced_high_event",
  chaotic_unreliable: "chaotic",
};

const SCRIPT_LABELS = {
  dominant_home: "Dominant Home Pressure",
  dominant_away: "Dominant Away Pressure",
  open_end_to_end: "Open End-to-End",
  tight_low_event: "Tight Low Event",
  balanced_high_event: "Balanced High Event",
  chaotic: "Chaotic",
};

const SCRIPT_DESCRIPTIONS = {
  dominant_home: "Home team expected to dominate possession and create chances",
  dominant_away: "Away team expected to control the game",
  open_end_to_end: "Open, attacking game with chances at both ends",
  tight_low_event: "Tight, cagey match with few clear chances",
  balanced_high_event: "Evenly matched teams with balanced play expected",
  chaotic: "Unpredictable match with high variance",
};

// ── Human-readable reason code labels ──────────────────────────────────────

const REASON_LABELS = {
  home_strength_gap_high: "Home team holds a significant quality advantage",
  away_defense_weak_away: "Away side concedes heavily away from home",
  home_scoring_rate_strong: "Home team is prolific in front of their own fans",
  away_failed_to_score_often: "Away team frequently fails to find the net",
  btts_profile_high: "Both teams carry a strong threat to score",
  projected_home_control: "Model projects home team to dominate the match",
  projected_open_game: "Model projects an open, end-to-end encounter",
  low_event_profile: "Model projects a tight, low-scoring battle",
  high_volatility_warning: "⚠️ High match volatility — result harder to predict",
  away_strength_advantage: "Away team holds a notable quality edge",
  strong_away_form: "Away team is in significantly better recent form",
  h2h_btts_rate_high: "Both teams have scored in the majority of recent head-to-head meetings",
  home_form_strong: "Home team is in excellent recent form",
  low_data_quality: "⚠️ Limited data available — confidence is reduced",
};

function humanizeReasonCode(code) {
  if (REASON_LABELS[code]) return REASON_LABELS[code];
  // Fallback: prettify raw code
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Confidence / Fit / Value mappings ────────────────────────────────────────

function mapModelConfidence(probability, dataCompletenessScore) {
  const p = safeNum(probability, 0);
  // Penalise confidence when data is sparse
  const dataQuality = safeNum(dataCompletenessScore, 0.5);
  const penalisedP = dataQuality < 0.35 ? p * 0.88 : dataQuality < 0.55 ? p * 0.94 : p;

  if (penalisedP >= 0.78) return "HIGH";
  if (penalisedP >= 0.65) return "MEDIUM";
  if (penalisedP >= 0.56) return "LEAN";
  return "LOW";
}

function mapTacticalFit(tacticalFitScore) {
  const s = safeNum(tacticalFitScore, 0);
  if (s >= 0.7) return "STRONG";
  if (s >= 0.4) return "MODERATE";
  return "WEAK";
}

function mapValueRating(edgeScore) {
  const s = safeNum(edgeScore, 0);
  if (s >= 0.72) return "STRONG";
  if (s >= 0.66) return "GOOD";
  if (s >= 0.60) return "FAIR";
  return "WEAK";
}

function mapVolatility(volatilityScore) {
  const v = safeNum(volatilityScore, 0);
  if (v >= 0.7) return "HIGH";
  if (v >= 0.4) return "MEDIUM";
  return "LOW";
}

// ── Pick label formatting ────────────────────────────────────────────────────

function formatPickLabel(marketKey, selection, homeTeam, awayTeam) {
  if (!marketKey) return selection || "No Clear Edge";

  const key = (marketKey || "").toLowerCase().replace(/-/g, "_");
  const sel = (selection || "").toLowerCase().replace(/-/g, "_");

  // Over/Under
  if (key === "over_under" || key === "goals_ou" || key.includes("over") || key.includes("under")) {
    if (sel.startsWith("over_")) {
      const val = sel.replace("over_", "").replace("_", ".");
      return `Over ${val} Goals`;
    }
    if (sel.startsWith("under_")) {
      const val = sel.replace("under_", "").replace("_", ".");
      return `Under ${val} Goals`;
    }
    if (sel.includes("over")) return "Over Goals";
    if (sel.includes("under")) return "Under Goals";
  }

  // BTTS
  if (key === "btts" || key === "both_teams_to_score") {
    if (sel === "yes" || sel === "btts_yes") return "Both Teams to Score";
    if (sel === "no" || sel === "btts_no") return "Both Teams NOT to Score";
  }

  // 1X2
  if (key === "1x2" || key === "match_winner") {
    if (sel === "home" || sel === "1") return `${homeTeam || "Home"} Win`;
    if (sel === "away" || sel === "2") return `${awayTeam || "Away"} Win`;
    if (sel === "draw" || sel === "x") return "Draw";
  }

  // Double Chance
  if (key === "double_chance") {
    if (sel === "1x" || sel === "home_draw") return `${homeTeam || "Home"} or Draw`;
    if (sel === "2x" || sel === "away_draw") return `${awayTeam || "Away"} or Draw`;
    if (sel === "12" || sel === "home_away") return "Home or Away Win";
  }

  // DNB
  if (key === "dnb" || key === "draw_no_bet") {
    if (sel === "home") return `${homeTeam || "Home"} Win (DNB)`;
    if (sel === "away") return `${awayTeam || "Away"} Win (DNB)`;
  }

  // Asian Handicap
  if (key === "asian_handicap" || key === "handicap") {
    if (sel.includes("home")) return `${homeTeam || "Home"} Handicap`;
    if (sel.includes("away")) return `${awayTeam || "Away"} Handicap`;
  }

  // Team goals
  if (key === "team_goals" || key === "home_goals" || key === "away_goals") {
    const side = key.includes("home") ? (homeTeam || "Home") : (awayTeam || "Away");
    if (sel.startsWith("over_")) return `${side} Over ${sel.replace("over_", "")} Goals`;
    if (sel.startsWith("under_")) return `${side} Under ${sel.replace("under_", "")} Goals`;
  }

  // Win either half
  if (key === "win_either_half") {
    if (sel === "home") return `${homeTeam || "Home"} Win Either Half`;
    if (sel === "away") return `${awayTeam || "Away"} Win Either Half`;
  }

  // Fallback: prettify raw selection
  if (selection) {
    return selection.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Market name mapping ─────────────────────────────────────────────────────

function mapMarketName(marketKey) {
  const key = (marketKey || "").toLowerCase();
  if (key === "over_under" || key === "goals_ou") return "Over/Under";
  if (key === "btts" || key === "both_teams_to_score") return "Both Teams to Score";
  if (key === "1x2" || key === "match_winner") return "Match Result";
  if (key === "double_chance") return "Double Chance";
  if (key === "dnb" || key === "draw_no_bet") return "Draw No Bet";
  if (key === "asian_handicap" || key === "handicap") return "Asian Handicap";
  return marketKey ? marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

// ── Build a candidate pick object (shared for recommendation + backups) ─────

function buildPickObject(pick, homeTeam, awayTeam, dataCompletenessScore) {
  if (!pick) return null;

  const probability = safeNum(pick.modelProbability, 0);
  // Use real betting edge (model prob - implied prob) when odds are available,
  // fall back to ranking score only when no odds data exists
  const edgeScore = pick.edge != null ? safeNum(pick.edge, 0) : safeNum(pick.finalScore, 0);
  const tacticalFitScore = safeNum(pick.tacticalFitScore, 0);

  return {
    market: mapMarketName(pick.marketKey),
    pick: formatPickLabel(pick.marketKey, pick.selection, homeTeam, awayTeam),
    probability,
    probability_pct: parseFloat((probability * 100).toFixed(1)),
    edgeScore,
    modelConfidence: mapModelConfidence(probability, dataCompletenessScore),
    tacticalFit: mapTacticalFit(tacticalFitScore),
    valueRating: mapValueRating(edgeScore),
    reasons: (pick.reasons || []).map(humanizeReasonCode),
    no_edge: !!(pick.edge != null && pick.edge <= 0),
  };
}

// ── Main adapter ─────────────────────────────────────────────────────────────

/**
 * Transform SP2 engine result to SP1 React frontend format.
 */
export function adaptResponseFormat(engineResult, homeTeam, awayTeam) {
  const {
    fixtureId,
    script = {},
    expectedGoals = {},
    calibratedProbs = {},
    bestPick,
    backupPicks = [],
    allCandidates = [],
    noSafePick,
    noSafePickReason,
    confidence = {},
    reasonCodes = [],
    rankedMarkets = [],
    features,
    dataQuality,
    correctScoreProbs,
  } = engineResult;

  // Data completeness — read from flat feature vector passed through engine result
  const featureVector = engineResult?.features || {};
  const dataCompletenessScore = safeNum(
    featureVector.dataCompletenessScore ??
    featureVector.enrichmentCompleteness ??
    engineResult?.volatilityFeatures?.dataCompletenessScore,
    0.5
  );
  const enrichmentTier = featureVector.enrichmentTier || null;

  // ── Game Script ──────────────────────────────────────────────────────────
  const sp2Script = script.primary || "balanced";
  const sp1Script = SCRIPT_MAP[sp2Script] || sp2Script;
  const volatilityScore = safeNum(script.volatilityScore, 0.5);

  const gameScript = {
    script: sp1Script,
    label: SCRIPT_LABELS[sp1Script] || sp1Script.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: SCRIPT_DESCRIPTIONS[sp1Script] || "Standard match dynamics expected",
    volatility: mapVolatility(volatilityScore),
    strengthGap: safeNum(script.strengthGap, 0),
    homeStrength: safeNum(script.homeStrength, 0),
    awayStrength: safeNum(script.awayStrength, 0),
  };

  // ── Model ────────────────────────────────────────────────────────────────
  const lambdaHome = safeNum(expectedGoals.home, 1.2);
  const lambdaAway = safeNum(expectedGoals.away, 1.0);
  const totalXg = safeNum(expectedGoals.total, lambdaHome + lambdaAway);

  const model = { lambdaHome, lambdaAway, totalXg };

  // ── Predictions: match_result (percentages 0-100) ────────────────────────
  const cp = calibratedProbs || {};
  const match_result = {
    home: parseFloat((safeNum(cp.homeWin, 0.35) * 100).toFixed(1)),
    draw: parseFloat((safeNum(cp.draw, 0.28) * 100).toFixed(1)),
    away: parseFloat((safeNum(cp.awayWin, 0.35) * 100).toFixed(1)),
  };

  // ── Predictions: over_under (decimals 0-1) ──────────────────────────────
  const over_under = {
    over_2_5: safeNum(cp.over25, 0.45),
    under_2_5: safeNum(cp.under25, 0.55),
    over_1_5: safeNum(cp.over15, 0.72),
    over_3_5: safeNum(cp.over35, 0.25),
  };

  // ── Predictions: btts (decimals 0-1) ────────────────────────────────────
  const btts = {
    yes: safeNum(cp.bttsYes, 0.45),
    no: safeNum(cp.bttsNo, 0.55),
  };

  // ── Human-readable reasons ───────────────────────────────────────────────
  const humanReasonCodes = (reasonCodes || []).map(humanizeReasonCode);

  // Add a data quality warning if completeness is low
  if (dataCompletenessScore < 0.4 && !humanReasonCodes.some(r => r.includes("Limited data"))) {
    humanReasonCodes.push("⚠️ Limited historical data — predictions carry higher uncertainty");
  }

  // ── Recommendation ──────────────────────────────────────────────────────
  let recommendation;
  if (bestPick && !noSafePick) {
    const probability = safeNum(bestPick.modelProbability, 0);
    const edgeScore = bestPick.edge != null ? safeNum(bestPick.edge, 0) : safeNum(bestPick.finalScore, 0);
    const tacticalFitScore = safeNum(bestPick.tacticalFitScore, 0);

    recommendation = {
      market: mapMarketName(bestPick.marketKey),
      pick: formatPickLabel(bestPick.marketKey, bestPick.selection, homeTeam, awayTeam),
      probability,
      probability_pct: parseFloat((probability * 100).toFixed(1)),
      edgeScore,
      modelConfidence: mapModelConfidence(probability, dataCompletenessScore),
      tacticalFit: mapTacticalFit(tacticalFitScore),
      valueRating: mapValueRating(edgeScore),
      reasons: humanReasonCodes,
      no_edge: false,
    };
  } else {
    recommendation = {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: 0,
      probability_pct: 0,
      edgeScore: 0,
      modelConfidence: "LOW",
      tacticalFit: "WEAK",
      valueRating: "WEAK",
      reasons: [noSafePickReason || "Insufficient edge or data quality"],
      no_edge: true,
    };
  }

  // ── Backup Picks ────────────────────────────────────────────────────────
  const backup_picks = (backupPicks || []).slice(0, 5)
    .map((bp) => buildPickObject(bp, homeTeam, awayTeam, dataCompletenessScore))
    .filter(Boolean);

  // ── All Candidates ──────────────────────────────────────────────────────
  const all_candidates = (allCandidates || rankedMarkets || []).slice(0, 10)
    .map((c) => buildPickObject(c, homeTeam, awayTeam, dataCompletenessScore))
    .filter(Boolean);

  // ── Correct Score ───────────────────────────────────────────────────────
  const correct_score = (correctScoreProbs || []).slice(0, 10).map((cs) => ({
    score: cs.score || `${cs.home}-${cs.away}`,
    probability: safeNum(cs.probability || cs.prob, 0),
  }));

  return {
    fixture: { id: fixtureId, homeTeam, awayTeam },
    model,
    gameScript,
    predictions: {
      match_result,
      over_under,
      btts,
      recommendation,
      backup_picks,
      all_candidates,
      correct_score,
    },
    features: featureVector,
    dataQuality: {
      completenessScore: dataCompletenessScore,
      tier: enrichmentTier,
      homeFormMatches: featureVector.homeMatchesAvailable ?? null,
      awayFormMatches: featureVector.awayMatchesAvailable ?? null,
    },
  };
}
