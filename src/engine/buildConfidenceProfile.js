import { safeNum, clamp } from '../utils/math.js';
import { computeSharpMoneySignal } from '../probabilities/sharpMoneySignal.js';
import { getEnsembleConfidenceAdjustment } from '../probabilities/ensemble.js';

/**
 * Build a confidence profile for the best pick.
 *
 * Now accounts for:
 * - Enrichment completeness
 * - Market baseline probability (Under 3.5 at 72% is NOT the same as Home Win at 72%)
 * - League context (high-scoring leagues reduce UNDER confidence)
 *
 * The key insight: confidence thresholds should be relative to the market's
 * natural probability, not absolute. Under 3.5 naturally wins ~70% of the time
 * across football, so 72% is barely above baseline. Home Win naturally wins
 * ~45% of the time, so 72% is a strong signal.
 */

// Market baseline probabilities — what % of matches this market would win
// if you just picked it blindly for every match
// MUST stay in sync with scoreMarketCandidates.js MARKET_BASELINE
const MARKET_BASELINE = {
  home_win:           0.45,
  away_win:           0.30,
  draw:               0.25,
  btts_yes:           0.50,
  btts_no:            0.50,
  over_25:            0.50,
  under_25:           0.50,
  over_35:            0.30,
  under_35:           0.70,  // ← THE KEY: Under 3.5 naturally wins 70% of the time
  over_15:            0.75,  // ← Over 1.5 naturally wins 75% of the time
  under_15:           0.25,
  double_chance_home: 0.65,
  double_chance_away: 0.55,
  dnb_home:           0.45,
  dnb_away:           0.35,
  home_over_05:       0.80,
  away_over_05:       0.75,
  home_over_15:       0.55,
  away_over_15:       0.45,
  home_over_25:       0.35,
  away_over_25:       0.25,
};

/**
 * Build a confidence profile for the best pick.
 *
 * @param {object|null} bestPick
 * @param {object} featureVector - flat feature vector from runPredictionEngine
 * @returns {{ model, value, volatility, dataQualityNote }}
 */
export function buildConfidenceProfile(bestPick, featureVector) {
  const fv = featureVector || {};
  const pick = bestPick || {};

  const modelProbability = safeNum(pick.modelProbability, 0);
  const edge = pick.edge != null ? safeNum(pick.edge, null) : null;
  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);
  const marketKey = pick.marketKey || '';

  // ── Enrichment completeness penalty ─────────────────────────────────────
  const enrichmentTier = fv.enrichmentTier || null;
  const enrichmentScore = safeNum(fv.enrichmentCompleteness, null);

  // How much to penalize model probability based on data quality
  let dataPenalty = 0;
  let dataQualityNote = null;

  if (enrichmentTier === 'thin') {
    dataPenalty = 0.12;
    dataQualityNote = 'Minimal data available — confidence reduced';
  } else if (enrichmentTier === 'partial') {
    dataPenalty = 0.07;
    dataQualityNote = 'Limited historical data';
  } else if (enrichmentTier === 'good') {
    dataPenalty = 0.02;
  }
  // 'rich' tier: no penalty

  // Also check if we have stat profiles (historical match stats)
  if (!fv.hasHomeStatProfile && !fv.hasAwayStatProfile) {
    // No stats enrichment — additional small penalty
    dataPenalty += 0.03;
  }

  // ── Market baseline adjustment ────────────────────────────────────────────
  // If a market naturally wins at a high rate (like under_35 at 70%),
  // we need a HIGHER probability to claim "high confidence" compared to
  // a market with a low baseline (like away_win at 30%).
  //
  // Example: under_35 at 75% → only 5% above baseline → NOT "high"
  //          home_win at 72% → 27% above baseline → IS "high"
  //
  // The "edge above baseline" determines how strong the signal actually is.

  const baseline = MARKET_BASELINE[marketKey] || 0.50;
  const edgeAboveBaseline = modelProbability - baseline;

  // Also factor in league-specific Over 3.5 rate for under_35/over_35
  let leagueBaselineAdjustment = 0;
  if (marketKey === 'under_35' || marketKey === 'over_35') {
    const leagueOver35Rate = safeNum(fv.leagueOver35Rate, 0.30);
    const leagueUnder35Rate = 1 - leagueOver35Rate;

    if (marketKey === 'under_35') {
      // In a high-scoring league (O3.5=40%), Under 3.5 baseline is 60%, not 70%
      // The further the league baseline is from global baseline, the more we adjust
      const leagueBaseline = leagueUnder35Rate;
      const baselineDeviation = baseline - leagueBaseline; // positive if league is high-scoring

      // If the league Under 3.5 rate is LOWER than global (high-scoring league),
      // we should be LESS confident → increase the effective baseline
      if (baselineDeviation > 0.05) {
        // High-scoring league: Under 3.5 wins less often here
        // Adjust the probability downward to reflect league reality
        leagueBaselineAdjustment = -clamp(baselineDeviation * 0.4, 0, 0.08);
      }
    } else if (marketKey === 'over_35') {
      // In a high-scoring league (O3.5=40%), Over 3.5 baseline is 40%, not 30%
      const leagueBaseline = leagueOver35Rate;
      const baselineDeviation = leagueBaseline - baseline; // positive if league is high-scoring

      if (baselineDeviation > 0.05) {
        // High-scoring league: Over 3.5 wins more often → boost confidence
        leagueBaselineAdjustment = clamp(baselineDeviation * 0.3, 0, 0.06);
      }
    }
  }

  // H2H Over 3.5 rate also affects under_35 confidence
  let h2hAdjustment = 0;
  if ((marketKey === 'under_35' || marketKey === 'over_35') && fv.h2hOver35Rate != null) {
    const h2hOver35 = safeNum(fv.h2hOver35Rate, 0.30);
    const h2hDeviation = h2hOver35 - 0.30; // vs global baseline

    if (marketKey === 'under_35' && h2hDeviation > 0.05) {
      // H2H shows lots of Over 3.5 games → reduce Under 3.5 confidence
      h2hAdjustment = -clamp(h2hDeviation * 0.25, 0, 0.05);
    } else if (marketKey === 'over_35' && h2hDeviation > 0.05) {
      // H2H shows lots of Over 3.5 games → boost Over 3.5 confidence
      h2hAdjustment = clamp(h2hDeviation * 0.20, 0, 0.04);
    }
  }

  // Adjusted probability for confidence classification
  const adjustedProbability = Math.max(0, modelProbability - dataPenalty + leagueBaselineAdjustment + h2hAdjustment);

  // ── Sharp Money Signal (v3) ───────────────────────────────────────────────
  // If sharp books (Pinnacle) are SHORTENING on our pick, that's confirmation
  // from sophisticated money. If they're DRIFTING, that's a warning.
  //
  // Conservative weights for initial rollout — can be tuned up once we have
  // 200+ predictions to validate the signal's predictive power.
  //
  // The sharp money signal requires the oddsComparison data to be present in
  // the feature vector. If it's missing (older enrichments), this is a no-op.
  let sharpMoneyAdjustment = 0;
  let sharpMoneyNote = null;
  const oddsComparison = fv.oddsComparison || null;
  if (oddsComparison && pick.marketKey) {
    const sharpSignal = computeSharpMoneySignal(oddsComparison, pick);
    if (sharpSignal.alignment === 'confirms') {
      sharpMoneyAdjustment = sharpSignal.signal; // positive (max +0.04)
      if (sharpSignal.strength === 'strong') {
        sharpMoneyNote = 'Sharp money (Pinnacle) confirming this pick';
      }
    } else if (sharpSignal.alignment === 'contradicts') {
      sharpMoneyAdjustment = sharpSignal.signal; // negative (min -0.05)
      if (sharpSignal.strength === 'strong') {
        sharpMoneyNote = 'Sharp money (Pinnacle) fading this pick — confidence reduced';
      }
    }
  }

  // ── Ensemble Agreement Signal (v3) ────────────────────────────────────────
  // The ensemble in runProbabilityPipeline.js produces an agreement signal:
  //   - 'strong'/'moderate' agreement → +0.02 to +0.04 (models align → boost)
  //   - 'divergent' → -0.015 to -0.05 (models disagree → reduce)
  //   - 'none' → 0 (no external signals available)
  //
  // This is a separate signal from sharp money — ensemble measures model
  // consensus, sharp money measures market consensus. Both can apply.
  const ensembleMeta = fv.ensembleMeta || null;
  const ensembleAdjustment = getEnsembleConfidenceAdjustment(ensembleMeta);

  // Total external signal adjustment (capped to prevent runaway confidence)
  const totalExternalAdjustment = clamp(sharpMoneyAdjustment + ensembleAdjustment, -0.08, 0.06);
  const finalAdjustedProbability = clamp(adjustedProbability + totalExternalAdjustment, 0, 1);

  if (Math.abs(totalExternalAdjustment) >= 0.005) {
    const signals = [];
    if (sharpMoneyAdjustment !== 0) signals.push(`sharp=${sharpMoneyAdjustment >= 0 ? '+' : ''}${(sharpMoneyAdjustment * 100).toFixed(1)}pp`);
    if (ensembleAdjustment !== 0) signals.push(`ensemble=${ensembleAdjustment >= 0 ? '+' : ''}${(ensembleAdjustment * 100).toFixed(1)}pp`);
    console.log(`[confidence] External signals for ${marketKey}: ${signals.join(', ')} → adjusted ${(adjustedProbability * 100).toFixed(1)}% → ${(finalAdjustedProbability * 100).toFixed(1)}%`);
  }

  if (sharpMoneyNote && !dataQualityNote) {
    dataQualityNote = sharpMoneyNote;
  }

  // ── Model confidence (probability-primary, baseline-informed) ────────────────
  // v3 FIX: The model confidence label MUST respect absolute probability.
  // Previously, edgeAboveBaseline was the primary gate, causing 80% probability
  // picks in high-baseline markets (e.g., Over 1.5 with 75% baseline) to be
  // labeled "lean" because edgeAboveBaseline was only 5%. This is nonsensical —
  // an 80% model probability is HIGH confidence regardless of baseline.
  //
  // Now: absolute probability is the primary driver. edgeAboveBaseline is a
  // SOFT modifier that can boost or nudge, but NEVER downgrade below what
  // the absolute probability warrants.
  //
  // v4: Uses finalAdjustedProbability which incorporates sharp money + ensemble
  // signals. Conservative caps prevent these from causing runaway confidence.
  let model;
  if (finalAdjustedProbability >= 0.80) {
    // Very high absolute probability — always HIGH
    model = 'high';
  } else if (finalAdjustedProbability >= 0.72) {
    // High probability — at least MEDIUM; HIGH if strong edge
    model = edgeAboveBaseline >= 0.10 ? 'high' : 'medium';
  } else if (finalAdjustedProbability >= 0.62) {
    // Good probability — at least LEAN; MEDIUM if decent edge
    model = edgeAboveBaseline >= 0.06 ? 'medium' : 'lean';
  } else if (finalAdjustedProbability >= 0.52) {
    // Marginal probability — LEAN if any edge, else LOW
    model = edgeAboveBaseline >= 0.02 ? 'lean' : 'low';
  } else {
    model = 'low';
  }

  // Force lean if data is too thin regardless of probability (never high/medium on thin data)
  if (enrichmentTier === 'thin') {
    if (model === 'high' || model === 'medium') model = 'lean';
  }

  // ── Value confidence ──────────────────────────────────────────────────────
  let value;
  if (edge === null) {
    value = 'low'; // no odds data = can't assess value
  } else if (edge > 0.12) {
    value = 'high';
  } else if (edge > 0.06) {
    value = 'medium';
  } else {
    value = 'low';
  }

  // ── Volatility ────────────────────────────────────────────────────────────
  let volatility;
  if (matchChaosScore < 0.35) volatility = 'low';
  else if (matchChaosScore < 0.6) volatility = 'medium';
  else volatility = 'high';

  // High form variance → raise volatility
  const homeVar = safeNum(fv.homeFormVariance, 0);
  const awayVar = safeNum(fv.awayFormVariance, 0);
  if (homeVar > 0.8 || awayVar > 0.8) {
    if (volatility === 'low') volatility = 'medium';
  }

  // ── Fix Contradiction: High Variance should suppress High Confidence ──────
  if (volatility === 'high' && (model === 'high' || model === 'medium')) {
    model = 'lean'; // Downgrade confidence if match is highly volatile
    if (!dataQualityNote) dataQualityNote = "High variance detected — confidence downgraded";
  }

  // Step 3 (User spec): CONTEXT affects confidence, NOT xG
  // Lineup missing = unpredictable team composition = lower confidence
  const hasLineupData = fv.hasLineupData || false;
  const lineupComplete = fv.homeLineupComplete && fv.awayLineupComplete;
  const lineupCertaintyScore = safeNum(fv.lineupCertaintyScore, null);
  const homeAbsence = safeNum(fv.homeWeightedAbsenceScore, 0);
  const awayAbsence = safeNum(fv.awayWeightedAbsenceScore, 0);
  if (!hasLineupData) {
    if (model === "high") model = "medium";
    if (!dataQualityNote) dataQualityNote = 'Waiting for lineups — confidence reduced';
  } else if (!lineupComplete) {
    // Partial lineup — small downgrade
    if (model === "high") model = "medium";
  }
  if (lineupCertaintyScore != null && lineupCertaintyScore < 0.55) {
    if (model === 'high') model = 'medium';
    else if (model === 'medium') model = 'lean';
    if (!dataQualityNote) dataQualityNote = 'Lineup certainty is still weak';
  }
  if (Math.max(homeAbsence, awayAbsence) >= 0.45 && model === 'high') {
    model = 'medium';
    if (!dataQualityNote) dataQualityNote = 'Key absences materially reduce certainty';
  }
  // High rotation risk (motivationScore < 0.4 = unmotivated) — flag in note
  const homeMotivation = safeNum(fv.homeMotivationScore, 0.5);
  const awayMotivation = safeNum(fv.awayMotivationScore, 0.5);
  if (homeMotivation < 0.4 || awayMotivation < 0.4) {
    if (!dataQualityNote) dataQualityNote = "Low motivation detected — confidence reduced";
    if (model === "high") model = "medium";
  }
  // Enrichment tier "thin" (< 0.3) → restrict markets signal
  const restrictMarkets = enrichmentTier === "thin" || safeNum(fv.enrichmentCompleteness, 0.5) < 0.30;

  // Log the probability-primary classification for debugging
  if (marketKey === 'under_35' || marketKey === 'over_35' || marketKey === 'over_15') {
    console.log(`[confidence] ${marketKey}: prob=${(modelProbability*100).toFixed(1)}% adjProb=${(adjustedProbability*100).toFixed(1)}% baseline=${(baseline*100).toFixed(0)}% edgeAboveBaseline=${(edgeAboveBaseline*100).toFixed(1)}pp → ${model}`);
  }

  // Normalize to UPPERCASE for consistent storage/querying.
  // Internal logic uses lowercase, but all downstream consumers (DB, API, UI)
  // expect uppercase. This single normalization point prevents the
  // high/HIGH case inconsistency that fragmented historical analysis.
  const modelUpper = (model || 'low').toUpperCase();

  return { model: modelUpper, value: (value || 'low').toUpperCase(), volatility: (volatility || 'medium').toUpperCase(), dataQualityNote, restrictMarkets: !!restrictMarkets, edgeAboveBaseline: parseFloat(edgeAboveBaseline.toFixed(4)), marketBaseline: parseFloat(baseline.toFixed(4)) };
}
