# Multi-Bookmaker Odds & Pinnacle Integration Design

## 1. Overview
The goal is to replace the generic, single-source odds currently used by the engine with a robust, multi-bookmaker comparison. This allows us to identify the absolute best available price on the market while using Pinnacle (the sharpest bookmaker) as our mathematical baseline for calculating the true `edgeScore`.

## 2. Backend Upgrades (`src/services/bsd.js`)
We will create a new function `fetchMultiBookmakerOdds(eventId)` that queries the BSD API endpoint: `GET /api/odds/compare/?event={id}`.

The raw response will contain odds from 22+ bookmakers. We will parse this to extract two specific metrics per market (1X2, Over/Under, BTTS):
- **Best Odds:** The highest decimal odds available and the name of the bookmaker offering it (e.g., `{ price: 2.10, bookmaker: 'bet365' }`).
- **Pinnacle Odds:** The specific odds offered by 'Pinnacle' (e.g., `{ price: 1.95 }`).

## 3. Enrichment Integration (`src/enrichment/enrichOne.js`)
During the deep enrichment phase when a user selects a match, we will call `fetchMultiBookmakerOdds` and attach the resulting `deepOdds` object to the `meta` bundle.

## 4. Scoring Algorithm Update (`src/markets/scoreMarketCandidates.js`)
Currently, `edgeScore` is calculated using the generic odds. We will update the logic:
1. Extract the Pinnacle odds for the candidate market.
2. Convert the Pinnacle odds to an implied probability: `impliedProb = 1 / pinnacleOdds`.
3. Compare our model's probability against Pinnacle's implied probability: `edge = modelProb - impliedProb`.
4. If Pinnacle is unavailable, fall back to the generic odds.

## 5. Frontend UI Upgrades (`client/src/components/match/PredictionTab.tsx`)
We will add a new **Value Detection Panel** for the top recommended market:
- **Best Available Price:** Display the highest odds and the bookmaker logo/name.
- **Sharp Market Baseline:** Display the Pinnacle odds.
- **The Edge:** A visual bar or percentage showing the difference between our model's probability and the bookmaker's implied probability.