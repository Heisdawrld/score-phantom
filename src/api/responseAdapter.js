/**
 * Response Format Adapter
 * 
 * Transforms SP2 engine output to match the SP1 React frontend's expected format.
 */

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

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

const REASON_LABELS = {
  MODEL_ONLY_NO_ODDS:                 "Model-only pick — no bookmaker odds were available for this market",
  home_strength_gap_high:          "Home side maintains a dominant baseline quality advantage",
  away_strength_advantage:         "Away side projects superior baseline metrics",
  massive_table_gap:               "Significant structural disparity in league standings",
  home_form_strong:                "Home side executing at peak efficiency (last 5 games)",
  home_form_poor:                  "Home side exhibiting structural decline in recent fixtures",
  strong_away_form:                "Away side sustaining high-performance metrics on the road",
  away_form_poor:                  "Away side struggling with sustained performance drops",
  home_scoring_rate_strong:        "Home side generates high-probability chances consistently",
  strong_home_venue_record:        "Home venue advantage yields a high win-probability baseline",
  poor_away_venue_record:          "Away side historically underperforms expected metrics on the road",
  away_struggles_to_score_away:    "Away side struggles to convert expected goals (xG) away",
  away_defense_weak_away:          "Away side concedes high-quality chances in transition",
  home_defense_strong:             "Home side demonstrates elite defensive block stability",
  away_failed_to_score_often:      "Away side shows recurring offensive stagnation",
  home_failed_to_score_often:      "Home side struggles to penetrate low defensive blocks",
  h2h_btts_rate_high:              "Historical matchups show structural vulnerabilities for both sides",
  h2h_low_scoring_history:         "Historical matchups heavily favor defensive game scripts",
  h2h_high_scoring_history:        "Historical matchups produce volatile, high-event game scripts",
  h2h_historically_under:          "Matchup historically produces a low-variance event profile",
  btts_profile_high:               "Both sides exhibit high-variance offensive transitions",
  btts_profile_low:                "Both sides favor low-event, possession-heavy structures",
  both_teams_high_scoring_tendency:"Both sides consistently outperform baseline xG metrics",
  both_teams_low_scoring_tendency: "Both sides consistently underperform baseline xG metrics",
  projected_home_control:          "Model projects home side to monopolize possession and tempo",
  projected_away_control:          "Model projects away side to control spatial progression",
  projected_open_game:             "Model projects a highly volatile, transitional game state",
  low_event_profile:               "Model projects a cagey, low-event tactical stalemate",
  home_in_relegation_fight:        "Home side forced into aggressive script due to table pressure",
  away_in_relegation_fight:        "Away side forced into aggressive script due to table pressure",
  home_title_race_pressure:        "Home side requires maximal points for title progression",
  high_volatility_warning:         "⚠️ High match volatility — outcome variance is elevated",
  upset_risk_elevated:             "⚠️ Upset risk detected — structural vulnerabilities present",
  low_data_quality:                "⚠️ Limited data baseline — predictive confidence reduced",
  metadata_goals_trend:            "BSD pre-match facts point toward a goals-friendly matchup",
  metadata_scoring_warning:        "BSD pre-match facts flag a scoring concern",
  metadata_clean_sheet_signal:     "BSD pre-match facts support a clean-sheet angle",
  metadata_unbeaten_signal:        "BSD pre-match facts show an unbeaten/team-strength signal",
  metadata_derby_context:          "BSD metadata flags derby/rivalry context, increasing volatility",
};

function humanizeReasonCode(code) {
  if (REASON_LABELS[code]) return REASON_LABELS[code];
  return String(code || '').replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectBsdInsightReasons(fv = {}) {
  const reasons = [];
  const coreGap = safeNum(fv.corePlayerGap, 0);
  const hCore = safeNum(fv.homeCorePlayerScore, 0);
  const aCore = safeNum(fv.awayCorePlayerScore, 0);
  if (fv.hasDeepPlayerIntel && Math.abs(coreGap) >= 0.35) {
    if (coreGap > 0) reasons.push(`BSD player-career layer gives ${fv.homeTeam || 'home'} the stronger core-player impact (${hCore.toFixed(2)} vs ${aCore.toFixed(2)})`);
    else reasons.push(`BSD player-career layer gives ${fv.awayTeam || 'away'} the stronger core-player impact (${aCore.toFixed(2)} vs ${hCore.toFixed(2)})`);
  }

  const hRating = safeNum(fv.homeCoreAvgRating, null);
  const aRating = safeNum(fv.awayCoreAvgRating, null);
  if (hRating != null && aRating != null && Math.abs(hRating - aRating) >= 0.25) {
    if (hRating > aRating) reasons.push(`${fv.homeTeam || 'Home'} has the stronger average core-player rating from BSD career data`);
    else reasons.push(`${fv.awayTeam || 'Away'} has the stronger average core-player rating from BSD career data`);
  }

  const refChaos = safeNum(fv.refereeVolatilityChaos, null);
  const refStrict = safeNum(fv.refereeVolatilityStrictness, null);
  if (refChaos != null && refChaos >= 0.72) reasons.push(`BSD referee history indicates elevated chaos/card volatility (${Math.round(refChaos * 100)}%)`);
  else if (refStrict != null && refStrict >= 0.75) reasons.push(`BSD referee profile suggests a strict officiating style`);
  if (fv.refereeRedCardWarning) reasons.push(`BSD referee history flags above-normal red-card risk`);

  const codes = Array.isArray(fv.metadataReasonCodes) ? fv.metadataReasonCodes : [];
  for (const code of codes.slice(0, 3)) {
    reasons.push(humanizeReasonCode(code));
  }
  if (fv.hasMetadataPreview && safeNum(fv.metadataFactCount, 0) > 0) {
    reasons.push(`BSD match metadata adds ${fv.metadataFactCount} pre-match fact${fv.metadataFactCount === 1 ? '' : 's'} to the context layer`);
  }

  return [...new Set(reasons)].slice(0, 6);
}

function mapModelConfidence(probability, dataCompletenessScore) {
  const p = safeNum(probability, 0);
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

function resolveRiskLevel(pick, phantomScore) {
  const ps = phantomScore != null ? phantomScore : safeNum(pick?.modelProbability, 0);
  if (ps >= 0.72) return 'SAFE';
  if (ps >= 0.60) return 'MODERATE';
  return 'AGGRESSIVE';
}

function resolveEdgeLabel(pick, phantomScore) {
  if (pick?.modelOnly || pick?.isModelOnly) return 'MODEL-ONLY';
  const ps = phantomScore != null ? phantomScore : safeNum(pick?.modelProbability, 0);
  const risk = resolveRiskLevel(pick, phantomScore);
  if (ps >= 0.72) return risk === 'SAFE' ? 'STRONG EDGE' : 'PLAYABLE EDGE';
  if (ps >= 0.65) return 'MODERATE EDGE';
  if (ps >= 0.55) return 'LEAN';
  return 'NO EDGE';
}

/**
 * Frontend contract: ModelAdvisorBadge supports exactly FIRE/GAMBLE/AVOID.
 */
function computeAdvisorStatus(phantomScore, riskLevel, edgeScore) {
  const ps = safeNum(phantomScore, 0);
  const edge = safeNum(edgeScore, 0);
  if (ps >= 0.68 && riskLevel !== 'AGGRESSIVE') return 'FIRE';
  if (ps >= 0.63 && edge >= 0.04) return 'FIRE';
  if (ps >= 0.55) return 'GAMBLE';
  return 'AVOID';
}

function normalizeAdvisorStatus(status, phantomScore, riskLevel, edgeScore) {
  const s = String(status || '').toUpperCase();
  if (s === 'FIRE' || s === 'GAMBLE' || s === 'AVOID') return s;
  if (s === 'BET' || s === 'PLAYABLE') return 'FIRE';
  if (s === 'WATCH' || s === 'PASS') return 'GAMBLE';
  return computeAdvisorStatus(phantomScore, riskLevel, edgeScore);
}

function mapValueRating(edgeScore, modelOnly = false) {
  if (modelOnly) return "MODEL";
  const s = safeNum(edgeScore, 0);
  if (s >= 0.15) return "STRONG";
  if (s >= 0.08) return "GOOD";
  if (s >= 0.04) return "FAIR";
  return "WEAK";
}

function mapVolatility(volatilityScore) {
  const v = safeNum(volatilityScore, 0);
  if (v >= 0.7) return "HIGH";
  if (v >= 0.4) return "MEDIUM";
  return "LOW";
}

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
  if (PICK_LABEL_MAP[key]) return PICK_LABEL_MAP[key](homeTeam, awayTeam);
  const sel = (selection || "").toLowerCase().replace(/-/g, "_");
  if (key === "over_under" || key === "goals_ou") {
    if (sel.startsWith("over_")) return `Over ${sel.replace("over_", "").replace("_", ".")} Goals`;
    if (sel.startsWith("under_")) return `Under ${sel.replace("under_", "").replace("_", ".")} Goals`;
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
  if (selection) return selection.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapMarketName(marketKey) {
  const key = (marketKey || "").toLowerCase();
  if (key === "over_under" || key === "goals_ou") return "Over/Under";
  if (key === "over_15" || key === "over_25" || key === "over_35") return "Over/Under";
  if (key === "under_25" || key === "under_35") return "Over/Under";
  if (key === "btts" || key === "btts_yes" || key === "btts_no" || key === "both_teams_to_score") return "Both Teams to Score";
  if (key === "1x2" || key === "match_winner" || key === "home_win" || key === "away_win" || key === "draw") return "Match Result";
  if (key === "double_chance" || key === "double_chance_home" || key === "double_chance_away") return "Double Chance";
  if (key === "dnb" || key === "draw_no_bet" || key === "dnb_home" || key === "dnb_away") return "Draw No Bet";
  if (key === "asian_handicap" || key === "handicap") return "Asian Handicap";
  if (key.startsWith("home_over_") || key.startsWith("home_under_")) return "Home Team Goals";
  if (key.startsWith("away_over_") || key.startsWith("away_under_")) return "Away Team Goals";
  if (key === "win_either_half_home" || key === "win_either_half_away") return "Win Either Half";
  return marketKey ? marketKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

const NICHE_MARKETS = new Set([
  'home_over_05', 'home_over_15', 'home_over_25', 'home_under_15',
  'away_over_05', 'away_over_15', 'away_over_25', 'away_under_15',
]);
const DISPLAY_MAX_PROBABILITY_PCT = 87.0;

function capProbabilityPct(marketKey, rawPct) {
  const key = (marketKey || '').toLowerCase();
  if (rawPct > DISPLAY_MAX_PROBABILITY_PCT) return DISPLAY_MAX_PROBABILITY_PCT;
  if (NICHE_MARKETS.has(key) && rawPct > 93) return 93.0;
  return rawPct;
}

function buildPickObject(pick, homeTeam, awayTeam, dataCompletenessScore) {
  if (!pick) return null;
  const isModelOnly = !!(pick.modelOnly || pick.isModelOnly);
  const probability = safeNum(pick.modelProbability, 0);
  const edgeScore = isModelOnly ? 0 : (pick.edge != null ? safeNum(pick.edge, 0) : safeNum(pick.finalScore, 0));
  const tacticalFitScore = safeNum(pick.tacticalFitScore, 0);
  const rawProbPct = parseFloat((probability * 100).toFixed(1));
  const modelConf = mapModelConfidence(probability, dataCompletenessScore);
  const compositeRaw = safeNum(pick.finalScore, probability);
  const compositeScore = parseFloat((compositeRaw * 100).toFixed(1));
  const phantomScoreRaw = (probability * 0.55) + (compositeRaw * 0.45);
  const phantomScorePct = parseFloat((phantomScoreRaw * 100).toFixed(1));
  const riskLvl = resolveRiskLevel(pick, phantomScoreRaw);
  const edgeLbl = resolveEdgeLabel(pick, phantomScoreRaw);
  const advisorStatus = normalizeAdvisorStatus(pick.advisor_status, phantomScoreRaw, riskLvl, edgeScore);

  return {
    market: mapMarketName(pick.marketKey),
    pick: formatPickLabel(pick.marketKey, pick.selection, homeTeam, awayTeam),
    probability,
    probability_pct: rawProbPct,
    phantom_score_pct: phantomScorePct,
    score: compositeScore,
    edgeScore,
    modelConfidence: modelConf,
    tacticalFit: mapTacticalFit(tacticalFitScore),
    valueRating: mapValueRating(edgeScore, isModelOnly),
    riskLevel: riskLvl,
    edgeLabel: edgeLbl,
    reasons: (pick.reasons || []).map(humanizeReasonCode),
    advisor_status: advisorStatus,
    no_edge: !!(pick.edge != null && pick.edge <= 0),
    modelOnly: isModelOnly,
    isModelOnly,
    isSafeBet: !isModelOnly && phantomScorePct >= 72 && riskLvl === 'SAFE',
    isValueBet: !isModelOnly && edgeScore >= 0.05 && phantomScorePct >= 60,
    isSharpValue: !isModelOnly && (pick.isSharpValue || false),
  };
}

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
    reasonCodes = [],
    rankedMarkets = [],
    correctScoreProbs,
  } = engineResult;

  const featureVector = engineResult?.features || {};
  const dataCompletenessScore = safeNum(
    featureVector.dataCompletenessScore ??
    featureVector.enrichmentCompleteness ??
    engineResult?.volatilityFeatures?.dataCompletenessScore,
    0.5
  );
  const enrichmentTier = featureVector.enrichmentTier || (() => {
    const s = dataCompletenessScore;
    if (s >= 0.8) return 'rich';
    if (s >= 0.55) return 'good';
    if (s >= 0.35) return 'partial';
    return 'thin';
  })();

  const sp2Script = script.primary || "balanced";
  const sp1Script = SCRIPT_MAP[sp2Script] || sp2Script;
  const volatilityScore = safeNum(script.volatilityScore, 0.5);
  const fv = featureVector || {};
  const rawStrengthGap = safeNum(fv.homeStrengthGap, 0) - safeNum(fv.awayStrengthGap, 0);
  const gameScript = {
    script: sp1Script,
    label: SCRIPT_LABELS[sp1Script] || sp1Script.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: SCRIPT_DESCRIPTIONS[sp1Script] || "Standard match dynamics expected",
    volatility: mapVolatility(volatilityScore),
    strengthGap: parseFloat(rawStrengthGap.toFixed(3)),
    homeStrength: safeNum(fv.homeAttackRating01 ?? fv.homeAvgScored, 0),
    awayStrength: safeNum(fv.awayAttackRating01 ?? fv.awayAvgScored, 0),
  };

  const lambdaHome = safeNum(expectedGoals.home, 1.2);
  const lambdaAway = safeNum(expectedGoals.away, 1.0);
  const totalXg = safeNum(expectedGoals.total, lambdaHome + lambdaAway);
  const model = { lambdaHome, lambdaAway, totalXg };

  const cp = calibratedProbs || {};
  const match_result = {
    home: parseFloat((safeNum(cp.homeWin, 0.35) * 100).toFixed(1)),
    draw: parseFloat((safeNum(cp.draw, 0.28) * 100).toFixed(1)),
    away: parseFloat((safeNum(cp.awayWin, 0.35) * 100).toFixed(1)),
  };
  const over_under = {
    over_1_5: safeNum(cp.over15, 0.72),
    under_1_5: safeNum(cp.under15, 0.28),
    over_2_5: safeNum(cp.over25, 0.45),
    under_2_5: safeNum(cp.under25, 0.55),
    over_3_5: safeNum(cp.over35, 0.25),
    under_3_5: safeNum(cp.under35, 0.75),
  };
  const btts = {
    yes: safeNum(cp.bttsYes, 0.45),
    no: safeNum(cp.bttsNo, 0.55),
  };

  const humanReasonCodes = (reasonCodes || []).map(humanizeReasonCode);
  const bsdInsightReasons = collectBsdInsightReasons({ ...fv, homeTeam, awayTeam });
  for (const r of bsdInsightReasons) {
    if (!humanReasonCodes.includes(r)) humanReasonCodes.push(r);
  }
  if (dataCompletenessScore < 0.4 && !humanReasonCodes.some(r => r.includes("Limited data"))) {
    humanReasonCodes.push("⚠️ Limited historical data — predictions carry higher uncertainty");
  }

  let recommendation;
  if (bestPick && !noSafePick) {
    const isModelOnly = !!(bestPick.modelOnly || bestPick.isModelOnly);
    const probability = safeNum(bestPick.modelProbability, 0);
    const edgeScore = isModelOnly ? 0 : (bestPick.edge != null ? safeNum(bestPick.edge, 0) : safeNum(bestPick.finalScore, 0));
    const tacticalFitScore = safeNum(bestPick.tacticalFitScore, 0);
    const rawRecPct = parseFloat((probability * 100).toFixed(1));
    const modelConf = mapModelConfidence(probability, dataCompletenessScore);
    const compositeRaw = safeNum(bestPick.finalScore, probability);
    const compositeScore = parseFloat((compositeRaw * 100).toFixed(1));
    const phantomScoreRaw = (probability * 0.55) + (compositeRaw * 0.45);
    const phantomScorePct = capProbabilityPct(bestPick.marketKey, parseFloat((phantomScoreRaw * 100).toFixed(1)));
    const riskLvl2 = resolveRiskLevel(bestPick, phantomScoreRaw);
    const edgeLbl2 = resolveEdgeLabel(bestPick, phantomScoreRaw);
    const advisorStatus = normalizeAdvisorStatus(bestPick.advisor_status, phantomScoreRaw, riskLvl2, edgeScore);

    const reasons = isModelOnly
      ? ['Model-only pick — no bookmaker odds were available for this market', ...humanReasonCodes]
      : humanReasonCodes;

    recommendation = {
      market: mapMarketName(bestPick.marketKey),
      pick: formatPickLabel(bestPick.marketKey, bestPick.selection, homeTeam, awayTeam),
      probability,
      probability_pct: capProbabilityPct(bestPick.marketKey, rawRecPct),
      phantom_score_pct: phantomScorePct,
      score: compositeScore,
      edgeScore,
      modelConfidence: modelConf,
      tacticalFit: mapTacticalFit(tacticalFitScore),
      valueRating: mapValueRating(edgeScore, isModelOnly),
      riskLevel: riskLvl2,
      edgeLabel: edgeLbl2,
      reasons,
      advisor_status: advisorStatus,
      no_edge: false,
      modelOnly: isModelOnly,
      isModelOnly,
      isSafeBet: !isModelOnly && (bestPick.isSafeBet || false),
      isValueBet: !isModelOnly && (bestPick.isValueBet || false),
      isSharpValue: !isModelOnly && (bestPick.isSharpValue || false),
    };
  } else {
    recommendation = {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: 0,
      probability_pct: 0,
      phantom_score_pct: 0,
      score: 0,
      edgeScore: 0,
      modelConfidence: "LOW",
      tacticalFit: "WEAK",
      valueRating: "WEAK",
      reasons: [noSafePickReason || "Insufficient edge or data quality", ...humanReasonCodes.slice(0, 3)],
      advisor_status: "AVOID",
      no_edge: true,
    };
  }

  const backup_picks = (backupPicks || []).slice(0, 5)
    .map((bp) => buildPickObject(bp, homeTeam, awayTeam, dataCompletenessScore))
    .filter(Boolean);
  const all_candidates = (allCandidates || rankedMarkets || []).slice(0, 10)
    .map((c) => buildPickObject(c, homeTeam, awayTeam, dataCompletenessScore))
    .filter(Boolean);
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
