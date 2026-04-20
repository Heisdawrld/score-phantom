/**
 * buildAcca.js
 *
 * Intelligent ACCA construction engine.
 * Builds low-correlation, controlled-risk accumulators.
 *
 * Two modes:
 *   SAFE  — 3–5 picks, all >= 75%, low volatility only, stable markets, top leagues
 *   VALUE — 4–5 picks, >= 70%, allows 1 MODERATE risk pick
 */
import { getAccuracyCache, getHistoricalAccuracyScore } from '../storage/accuracyCache.js';


// ── Market rules ──────────────────────────────────────────────────────────────

/**
 * Markets always allowed in ACCA — stable, low-variance outcomes.
 * NOTE: Unders intentionally removed from here so they go through the
 * diversity/cap system instead of bypassing it entirely.
 */
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
  'home_under_15',   // team-goal unders — confusing and niche
  'away_under_15',   // team-goal unders — confusing and niche
  'btts_no',         // defensive, kills ACCA appeal
  'draw',            // draws are high-variance, kill accas
]);

/** Under-family markets — tracked separately for diversity cap */
const UNDER_MARKETS = new Set([
  'under_25',
  'under_35',
]);

/**
 * Determine if a market is eligible for ACCA inclusion.
 */
function isAccaEligibleMarket(marketKey, volatility, probability) {
  const mk = (marketKey || '').toLowerCase();

  if (BLOCKED_MARKETS.has(mk)) return false;
  if (ALWAYS_ALLOWED.has(mk)) return true;

  // Under markets — require decent probability and non-high volatility
  if (UNDER_MARKETS.has(mk)) return probability >= 0.62 && volatility !== 'high';

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

function computeRiskLevelFromRow(row) {
  const prob       = parseFloat(row.best_pick_probability || 0);
  const volatility = (row.confidence_volatility || 'medium').toLowerCase();
  const marketKey  = (row.best_pick_market || '').toLowerCase();
  const isStable   = ALWAYS_ALLOWED.has(marketKey) || UNDER_MARKETS.has(marketKey);

  if (prob >= 0.70 && volatility === 'low') return 'SAFE';
  if (prob >= 0.65 && volatility !== 'high') return 'SAFE';
  if (prob >= 0.60) return 'MODERATE';
  return 'AGGRESSIVE';
}

// ── League prestige weights ───────────────────────────────────────────────────

// Leagues that get a guaranteed LOW prestige regardless of name matching.
// Prevents e.g. "Nigeria Premier League" matching "Premier League" = 1.0.
const LOW_PRESTIGE_OVERRIDE = new Set([
  'ghana premier league', 'nigeria premier league', 'ethiopia premier league',
  'rwanda premier league', 'uganda premier league', 'liberia premier league',
  'gambia premier league', 'zambia super league', 'south sudan premier league',
  'eswatini premier league', 'tanzania premier league', 'malawi premier league',
  'bangladesh premier league', 'cambodia premier league', 'tajikistan premier league',
  'turkmenistan premier league', 'iraq premier league', 'bahrain premier league',
  'jamaica premier league', 'moldova national division',
]);

// Country-qualified prestige map — exact tournament names as they come from LiveScore
const LEAGUE_PRESTIGE_EXACT = {
  'premier league': 1.0,              // England only (matched after LOW_PRESTIGE_OVERRIDE check)
  'la liga': 1.0,
  'bundesliga': 1.0,
  'serie a': 1.0,
  'ligue 1': 1.0,
  'uefa champions league': 1.0,
  'uefa europa league': 0.95,
  'uefa conference league': 0.90,
  'championship': 0.85,              // English Championship
  'eredivisie': 0.85,
  'primeira liga': 0.85,
  'scottish premiership': 0.80,
  'jupiler pro league': 0.80,
  'super lig': 0.80,
  'brasileirao serie a': 0.82,
  'seria a brasileira': 0.82,
  'liga mx': 0.80,
  'mls': 0.75,
  'serie b': 0.72,
  'efl league one': 0.72,
  'efl league two': 0.68,
  'liga professional': 0.68,
  'k league 1': 0.70,
  'k league 2': 0.62,
  'j1 league': 0.72,
  'j2 league': 0.62,
  'saudi pro league': 0.78,
  'uae pro league': 0.72,
  'superliga': 0.75,
  'ekstraklasa': 0.72,
  'allsvenskan': 0.72,
  'tippeligaen': 0.70,
  'premiership': 0.70,
};

function getLeaguePrestige(tournamentName) {
  if (!tournamentName) return 0.50;
  const t = String(tournamentName).trim().toLowerCase();

  // Step 1: Hard floor for known obscure leagues (ignores any name-match below)
  if (LOW_PRESTIGE_OVERRIDE.has(t)) return 0.45;

  // Step 2: Exact match from our prestige table
  if (LEAGUE_PRESTIGE_EXACT[t] !== undefined) return LEAGUE_PRESTIGE_EXACT[t];

  // Step 3: Guarded substring match — only for unambiguous names
  // Explicitly skip generic words that appear in many leagues across countries
  const AMBIGUOUS_SUBSTRINGS = ['premier league', 'primera division', 'primera liga', 'division 1', 'league 1', 'liga 1'];
  for (const name of AMBIGUOUS_SUBSTRINGS) {
    if (t === name) { // only exact match allowed for ambiguous names
      return LEAGUE_PRESTIGE_EXACT[name] ?? 0.50;
    }
  }

  // Step 4: Safe substring for unambiguous unique league names
  for (const [league, weight] of Object.entries(LEAGUE_PRESTIGE_EXACT)) {
    if (AMBIGUOUS_SUBSTRINGS.includes(league)) continue; // skip ambiguous ones
    if (t.includes(league)) return weight;
  }

  // Step 5: Heuristic fallback — unknown league
  return 0.50;
}

// ── ACCA scoring formula ──────────────────────────────────────────────────────

/**
 * Score an ACCA candidate. Higher = better pick for the accumulator.
 * Now reads real historical win rate from the accuracy cache.
 */
function scoreAccaCandidate(row, accuracyCache = null) {
  const prob     = parseFloat(row.best_pick_probability || 0);
  const dqWeight = dataQualityWeight(row.data_quality, row.enrichment_status);
  const volBonus = volatilityBonus((row.confidence_volatility || 'medium').toLowerCase());
  const prestige = getLeaguePrestige(row.tournament_name);
  const mk       = (row.best_pick_market || '').toLowerCase();
  const script   = (row.script_primary || '').toLowerCase();

  // Real historical accuracy from the accuracy cache (0–1, 0.5 = neutral/no data)
  const histAccuracy = getHistoricalAccuracyScore(mk, script, accuracyCache);

  // Diversity multipliers — unders penalised more to prevent stacking
  let diversityMult;
  if (UNDER_MARKETS.has(mk)) {
    diversityMult = 0.55;
  } else if (mk === 'home_win' || mk === 'away_win') {
    diversityMult = 1.08;
  } else if (mk.includes('over')) {
    diversityMult = 0.95;
  } else if (mk === 'double_chance_home' || mk === 'double_chance_away') {
    diversityMult = 1.02;
  } else {
    diversityMult = 1.0;
  }

  // Formula: probability + data quality + volatility + historical accuracy + prestige
  return (
    (prob       * 0.35) +
    (dqWeight   * 0.15) +
    (volBonus   * 0.15) +
    (histAccuracy * 0.25) +  // replaces broken confidence_model text heuristic
    (prestige   * 0.10)
  ) * diversityMult;
}

// ── Odds resolver — maps any marketKey to the correct odds column ─────────────

/**
 * Resolve the single decimal odds value for a given pick from the DB row.
 * Now covers ALL markets, not just home/away/draw.
 */
function resolvePickOdds(row) {
  const mk  = (row.best_pick_market || '').toLowerCase();
  const sel = (row.best_pick_selection || '').toLowerCase();

  // Match result
  if (mk === 'home_win')          return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'away_win')          return parseFloat(row.odds_away || row.away || 0) || null;
  if (mk === 'draw')              return parseFloat(row.odds_draw || row.draw || 0) || null;

  // DNB
  if (mk === 'dnb_home')          return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'dnb_away')          return parseFloat(row.odds_away || row.away || 0) || null;

  // Double Chance (Mathematically derived from 1X2 if explicit DC is missing, applying a 5% bookmaker margin)
  if (mk === 'double_chance_home') {
    if (row.odds_dc_home_draw || row.dc_home_draw) return parseFloat(row.odds_dc_home_draw || row.dc_home_draw);
    const h = parseFloat(row.odds_home || row.home);
    const d = parseFloat(row.odds_draw || row.draw);
    if (h && d) return (1 / (1/h + 1/d)) * 0.95;
    return null;
  }
  if (mk === 'double_chance_away') {
    if (row.odds_dc_away_draw || row.dc_away_draw) return parseFloat(row.odds_dc_away_draw || row.dc_away_draw);
    const a = parseFloat(row.odds_away || row.away);
    const d = parseFloat(row.odds_draw || row.draw);
    if (a && d) return (1 / (1/a + 1/d)) * 0.95;
    return null;
  }

  // BTTS
  if (mk === 'btts_yes')          return parseFloat(row.odds_btts_yes || row.btts_yes || 0) || null;
  if (mk === 'btts_no')           return parseFloat(row.odds_btts_no  || row.btts_no  || 0) || null;

  // Over/Under — parse from over_under JSON blob if present
  if (mk === 'over_25' || (mk === 'over_under' && sel.includes('over'))) {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.over_2_5 || ou?.over25 || row.odds_over_25 || 0) || null;
  }
  if (mk === 'under_25' || (mk === 'over_under' && sel.includes('under'))) {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.under_2_5 || ou?.under25 || row.odds_under_25 || 0) || null;
  }
  if (mk === 'over_15') {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.over_1_5 || ou?.over15 || row.odds_over_15 || 0) || null;
  }
  if (mk === 'under_35') {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.under_3_5 || ou?.under35 || row.odds_under_35 || 0) || null;
  }

  return null;
}

function safeParseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

// ── Main ACCA builder ─────────────────────────────────────────────────────────

export async function buildAcca(rows, mode = 'safe') {
  const isSafeMode  = mode !== 'value';
  const minProb     = 0.50;
  const targetMin   = 1;    // won't output below this (changed to 1 per user request)
  const targetMax   = 5;    // always aim for 5, never exceed
  const allowedRisk = isSafeMode ? ['SAFE'] : ['SAFE', 'MODERATE'];
  const maxModerate = isSafeMode ? 2 : 4; // Relaxed
  const maxUnders   = isSafeMode ? 2 : 3; // Relaxed

  // ── Quality gates — best leagues with enough stats only ─────────────────
    // Since Layer 1 Eligibility now strictly whitelists only the 35 premium BSD leagues,
    // we can aggressively relax these gates to ensure the ACCA generates predictions "by force by fire".
    const MIN_LEAGUE_PRESTIGE = isSafeMode ? 0.40 : 0.30;
    // Allow matches with basic/limited data (down to 0.15) since the junk leagues are already filtered out
    const MIN_DATA_SCORE      = isSafeMode ? 0.20 : 0.15;

  // Fetch accuracy cache once — used to score all candidates with real win rate data
  const accuracyCache = await getAccuracyCache().catch(() => null);

  // ── Step 1: Filter eligible candidates ────────────────────────────────────
  const candidates = rows
    .filter(row => {
      if (row.no_safe_pick) return false;
      const prob      = parseFloat(row.best_pick_probability || 0);
      const vol       = (row.confidence_volatility || 'medium').toLowerCase();
      const marketKey = row.best_pick_market || '';

      if (prob < minProb) return false;
      if (!isAccaEligibleMarket(marketKey, vol, prob)) return false;

      const riskLevel = computeRiskLevelFromRow(row);
      if (!allowedRisk.includes(riskLevel)) return false;

      // SAFE mode: block high volatility entirely
      if (isSafeMode && vol === 'high') return false;

      // ── League quality gate — prefer best leagues ────────────────────────
      const prestige = getLeaguePrestige(row.tournament_name);
      if (prestige < MIN_LEAGUE_PRESTIGE) return false;

      // ── Data quality gate — need enough stats to make the pick reliable ──
      const dataScore = parseFloat(row.data_completeness_score ||
                                    row.best_pick_score || 0);
      // If column isn't available (older rows), allow through — don't block on missing col
      // Only block if we have an explicit low value
      if (dataScore > 0 && dataScore < MIN_DATA_SCORE) return false;

      return true;
    })
    .map(row => ({
      ...row,
      _prestige:  getLeaguePrestige(row.tournament_name),
      riskLevel:  computeRiskLevelFromRow(row),
      accaScore:  scoreAccaCandidate(row, accuracyCache),
      scriptCat:  categorizeScript(row.script_primary),
    }))
    // Sort: ACCA score desc, with prestige as secondary tiebreaker
    .sort((a, b) => {
      const scoreDiff = b.accaScore - a.accaScore;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return b._prestige - a._prestige; // prefer higher prestige league on ties
    });

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
  const usedLeagues  = new Map();
  const scriptCounts = {};
  let   underCount   = 0;   // hard counter for Under markets
  let   moderateUsed = 0;

  for (const pick of candidates) {
    if (selected.length >= targetMax) break;

    const tournament = pick.tournament_name || 'Unknown';
    const mk_        = (pick.best_pick_market || '').toLowerCase();

    // Correlation rule: max 2 per league in SAFE mode, max 3 in VALUE
    const leagueCount = usedLeagues.get(tournament) || 0;
    const leagueMax   = isSafeMode ? 2 : 3;
    if (leagueCount >= leagueMax) continue;

    // Correlation rule: max 3 of the same script pattern
    const catCount = scriptCounts[pick.scriptCat] || 0;
    if (catCount >= 3) continue;

    // VALUE mode: max 1–2 MODERATE picks
    if (pick.riskLevel === 'MODERATE') {
      if (moderateUsed >= maxModerate) continue;
      moderateUsed++;
    }

    // ── Hard Under cap — prevents stacking ──────────────────────────────────
    if (UNDER_MARKETS.has(mk_)) {
      if (underCount >= maxUnders) continue;
    }

    // Min odds filter: skip picks where odds < 1.05 (no perceived value)
    const pickOdds_ = resolvePickOdds(pick);
    if (pickOdds_ && pickOdds_ < 1.05) continue;

    selected.push(pick);

    if (UNDER_MARKETS.has(mk_)) underCount++;
    usedLeagues.set(tournament, leagueCount + 1);
    scriptCounts[pick.scriptCat] = catCount + 1;
  }

  // ── Emergency Fill ────────────────────────────────────────────────────────
  // If we couldn't reach 5 picks because of strict correlation/league limits,
  // ignore the correlation limits and just take the next best picks until we hit 5.
  if (selected.length < 5) {
    for (const pick of candidates) {
      if (selected.length >= 5) break;
      // Skip if already selected
      if (selected.some(s => s.fixture_id === pick.fixture_id)) continue;
      
      const mk_ = (pick.best_pick_market || '').toLowerCase();
      const pickOdds_ = resolvePickOdds(pick);
      if (pickOdds_ && pickOdds_ < 1.05) continue;

      selected.push(pick);
    }
  }

  // ── Extreme Fallback ("By Force By Fire") ──────────────────────────────────
  // If even candidates are exhausted and we still don't have 5, pull from raw rows.
  // This guarantees we always show games if ANY predictions exist for today.
  if (selected.length < 5) {
    const sortedRows = [...rows].sort((a, b) => parseFloat(b.best_pick_probability || 0) - parseFloat(a.best_pick_probability || 0));
    for (const row of sortedRows) {
      if (selected.length >= 5) break;
      if (row.no_safe_pick) continue;
      if (selected.some(s => s.fixture_id === row.fixture_id)) continue;
      
      const prob = parseFloat(row.best_pick_probability || 0);
      const mk = row.best_pick_market || '';
      if (BLOCKED_MARKETS.has(mk.toLowerCase())) continue; // Still block terrible markets
      
      const pickOdds = resolvePickOdds(row);
      if (!pickOdds || pickOdds < 1.05) continue; // Must have valid odds

      const processed = {
        ...row,
        pickOdds,
        riskLevel: computeRiskLevelFromRow(row),
        scriptCat: categorizeScript(row.script_primary),
        accaScore: scoreAccaCandidate(row, accuracyCache)
      };
      selected.push(processed);
    }
  }

  // ── Step 3: Hard validate — must have at least 1 attacking/result pick ────
  const ATTACKING_MARKETS = new Set(['home_win','away_win','double_chance_home','double_chance_away','dnb_home','dnb_away','btts_yes','over_15','over_25']);
  const hasResultPick = selected.some(p => ATTACKING_MARKETS.has((p.best_pick_market || '').toLowerCase()));

  if (!hasResultPick && selected.length >= 2) {
    // All picks are unders — not acceptable for an ACCA. Try to swap one out.
    const attackingCandidate = candidates.find(p => !selected.some(s => s.fixture_id === p.fixture_id) && ATTACKING_MARKETS.has((p.best_pick_market || '').toLowerCase()));
    if (attackingCandidate) {
      selected[selected.length - 1] = attackingCandidate; // Replace the weakest pick
    } else {
      console.log('[ACCA] Rejected: zero attacking/result picks in final set. All defensive — not a good ACCA.');
      return {
        accaType:           null,
        totalMatches:       0,
        combinedConfidence: 0,
        riskLevel:          null,
        picks:              [],
        message:            'No attacking/result picks available.',
      };
    }
  }

  // ── Final output check ──────────────────────────────────────────────────────
  if (selected.length < targetMin) {
    return {
      accaType:           null,
      totalMatches:       0,
      combinedConfidence: 0,
      riskLevel:          null,
      picks:              [],
      message:            `Not enough qualifying fixtures (found ${selected.length}, need ${targetMin})`,
    };
  }

  // ── Step 4: Compute combined probability ──────────────────────────────────
  const combinedProb = selected.reduce(
    (acc, p) => acc * parseFloat(p.best_pick_probability || 0), 1
  );

  const overallRisk = selected.every(p => p.riskLevel === 'SAFE')
    ? 'LOW'
    : selected.filter(p => p.riskLevel === 'AGGRESSIVE').length > 0
      ? 'HIGH'
      : 'MEDIUM';

  // ── Step 5: Format output ─────────────────────────────────────────────────
  return {
    accaType:           isSafeMode ? 'SAFE ACCA' : 'VALUE ACCA',
    totalMatches:       selected.length,
    combinedConfidence: parseFloat((combinedProb * 100).toFixed(1)),
    riskLevel:          overallRisk,
    picks: selected.map(p => {
      const resolvedOdds = resolvePickOdds(p);
      return {
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
        // Resolved odds for the actual pick (all markets covered)
        pickOdds:         resolvedOdds,
        // Raw odds columns for display
        oddsHome: parseFloat(p.odds_home || p.home || 0) || null,
        oddsAway: parseFloat(p.odds_away || p.away || 0) || null,
        oddsDraw: parseFloat(p.odds_draw || p.draw || 0) || null,
      };
    }),
  };
}
