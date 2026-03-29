/**
 * buildAcca.js
 *
 * Intelligent ACCA construction engine.
 * Builds low-correlation, controlled-risk accumulators — NOT a simple probability stack.
 *
 * Two modes:
 *   SAFE  — 3 picks, all >= 75%, low volatility only, stable markets only
 *   VALUE — 4–5 picks, >= 70%, allows 1 MODERATE risk pick
 */

// ── Market rules ──────────────────────────────────────────────────────────────

/** Markets always allowed in ACCA — stable, low-variance outcomes. */
const ALWAYS_ALLOWED = new Set([
  'under_35',
  'under_25',
  'home_under_15',
  'away_under_15',
  'double_chance_home',
  'double_chance_away',
  'dnb_home',
  'dnb_away',
]);

/** Markets blocked regardless of probability. */
const BLOCKED_MARKETS = new Set([
  'over_35',
  'over_05',
  'home_over_05',
  'away_over_05',
  'under_45',
  'draw',          // draws are high-variance, kill accas
]);

/**
 * Determine if a market is eligible for ACCA inclusion.
 *
 * @param {string} marketKey
 * @param {string} volatility  - 'low' | 'medium' | 'high'
 * @param {number} probability - 0–1
 * @returns {boolean}
 */
function isAccaEligibleMarket(marketKey, volatility, probability) {
  const mk = (marketKey || '').toLowerCase();

  if (BLOCKED_MARKETS.has(mk)) return false;
  if (ALWAYS_ALLOWED.has(mk)) return true;

  // Home/Away win — only if very high probability (dominant game)
  if (mk === 'home_win' || mk === 'away_win') return probability >= 0.72;

  // BTTS — only high probability AND low volatility
  if (mk === 'btts_yes') return probability >= 0.75 && volatility === 'low';

  // Over 2.5 — allowed unless high volatility
  if (mk === 'over_25') return volatility !== 'high';

  // Home/Away over 1.5 — allowed if low/medium volatility
  if (mk === 'home_over_15' || mk === 'away_over_15') return volatility !== 'high' && probability >= 0.68;

  // Home/Away over 2.5 — strict, high prob required
  if (mk === 'home_over_25' || mk === 'away_over_25') return probability >= 0.72 && volatility === 'low';

  // Anything else: allow if high probability
  return probability >= 0.75;
}

// ── Script pattern categorization ────────────────────────────────────────────

/**
 * Group match scripts into three diversity buckets.
 * We want max 2 of the same bucket in one ACCA.
 */
function categorizeScript(scriptPrimary) {
  const s = (scriptPrimary || '').toLowerCase();
  if (s.includes('dominant')) return 'dominance';
  if (s.includes('tight') || s.includes('low') || s.includes('defensive')) return 'low_scoring';
  if (s.includes('open') || s.includes('high') || s.includes('balanced')) return 'high_event';
  return 'neutral';
}

// ── Data quality weight ───────────────────────────────────────────────────────

function dataQualityWeight(dataQuality, enrichmentStatus) {
  if (enrichmentStatus === 'deep') {
    if (dataQuality === 'excellent') return 1.0;
    if (dataQuality === 'good') return 0.9;
  }
  if (enrichmentStatus === 'basic') {
    if (dataQuality === 'excellent') return 0.85;
    if (dataQuality === 'good') return 0.8;
  }
  return 0.5;
}

// ── Volatility weight (inverse — low vol = high bonus) ───────────────────────

function volatilityBonus(volatility) {
  if (volatility === 'low')    return 1.0;
  if (volatility === 'medium') return 0.6;
  return 0.2; // high volatility
}

// ── Risk level from stored DB fields ─────────────────────────────────────────

/**
 * Compute risk level from stored prediction data.
 * Used when riskLevel is not already persisted (older cached predictions).
 */
function computeRiskLevelFromRow(row) {
  const prob      = parseFloat(row.best_pick_probability || 0);
  const volatility = (row.confidence_volatility || 'medium').toLowerCase();
  const marketKey  = (row.best_pick_market || '').toLowerCase();
  const isStable   = ALWAYS_ALLOWED.has(marketKey);

  if (prob >= 0.72 && isStable && volatility === 'low') return 'SAFE';
  if (prob >= 0.65 && volatility !== 'high') return 'MODERATE';
  return 'AGGRESSIVE';
}

// ── ACCA scoring formula ──────────────────────────────────────────────────────

/**
 * Score a candidate pick for ACCA inclusion.
 *
 * score = (probability × 0.6) + (data_quality_weight × 0.2) + (low_volatility_bonus × 0.2)
 */
function scoreAccaCandidate(row) {
  const prob     = parseFloat(row.best_pick_probability || 0);
  const dqWeight = dataQualityWeight(row.data_quality, row.enrichment_status);
  const volBonus = volatilityBonus((row.confidence_volatility || 'medium').toLowerCase());
  return (prob * 0.6) + (dqWeight * 0.2) + (volBonus * 0.2);
}

// ── Main ACCA builder ─────────────────────────────────────────────────────────

/**
 * Build an ACCA from a pool of today's qualifying predictions.
 *
 * @param {object[]} rows  - rows from predictions_v2 JOIN fixtures (must include
 *                           best_pick_market, best_pick_probability, confidence_volatility,
 *                           no_safe_pick, enrichment_status, data_quality, tournament_name,
 *                           script_primary, fixture_id, home_team, away_team, match_date)
 * @param {string}   mode  - 'safe' | 'value'
 * @returns {object}        ACCA result
 */
export function buildAcca(rows, mode = 'safe') {
  const isSafeMode  = mode !== 'value';
  const minProb     = isSafeMode ? 0.65 : 0.60;  // lowered: 75/70 was too strict
  const targetMin   = isSafeMode ? 3 : 4;
  const targetMax   = isSafeMode ? 4 : 5;
  const allowedRisk = isSafeMode ? ['SAFE', 'MODERATE'] : ['SAFE', 'MODERATE', 'AGGRESSIVE'];
  const maxModerate = isSafeMode ? 1 : 2;

  // ── Step 1: Filter eligible candidates ────────────────────────────────────
  const candidates = rows
    .filter(row => {
      if (row.no_safe_pick) return false;
      const prob     = parseFloat(row.best_pick_probability || 0);
      const vol      = (row.confidence_volatility || 'medium').toLowerCase();
      const marketKey = row.best_pick_market || '';

      if (prob < minProb) return false;
      if (!isAccaEligibleMarket(marketKey, vol, prob)) return false;

      const riskLevel = computeRiskLevelFromRow(row);
      if (!allowedRisk.includes(riskLevel)) return false;

      // SAFE mode: block high volatility entirely
      if (isSafeMode && vol === 'high') return false;

      return true;
    })
    .map(row => ({
      ...row,
      riskLevel:  computeRiskLevelFromRow(row),
      accaScore:  scoreAccaCandidate(row),
      scriptCat:  categorizeScript(row.script_primary),
    }))
    .sort((a, b) => b.accaScore - a.accaScore);  // best first

  if (candidates.length < targetMin) {
    return {
      accaType:           null,
      totalMatches:       0,
      combinedConfidence: 0,
      riskLevel:          null,
      picks:              [],
      message:            `Not enough qualifying fixtures (found ${candidates.length}, need ${targetMin})`,
    };
  }

  // ── Step 2: Correlation-aware selection ───────────────────────────────────
  const selected     = [];
  const usedLeagues  = new Map(); // tournamentName → count
  const scriptCounts = {};        // scriptCat → count
  let   moderateUsed = 0;

  for (const pick of candidates) {
    if (selected.length >= targetMax) break;

    const tournament = pick.tournament_name || 'Unknown';

    // Correlation rule: max 1 fixture per league in SAFE mode, max 2 in VALUE
    const leagueCount = usedLeagues.get(tournament) || 0;
    const leagueMax   = isSafeMode ? 2 : 3;
    if (leagueCount >= leagueMax) continue;

    // Correlation rule: max 2 of the same script pattern
    const catCount = scriptCounts[pick.scriptCat] || 0;
    if (catCount >= 2) continue;

    // VALUE mode: max 1 MODERATE pick
    if (pick.riskLevel === 'MODERATE') {
      if (moderateUsed >= maxModerate) continue;
      moderateUsed++;
    }

    selected.push(pick);
    usedLeagues.set(tournament, leagueCount + 1);
    scriptCounts[pick.scriptCat] = catCount + 1;
  }

  // ── Step 3: Validate final set ────────────────────────────────────────────
  if (selected.length < targetMin) {
    return {
      accaType:           null,
      totalMatches:       0,
      combinedConfidence: 0,
      riskLevel:          null,
      picks:              [],
      message:            `Correlation filter reduced picks below minimum (have ${selected.length}, need ${targetMin})`,
    };
  }

  // ── Step 4: Final validation — allow up to 1 medium volatility in SAFE mode
  // (removed hard rejection - was causing SAFE ACCA to always fail)

  // ── Step 5: Compute combined probability ──────────────────────────────────
  const combinedProb = selected.reduce(
    (acc, p) => acc * parseFloat(p.best_pick_probability || 0), 1
  );

  const overallRisk = selected.every(p => p.riskLevel === 'SAFE')
    ? 'LOW'
    : selected.filter(p => p.riskLevel === 'AGGRESSIVE').length > 0
      ? 'HIGH'
      : 'MEDIUM';

  // ── Step 6: Format output ─────────────────────────────────────────────────
  return {
    accaType:           isSafeMode ? 'SAFE ACCA' : 'VALUE ACCA',
    totalMatches:       selected.length,
    combinedConfidence: parseFloat((combinedProb * 100).toFixed(1)),
    riskLevel:          overallRisk,
    picks: selected.map(p => ({
      fixtureId:        p.fixture_id,
      homeTeam:         p.home_team,
      awayTeam:         p.away_team,
      match:            `${p.home_team} vs ${p.away_team}`,
      tournament:       p.tournament_name || '',
      matchDate:        p.match_date,
      market:           p.best_pick_market,
      selection:        p.best_pick_selection,
      probability:      parseFloat((parseFloat(p.best_pick_probability || 0) * 100).toFixed(1)),
      riskLevel:        p.riskLevel,
      enrichmentStatus: p.enrichment_status,
      dataQuality:      p.data_quality,
    })),
  };
}
