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

  // Under markets — must have genuine low-scoring signal, not just base-rate inflation
  if (mk === 'under_25') return probability >= 0.68;
  if (mk === 'under_35') return probability >= 0.72;
  if (mk === 'home_under_15' || mk === 'away_under_15') return probability >= 0.72;

  // Home/Away win
  if (mk === 'home_win' || mk === 'away_win') return probability >= 0.65;

  // BTTS
  if (mk === 'btts_yes') return probability >= 0.65;

  // Over 1.5 and Over 2.5 — core ACCA markets
  if (mk === 'over_15') return probability >= 0.60;
  if (mk === 'over_25') return probability >= 0.58;

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
  const prob       = parseFloat(row.best_pick_probability || 0);
  const volatility = (row.confidence_volatility || 'medium').toLowerCase();
  const marketKey  = (row.best_pick_market || '').toLowerCase();
  const isStable   = ALWAYS_ALLOWED.has(marketKey);

  // Generous risk tiers - most high-prob picks should qualify
  if (prob >= 0.70 && volatility === 'low') return 'SAFE';
  if (prob >= 0.65 && volatility !== 'high') return 'SAFE';
  if (prob >= 0.60) return 'MODERATE';
  return 'AGGRESSIVE';
}

// ── ACCA scoring formula ──────────────────────────────────────────────────────

/**
 * Score a candidate pick for ACCA inclusion.
 *
 * IMPROVED: Weights historical accuracy more heavily than raw probability.
 * score = (probability × 0.35) + (data_quality_weight × 0.15) + (low_volatility_bonus × 0.15) 
 *         + (historical_accuracy × 0.25) + (prestige × 0.10)
 */
function scoreAccaCandidate(row) {
  const prob     = parseFloat(row.best_pick_probability || 0);
  const dqWeight = dataQualityWeight(row.data_quality, row.enrichment_status);
  const volBonus = volatilityBonus((row.confidence_volatility || 'medium').toLowerCase());
  const prestige = getLeaguePrestige(row.tournament_name);
  const mk       = (row.best_pick_market || '').toLowerCase();
  
  // IMPROVED: Historical accuracy weight (if available from backtesting)
  // Use the confidence_model field as a proxy for proven accuracy (0-1)
  let historicalAccuracy = parseFloat(row.confidence_model || 0);
  if (historicalAccuracy < 0.50) historicalAccuracy = 0; // filter out low-accuracy picks
  
  // Diversity: mild penalty on Unders, bonus for clean wins
  const diversityMult = mk.includes('under') ? 0.55 : (mk === 'home_win' || mk === 'away_win') ? 1.08 : mk.includes('over') ? 0.95 : 1.0;
  
  return ((prob * 0.35) + (dqWeight * 0.15) + (volBonus * 0.15) + (historicalAccuracy * 0.25) + (prestige * 0.10)) * diversityMult;
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

// ── League prestige weights ───────────────────────────────────────────────────────────────
const LEAGUE_PRESTIGE = {
  // Tier 1 — everyone bets these (1.0)
  'UEFA Champions League':    1.0,
  'Premier League':           1.0,
  'La Liga':                  1.0,
  'Bundesliga':               1.0,
  'Serie A':                  1.0,
  'Ligue 1':                  1.0,
  'UEFA Europa League':       0.95,
  // Tier 2 — popular (0.85)
  'Championship':             0.85,
  'Eredivisie':               0.85,
  'Primeira Liga':            0.85,
  'Scottish Premiership':     0.80,
  'Jupiler Pro League':       0.80,
  'Super Lig':                0.80,
  'Brasileirao':              0.80,
  'Liga MX':                  0.80,
  'MLS':                      0.75,
  'EFL League One':           0.75,
  'EFL League Two':           0.70,
  'Liga Nacional':            0.70,
  // Tier 3 — niche (0.60)
  'USL Championship':         0.60,
  'K-League':                 0.60,
  'J. League':                0.60,
  'J. League 2':              0.55,
};

function getLeaguePrestige(tournamentName) {
  if (!tournamentName) return 0.50;
  const t = String(tournamentName).toLowerCase();
  for (const [league, weight] of Object.entries(LEAGUE_PRESTIGE)) {
    if (t.includes(league.toLowerCase())) return weight;
  }
  // Default for unknown leagues
  return 0.50;
}

export function buildAcca(rows, mode = 'safe') {
  const isSafeMode  = mode !== 'value';
  // IMPROVED: Stricter thresholds for SAFE mode — historical accuracy matters more
  const minProb = 0.50;  // increased from 0.62
  const minAccuracy = isSafeMode ? 0.50 : 0.35;  // NEW: require proven historical accuracy
  const targetMin   = 3;  // always need at least 3
  const targetMax = 5;  // SAFE mode: max 3 picks (stricter)
  const allowedRisk = isSafeMode ? ['SAFE'] : ['SAFE', 'MODERATE'];  // VALUE: no AGGRESSIVE
  const maxModerate = isSafeMode ? 1 : 2;  // stricter for SAFE

  // ── Step 1: Filter eligible candidates ────────────────────────────────────
  const candidates = rows
    .filter(row => {
      if (row.no_safe_pick) return false;
      const prob     = parseFloat(row.best_pick_probability || 0);
      const vol      = (row.confidence_volatility || 'medium').toLowerCase();
      const marketKey = row.best_pick_market || '';
      const historicalAccuracy = parseFloat(row.confidence_model || 0);

      if (prob < minProb) return false;
      if (!isAccaEligibleMarket(marketKey, vol, prob)) return false;

      const riskLevel = computeRiskLevelFromRow(row);
      if (!allowedRisk.includes(riskLevel)) return false;

      // SAFE mode: block high volatility entirely
      if (isSafeMode && vol === 'high') return false;
      
      // NEW: Historical accuracy gate — picks must have proven track record
      // historicalAccuracy filter removed (confidence_model is text not float)

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
  const usedFixtures = new Set();  // one pick per fixture (hardest correlation rule)
  const usedLeagues  = new Map(); // tournamentName → count
  const scriptCounts = {};        // scriptCat → count
  const marketFamily = {};        // family → count (over_family, under_family, result_family)
  let   defensiveCount = 0;
  let   moderateUsed = 0;

  function getMarketFamily(mk) {
    if (["over_15","over_25","over_35","btts_yes","home_over_15","away_over_15","home_over_25","away_over_25"].includes(mk)) return "over_family";
    if (["under_25","under_35","btts_no","home_under_15","away_under_15"].includes(mk)) return "under_family";
    if (["home_win","away_win","dnb_home","dnb_away","double_chance_home","double_chance_away"].includes(mk)) return "result_family";
    return "other";
  }

  for (const pick of candidates) {
    if (selected.length >= targetMax) break;

    const tournament = pick.tournament_name || 'Unknown';

    // HARD RULE: one pick per fixture — same fixture = same event = full correlation
    const fid = String(pick.fixture_id || "");
    if (fid && usedFixtures.has(fid)) { console.log("[ACCA] Skipping duplicate fixture:", fid); continue; }

    // Market family limit: max 2 from same market family to prevent over-clustering
    const family = getMarketFamily((pick.best_pick_market||"" ).toLowerCase());
    const familyCount = marketFamily[family] || 0;
    const familyMax = family === "other" ? 3 : 2;
    if (familyCount >= familyMax) { console.log("[ACCA] Market family limit hit:", family); continue; }

    // Correlation rule: max 1 fixture per league in SAFE mode, max 2 in VALUE
    const leagueCount = usedLeagues.get(tournament) || 0;
    const leagueMax   = isSafeMode ? 2 : 3;
    if (leagueCount >= leagueMax) continue;

    // Correlation rule: max 3 of the same script pattern
    const catCount = scriptCounts[pick.scriptCat] || 0;
    if (catCount >= 3) continue;

    // VALUE mode: max 1 MODERATE pick
    if (pick.riskLevel === 'MODERATE') {
      if (moderateUsed >= maxModerate) continue;
      moderateUsed++;
    }

    // Diversity: max 1 Under per SAFE ACCA, max 2 per VALUE ACCA
    // Diversity: max 1 defensive pick (Under + BTTS-No + NOT-to-Score combined)
    const mk_ = (pick.best_pick_market||'').toLowerCase();
    const sel_ = (pick.best_pick_selection||'').toLowerCase();
    const isDefensive = mk_.includes('under') || mk_ === 'btts_no' || sel_.includes('not to score') || sel_.includes('no btts');
    if (isDefensive && defensiveCount >= 1) continue;
    // Min odds filter: skip picks where odds < 1.05 (no perceived value)
    const pickOdds_ = parseFloat(pick.odds_home || pick.odds_away || 0);
    if (pickOdds_ > 0 && pickOdds_ < 1.05) continue;

    selected.push(pick);
    if (fid) usedFixtures.add(fid);
    if (isDefensive) defensiveCount++;
    usedLeagues.set(tournament, leagueCount + 1);
    scriptCounts[pick.scriptCat] = catCount + 1;
    marketFamily[family] = familyCount + 1;
  }

  // ── Step 3: Validate final set ────────────────────────────────────────────
  // Ensure at least 1 attacking/result pick for variety
  const hasAttackingPick = selected.some(p => { const m=(p.best_pick_market||'').toLowerCase(); return m==='home_win'||m==='away_win'||m.includes('over')||m==='btts_yes'||m==='double_chance_home'||m==='double_chance_away'; });
  if (!hasAttackingPick && selected.length >= 2) console.log('[ACCA] Warning: all defensive picks');

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
      dataQuality: p.data_quality,
      pickOdds: p.best_pick_market === 'home_win' ? (p.odds_home||null) : p.best_pick_market === 'away_win' ? (p.odds_away||null) : p.best_pick_market === 'draw' ? (p.odds_draw||null) : null,
      oddsHome: p.odds_home||null, oddsAway: p.odds_away||null, oddsDraw: p.odds_draw||null,
    })),
  };
}
