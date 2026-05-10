import { safeNum } from '../utils/math.js';

// ── Market classification ─────────────────────────────────────────────────────

/**
 * Stable markets: high probability, low variance, predictable outcomes.
 * These are preferred for best picks and ACCA construction.
 */
const STABLE_MARKETS = new Set([
  'under_35', 'under_25',
  'double_chance_home', 'double_chance_away',
  'dnb_home', 'dnb_away',
]);

/** Team-goal unders — niche, confusing for users, deprioritized from best picks */
const DEPRIORITIZED_MARKETS = new Set([
  'home_under_15', 'away_under_15',
]);

/**
 * Volatile markets: outcomes swing with single events.
 * Only allowed with strong edge.
 */
const VOLATILE_MARKETS = new Set([
  'btts_yes', 'over_35', 'over_25', 'home_over_25', 'away_over_25',
]);

// ── Risk level classification ─────────────────────────────────────────────────

/**
 * Classify a pick into SAFE / MODERATE / AGGRESSIVE.
 *
 * SAFE:       prob >= 0.72 AND stable market AND low volatility
 * MODERATE:   prob >= 0.65 AND not chaotic
 * AGGRESSIVE: everything else that passes the minimum threshold
 */
export function computeRiskLevel(pick, features, script) {
  if (!pick) return 'AGGRESSIVE';

  const prob        = safeNum(pick.modelProbability, 0);
  const chaos       = safeNum(features?.matchChaosScore, 0.5);
  const marketKey   = pick.marketKey || '';
  const isStable    = STABLE_MARKETS.has(marketKey);
  const isVolatile  = VOLATILE_MARKETS.has(marketKey);
  const scriptPrimary = script?.primary || '';
  const isChaotic   = scriptPrimary === 'chaotic_unreliable' ||
                      scriptPrimary === 'open_end_to_end';

  // ── Probability is the PRIMARY driver ────────────────────────────────────
  // A high-confidence pick should NEVER be labelled HIGH RISK.
  // Risk reflects how certain the model is, not the market type alone.

  // Very high confidence (≥74%) → SAFE unless extreme chaos
  if (prob >= 0.74) {
    if (isChaotic && chaos >= 0.80) return 'MODERATE'; // extreme chaos downgrade
    return 'SAFE';
  }

  // Good confidence (65-74%) → SAFE on stable markets, MODERATE elsewhere
  if (prob >= 0.65) {
    if (isChaotic && chaos >= 0.72) return 'AGGRESSIVE';
    if (isStable && chaos < 0.55) return 'SAFE';
    return 'MODERATE';
  }

  // Moderate confidence (58-65%) → MODERATE unless chaotic
  if (prob >= 0.58) {
    if (isChaotic || chaos >= 0.68) return 'AGGRESSIVE';
    if (isVolatile) return 'AGGRESSIVE';
    return 'MODERATE';
  }

  // Low confidence (<58%) → always AGGRESSIVE (HIGH RISK)
  return 'AGGRESSIVE';
}

// ── Edge label classification ─────────────────────────────────────────────────

/**
 * Map a pick into a human-readable edge label.
 * Replaces the old "Strong Fit / Moderate / Weak" system.
 *
 *   STRONG EDGE (SAFE)       — high probability, low-risk market
 *   STRONG EDGE (AGGRESSIVE) — high probability, higher-risk market/game
 *   LEAN                     — moderate probability, some evidence
 *   NO EDGE                  — below threshold
 */
export function computeEdgeLabel(pick, riskLevel) {
  const prob = safeNum(pick?.modelProbability, 0);

  if (prob >= 0.74) {
    // Both SAFE and MODERATE at this probability = strong edge, just differ in consistency
    return riskLevel === 'SAFE' ? 'STRONG EDGE' : 'PLAYABLE EDGE';
  }
  if (prob >= 0.65) return 'MODERATE EDGE';
  if (prob >= 0.55) return 'LEAN';
  return 'NO EDGE';
}

// ── Annotate a candidate with risk metadata ───────────────────────────────────

function annotatePick(pick, features, script) {
  if (!pick) return pick;
  const riskLevel = computeRiskLevel(pick, features, script);
  const edgeLabel = computeEdgeLabel(pick, riskLevel);
  // Deprioritized markets get a flag so the UI can still show them but they rank lower
  const isDeprioritized = DEPRIORITIZED_MARKETS.has(pick.marketKey);
  return { ...pick, riskLevel, edgeLabel, isDeprioritized };
}

// ── Main selector ────────────────────────────────────────────────────────────

/**
 * Select the best pick from ranked market candidates.
 *
 * Rules:
 * 0. Minimum probability gate: best pick must have modelProbability >= 0.60
 * 1. If scriptOutput.primary === 'chaotic_unreliable' AND confidence > 0.65 => noSafePick
 * 2. If featureVector.matchChaosScore > 0.88 => noSafePick
 * 3. If ranked[0].finalScore - ranked[1].finalScore < threshold => noSafePick
 * 4. Else: bestPick = ranked[0], backupPicks = ranked[1..2]
 *
 * All picks are annotated with riskLevel + edgeLabel before returning.
 *
 * @param {MarketCandidate[]} rankedCandidates - sorted by finalScore desc
 * @param {object} scriptOutput
 * @param {object} featureVector
 * @param {object} options - { layer2Override, layer2ShiftMarket, layer2ShiftPp }
 * @returns {{ bestPick, backupPicks, noSafePick, noSafePickReason, layer2OverrideApplied }}
 */
export function selectBestPick(rankedCandidates, scriptOutput, featureVector, options = {}) {
  const ranked = rankedCandidates ? [...rankedCandidates] : [];
  const fv     = featureVector   || {};
  const script = scriptOutput    || {};

  // Polymarket Sharp Value Check
  if (fv.polymarketOdds && fv.polymarketOdds.odds) {
    ranked.forEach(pick => {
      let polyProb = null;
      if (pick.market === 'match_winner' && fv.polymarketOdds.odds['1x2'] && pick.selection) {
         polyProb = fv.polymarketOdds.odds['1x2'][pick.selection.toLowerCase()];
      } else if (pick.market === 'both_teams_to_score' && fv.polymarketOdds.odds.btts && pick.selection) {
         polyProb = fv.polymarketOdds.odds.btts[pick.selection.toLowerCase()];
      } else if (pick.market === 'over_under' && fv.polymarketOdds.odds.over_under && pick.selection) {
         const parts = pick.selection.split('_');
         if (parts.length > 1) {
           const key = `${parts[0]}_${parts[1].replace('.', '')}`;
           polyProb = fv.polymarketOdds.odds.over_under[key];
         }
      }

      const prob = pick.modelProbability !== undefined ? pick.modelProbability : pick.probability;
      if (polyProb && prob !== undefined && Math.abs(prob - polyProb) > 0.12) {
         pick.isSharpValue = true;
         if (pick.finalScore !== undefined) pick.finalScore += 0.5;
         else if (pick.score !== undefined) pick.score += 0.5;
         
         console.log(`[selectBestPick] SHARP VALUE DETECTED: ${pick.market} ${pick.selection}. Model: ${prob.toFixed(2)}, Poly: ${polyProb.toFixed(2)}`);
      }
    });

    // Sort again in case Sharp Value changed scores
    ranked.sort((a, b) => {
      const scoreA = a.finalScore !== undefined ? a.finalScore : (a.score || 0);
      const scoreB = b.finalScore !== undefined ? b.finalScore : (b.score || 0);
      return scoreB - scoreA;
    });
  }

  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);

  const annotated = ranked.map(p => annotatePick(p, fv, script));

  // Rule 1: chaotic script with high confidence
  if (script.primary === 'chaotic_unreliable' && safeNum(script.confidence, 0) > 0.65) {
    return {
      bestPick: null,
      backupPicks: annotated.slice(0, 2),
      noSafePick: true,
      noSafePickReason: 'Match classified as chaotic_unreliable with high confidence',
    };
  }

  // Rule 2: high chaos score
  if (matchChaosScore > 0.88) {
    return {
      bestPick: null,
      backupPicks: annotated.slice(0, 2),
      noSafePick: true,
      noSafePickReason: 'Match chaos score too high — insufficient data or volatile match',
    };
  }

  // Not enough candidates
  if (ranked.length === 0) {
    return {
      bestPick: null,
      backupPicks: [],
      noSafePick: true,
      noSafePickReason: 'No market candidates passed filters',
    };
  }

  // Rule 0: minimum probability gate — best pick must be >= 0.60
  const topProb = safeNum(ranked[0]?.modelProbability, 0);
  if (topProb < 0.60) {
    return {
      bestPick: null,
      backupPicks: annotated.slice(0, 2),
      noSafePick: true,
      noSafePickReason: `Best pick probability too low (${(topProb * 100).toFixed(1)}% < 60% minimum)`,
    };
  }

  // Rule 3: top two too close
  if (ranked.length >= 2) {
    const hasOdds = ranked.some(c => c.edge != null && c.edge !== 0);
    const minGap  = hasOdds ? 0.018 : 0.012;
    const gap     = safeNum(ranked[0].finalScore, 0) - safeNum(ranked[1].finalScore, 0);

    if (gap < minGap) {
      // ── Layer 2 Pick Override ────────────────────────────────────────────
      if (options.layer2Override && ranked.length > 0) {
        const shiftPp = ((options.layer2ShiftPp ?? 0) * 100).toFixed(1);
        const mkt     = options.layer2ShiftMarket ?? 'unknown';
        console.log(
          `[PICK OVERRIDE] Applied | gap=${gap.toFixed(4)} (< ${minGap} threshold) ` +
          `L2-shift=${shiftPp}pp on "${mkt}" | ` +
          `pick="${ranked[0].marketKey}" ` +
          `prob=${(safeNum(ranked[0].modelProbability, 0) * 100).toFixed(1)}% ` +
          `tacticalFit=${safeNum(ranked[0].tacticalFitScore, 0).toFixed(3)}`
        );
        return {
          bestPick:  annotatePick(ranked[0], fv, script),
          backupPicks: ranked.slice(1, 3).map(p => annotatePick(p, fv, script)),
          noSafePick: false,
          noSafePickReason: null,
          layer2OverrideApplied: true,
        };
      }

      // No-odds fallback: use tactical + probability score
      if (!hasOdds) {
        const byTacticalScore = [...ranked].sort((a, b) => {
          const aScore = safeNum(a.tacticalFitScore, 0) * 0.6 + safeNum(a.modelProbability, 0) * 0.4;
          const bScore = safeNum(b.tacticalFitScore, 0) * 0.6 + safeNum(b.modelProbability, 0) * 0.4;
          return bScore - aScore;
        });
        const tacticalGap =
          (safeNum(byTacticalScore[0].tacticalFitScore, 0) * 0.6 + safeNum(byTacticalScore[0].modelProbability, 0) * 0.4) -
          (safeNum(byTacticalScore[1].tacticalFitScore, 0) * 0.6 + safeNum(byTacticalScore[1].modelProbability, 0) * 0.4);

        if (tacticalGap >= 0.02) {
          return {
            bestPick:  annotatePick(byTacticalScore[0], fv, script),
            backupPicks: byTacticalScore.slice(1, 3).map(p => annotatePick(p, fv, script)),
            noSafePick: false,
            noSafePickReason: null,
          };
        }
      }

      return {
        bestPick: null,
        backupPicks: annotated.slice(0, 2),
        noSafePick: true,
        noSafePickReason: `Top two picks too close (gap=${gap.toFixed(3)}) — no clear best market`,
      };
    }
  }

  // Rule 4: pick the winner
  const best = annotated[0] || null;

  return {
    bestPick: best,
    backupPicks: annotated.slice(1, 3),
    noSafePick: false,
    noSafePickReason: null,
  };
}
