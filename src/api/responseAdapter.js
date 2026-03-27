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

// ── Risk / Edge label passthrough ─────────────────────────────────────────────
// riskLevel and edgeLabel are attached by selectBestPick — pass them through.
// Fallback for any cached picks that predate the new engine.
function resolveRiskLevel(pick) {
  if (pick?.riskLevel) return pick.riskLevel;
  // Heuristic fallback from probability + market key
  const prob = safeNum(pick?.modelProbability, 0);
  const mk   = (pick?.marketKey || '').toLowerCase();
  const isStable = ['under_35','under_25','double_chance_home','double_chance_away',
                    'home_under_15','away_under_15','dnb_home','dnb_away'].includes(mk);
  if (prob >= 0.72 && isStable) return 'SAFE';
  if (prob >= 0.65) return 'MODERATE';
  return 'AGGRESSIVE';
}

function resolveEdgeLabel(pick) {
  if (pick?.edgeLabel) return pick.edgeLabel;
  const prob = safeNum(pick?.modelProbability, 0);
  const risk = resolveRiskLevel(pick);
  if (prob >= 0.70) return risk === 'SAFE' ? 'STRONG EDGE (SAFE)' : 'STRONG EDGE (AGGRESSIVE)';
  if (prob >= 0.62) return 'LEAN';
  return 'NO EDGE';
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

// Direct lookup table for all internal marketKey values produced by buildMarketCandidates.
// The selection field from that module is already perfectly formatted, but we want team names
// substituted in for home/away references.
const PICK_LABEL_MAP = {
  home_win:             (h)    => `${h || "Home"} Win`,
  away_win:             (h, a) => `${a || "Away"} Win`,
  draw:                 ()     => "Draw",
  double_chance_home:   (h)    => `${h || "Home"} or Draw`,
  double_chance_away:   (h, a) => `${a || "Away"} or Draw`,
  over_15:              ()     => "Over 1.5 Goals",
  over_25:              ()     => "Over 2.5 Goals",
  over_35:              ()     => "Over 3.5 Goals",
  under_25:             ()     => "Under 2.5 Goals",
  under_35:             ()     => "Under 3.5 Goals",
  btts_yes:             ()     => "Both Teams to Score",
  btts_no:              ()     => "Both Teams NOT to Score",
  home_over_05:         (h)    => `${h || "Home"} Over 0.5 Goals`,
  home_over_15:         (h)    => `${h || "Home"} Over 1.5 Goals`,
  home_over_25:         (h)    => `${h || "Home"} Over 2.5 Goals`,
  home_under_15:        (h)    => `${h || "Home"} Under 1.5 Goals`,
  away_over_05:         (h, a) => `${a || "Away"} Over 0.5 Goals`,
  away_over_15:         (h, a) => `${a || "Away"} Over 1.5 Goals`,
  away_over_25:         (h, a) => `${a || "Away"} Over 2.5 Goals`,
  away_under_15:        (h, a) => `${a || "Away"} Under 1.5 Goals`,
  win_either_half_home: (h)    => `${h || "Home"} Win Either Half`,
  win_either_half_away: (h, a) => `${a || "Away"} Win Either Half`,
  dnb_home:             (h)    => `${h || "Home"} Win (DNB)`,
  dnb_away:             (h, a) => `${a || "Away"} Win (DNB)`,
};

function formatPickLabel(marketKey, selection, homeTeam, awayTeam) {
  if (!marketKey) return selection || "No Clear Edge";

  const key = (marketKey || "").toLowerCase().replace(/-/g, "_");

  // Primary path: use the direct lookup table (covers all buildMarketCandidates keys)
  if (PICK_LABEL_MAP[key]) {
    return PICK_LABEL_MAP[key](homeTeam, awayTeam);
  }

  // Secondary path: legacy/external market keys (over_under category, 1x2, etc.)
  const sel = (selection || "").toLowerCase().replace(/-/g, "_");

  if (key === "over_under" || key === "goals_ou") {
    if (sel.startsWith("over_")) {
      const val = sel.replace("over_", "").replace("_", ".");
      return `Over ${val} Goals`;
    }
    if (sel.startsWith("under_")) {
      const val = sel.replace("under_", "").replace("_", ".");
      return `Under ${val} Goals`;
    }
  }

  if (key === "1x2" || key === "match_winner") {
    if (sel === "home" || sel === "1") return `${homeTeam || "Home"} Win`;
    if (sel === "away" || sel === "2") return `${awayTeam || "Away"} Win`;
    if (sel === "draw" || sel === "x") return "Draw";
  }

  if (key === "double_chance") {
    if (sel === "1x" || sel === "home_draw") return `${homeTeam || "Home"} or Draw`;
    if (sel === "2x" || sel === "away_draw") return `${awayTeam || "Away"} or Draw`;
    if (sel === "12" || sel === "home_away") return "Home or Away Win";
  }

  if (key === "dnb" || key === "draw_no_bet") {
    if (sel === "home") return `${homeTeam || "Home"} Win (DNB)`;
    if (sel === "away") return `${awayTeam || "Away"} Win (DNB)`;
  }

  if (key === "asian_handicap" || key === "handicap") {
    if (sel.includes("home")) return `${homeTeam || "Home"} Handicap`;
    if (sel.includes("away")) return `${awayTeam || "Away"} Handicap`;
  }

  if (key === "win_either_half") {
    if (sel === "home") return `${homeTeam || "Home"} Win Either Half`;
    if (sel === "away") return `${awayTeam || "Away"} Win Either Half`;
  }

  // Fallback: use raw selection string (may already be human-readable)
  if (selection) {
    return selection.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Market name mapping ─────────────────────────────────────────────────────

function mapMarketName(marketKey) {
  const key = (marketKey || "").toLowerCase();
  // Over/Under markets
  if (key === "over_under" || key === "goals_ou") return "Over/Under";
  if (key === "over_15" || key === "over_25" || key === "over_35") return "Over/Under";
  if (key === "under_25" || key === "under_35") return "Over/Under";
  // BTTS
  if (key === "btts" || key === "btts_yes" || key === "btts_no" || key === "both_teams_to_score") return "Both Teams to Score";
  // Match result
  if (key === "1x2" || key === "match_winner" || key === "home_win" || key === "away_win" || key === "draw") return "Match Result";
  // Double Chance
  if (key === "double_chance" || key === "double_chance_home" || key === "double_chance_away") return "Double Chance";
  // Draw No Bet
  if (key === "dnb" || key === "draw_no_bet" || key === "dnb_home" || key === "dnb_away") return "Draw No Bet";
  // Asian Handicap
  if (key === "asian_handicap" || key === "handicap") return "Asian Handicap";
  // Team goals (home/away over/under)
  if (key.startsWith("home_over_") || key.startsWith("home_under_")) return "Home Team Goals";
  if (key.startsWith("away_over_") || key.startsWith("away_under_")) return "Away Team Goals";
  // Win Either Half
  if (key === "win_either_half_home" || key === "win_either_half_away") return "Win Either Half";
  return marketKey ? marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

// ── Build a candidate pick object (shared for recommendation + backups) ─────

// Team-total markets (home/away over/under) are niche — cap displayed probability at 93%
// to avoid misleading users with 95%+ confidence on low-liquidity markets.
const NICHE_MARKETS = new Set([
  'home_over_05', 'home_over_15', 'home_over_25', 'home_under_15',
  'away_over_05', 'away_over_15', 'away_over_25', 'away_under_15',
]);

function capProbabilityPct(marketKey, rawPct) {
  const key = (marketKey || '').toLowerCase();
  if (NICHE_MARKETS.has(key) && rawPct > 93) return 93.0;
  return rawPct;
}

function buildPickObject(pick, homeTeam, awayTeam, dataCompletenessScore) {
  if (!pick) return null;

  const probability = safeNum(pick.modelProbability, 0);
  // Use real betting edge (model prob - implied prob) when odds are available,
  // fall back to ranking score only when no odds data exists
  const edgeScore = pick.edge != null ? safeNum(pick.edge, 0) : safeNum(pick.finalScore, 0);
  const tacticalFitScore = safeNum(pick.tacticalFitScore, 0);
  const rawPct = parseFloat((probability * 100).toFixed(1));

  return {
    market: mapMarketName(pick.marketKey),
    pick: formatPickLabel(pick.marketKey, pick.selection, homeTeam, awayTeam),
    probability,
    probability_pct: capProbabilityPct(pick.marketKey, rawPct),
    edgeScore,
    modelConfidence: mapModelConfidence(probability, dataCompletenessScore),
    tacticalFit: mapTacticalFit(tacticalFitScore),
    valueRating: mapValueRating(edgeScore),
    riskLevel: resolveRiskLevel(pick),
    edgeLabel: resolveEdgeLabel(pick),
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
  // Derive tier from score if enrichmentTier is missing (old enrichment records lack it)
  const enrichmentTier = featureVector.enrichmentTier || (() => {
    const s = dataCompletenessScore;
    if (s >= 0.8) return 'rich';
    if (s >= 0.55) return 'good';
    if (s >= 0.35) return 'partial';
    return 'thin';
  })();

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

    const rawRecPct = parseFloat((probability * 100).toFixed(1));
    recommendation = {
      market: mapMarketName(bestPick.marketKey),
      pick: formatPickLabel(bestPick.marketKey, bestPick.selection, homeTeam, awayTeam),
      probability,
      probability_pct: capProbabilityPct(bestPick.marketKey, rawRecPct),
      edgeScore,
      modelConfidence: mapModelConfidence(probability, dataCompletenessScore),
      tacticalFit: mapTacticalFit(tacticalFitScore),
      valueRating: mapValueRating(edgeScore),
      riskLevel: resolveRiskLevel(bestPick),
      edgeLabel: resolveEdgeLabel(bestPick),
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
