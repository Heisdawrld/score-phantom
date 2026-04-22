# ScorePhantom ML Engine Enhancement: Bzzoiro API Expansion

## Overview
The ScorePhantom ML engine currently leverages a significant portion of the Bzzoiro API to build its feature vector and calculate expected goals (xG). However, an audit revealed four critical unutilized endpoints that could significantly enhance prediction accuracy and value detection. This document outlines the design for integrating these missing endpoints into the existing pipeline.

## 1. Ensemble AI (Bzzoiro ML Predictions)
**Endpoint:** `/api/predictions/{id}/`
**Current State:** ScorePhantom acts as a standalone ML engine using custom Poisson math and CatBoost.
**Design:**
- **Fetch:** Create `fetchBzzoiroPrediction(eventId)` in `src/services/bsd.js`.
- **Enrichment:** Call this endpoint in `enrichmentService.js` during the standard enrichment pipeline and store the result in the fixture's `meta` object.
- **Engine Integration:** In `finalizePredictionResult.js` or `runMarketSelection.js`, compare ScorePhantom's `bestPick` with Bzzoiro's prediction.
- **Outcome:** If both models agree on the same market/selection (e.g., both predict Home Win), boost the `confidence` score and set `dataQuality.tier` to "Guaranteed" or apply a specific "Ensemble Match" flag.

## 2. Advanced Player Profiling
**Endpoint:** `/api/player-stats/` & `/api/players/`
**Current State:** `buildFeatureVector.js` counts missing players equally, regardless of their impact.
**Design:**
- **Fetch:** When `predicted-lineups` reveals missing players, fetch their specific stats using `fetchPlayerStats(playerId)` in `src/services/bsd.js`.
- **Feature Vector:** Instead of a simple `homeKeyMissing` integer count, calculate an `xgImpact` metric. Sum the historical xG/Assists of missing players.
- **Engine Integration:** In `estimateExpectedGoals.js`, deduct the calculated `xgImpact` directly from the team's base xG instead of applying a generic flat penalty for missing players.

## 3. Advanced Bookmaker Odds & EV Calculation
**Endpoint:** `/api/odds/best/` & `/api/odds/compare/`
**Current State:** Only standard baseline odds and Polymarket odds are utilized.
**Design:**
- **Fetch:** Create `fetchBestOdds(eventId)` in `src/services/bsd.js`.
- **Enrichment:** Store the best available market odds in the `meta` object alongside standard odds.
- **Engine Integration:** In `selectBestPick.js`, calculate Expected Value (EV) by comparing the ScorePhantom calibrated probability against the *best* available bookmaker odds, not just the average baseline.
- **UI Output:** Expose an `ev_rating` or `best_odds_available` field to the frontend to highlight high-value bets explicitly (e.g., "High Value Bet: Odds 2.10 vs SP Prob 65%").

## 4. Turf & Stadium Data
**Endpoint:** `/api/venues/`
**Current State:** All stadiums are treated identically.
**Design:**
- **Fetch:** Create `fetchVenue(venueId)` in `src/services/bsd.js` (venue ID is usually available in the event detail or team data).
- **Feature Vector:** Extract `turf_type` (e.g., "grass", "artificial") and pass it into the flat feature vector.
- **Engine Integration:** In `estimateExpectedGoals.js` or `runProbabilityPipeline.js`, apply a volatility modifier if the turf type is "artificial" (or differs from the away team's usual turf), adjusting Under/Over 2.5 probabilities to account for the different playing surface.

## Implementation Plan
1. **API Service Updates:** Add the four new fetch functions to `src/services/bsd.js`.
2. **Enrichment Pipeline:** Update `enrichmentService.js` to call these new functions and map the data into the `meta` JSON object.
3. **Feature Vector:** Update `buildFeatureVector.js` and `flattenFeatureVector.js` to extract the new data points (Bzzoiro prediction, player xG impact, best odds, turf type).
4. **Engine Math:** Update `estimateExpectedGoals.js`, `selectBestPick.js`, and `finalizePredictionResult.js` to utilize the new variables for EV calculation, ensemble confidence, and xG adjustment.
5. **Database/Cache:** No schema changes required as data fits into the existing `meta` JSON column.
6. **Frontend:** (Optional/Later) Update `PredictionTab.tsx` to display the "Ensemble Match" badge, specific missing player impact, and exact EV calculations.