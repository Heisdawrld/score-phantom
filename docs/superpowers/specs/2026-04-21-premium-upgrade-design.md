# ScorePhantom Premium Upgrade: Technical Specification

## Overview
Transform ScorePhantom from a standard predictive model into a premier, sharp-money tactical hub. This upgrade leverages new endpoints from the BSD API (Polymarket Odds, Manager Profiles, StatsBomb-grade Spatial Data) to enhance the core prediction engine and build entirely new immersive UI experiences.

## Part 1: Core Engine Upgrade (The Brain)
### Goal
Inject Polymarket sharp odds and Manager tactical fingerprints into the existing Poisson/xG prediction pipeline.

### Data Acquisition
- **Managers:** Fetch `/api/managers/?team_id=X` for home and away teams during the enrichment phase (`src/enrichment/enrichOne.js`).
- **Polymarket Odds:** Fetch `/api/odds/polymarket/?event=X` to retrieve pre-match implied probabilities.

### Pipeline Modifications (`src/probabilities/estimateExpectedGoals.js` & `src/probabilities/calibrateProbabilities.js`)
1. **Tactical Multipliers (xG Adjustments):**
   - Implement logic to adjust base xG based on manager `tactical_styles` and `defensive_line`.
   - *Example:* "High Line" vs "Counter/Direct" = +10% away xG.
   - *Example:* "Terrorist Football" / "Park the Bus" = 0.85x multiplier to total match xG (boosting Under 2.5 probability).
2. **Sharp Baseline Anchoring:**
   - Use Polymarket's `1x2`, `btts`, and `over_under` probabilities as the "Sharp Baseline" before running the final Poisson distribution.
3. **Sharp Edge Calculation:**
   - If `| Model_Prob - Polymarket_Prob | > Threshold` (e.g., Model says 65%, Polymarket says 50%), tag the prediction internally as `SHARP_VALUE`.

### Database Schema Updates (`src/storage/dbShim.js`)
- Add columns to `predictions_v2` (or a related table) to store:
  - `home_manager_tactics` (JSON)
  - `away_manager_tactics` (JSON)
  - `polymarket_home_prob` (Float)
  - `polymarket_draw_prob` (Float)
  - `polymarket_away_prob` (Float)
  - `is_sharp_value` (Boolean)

## Part 2: The Match Center UI (The Insights)
### Goal
Expose the new tactical and sharp money data to the user on the `MatchCenter.tsx` page.

### UI Components
1. **The "Sharp Money" Indicator (`PredictionTab.tsx`):**
   - Add a visual comparison card: "Phantom Model vs Polymarket Sharp Money".
   - Highlight the discrepancy visually (e.g., using a differential bar).
2. **Tactical Matchup View (`PredictionTab.tsx` or new `TacticsTab.tsx`):**
   - Display Home Manager vs Away Manager.
   - Show Manager Headshots using the public image endpoint (`https://sports.bzzoiro.com/img/manager/{id}/`).
   - Render the top `tactical_styles` tags (e.g., 🚌 Park the Bus vs 🎯 Positional Play).
   - Display key manager stats (`avg_possession`, `pressing_intensity`, `defensive_line`).
3. **Predicted Lineups Tab (`LineupsTab.tsx`):**
   - Call `/api/predicted-lineup/{event_id}/` (or pass the data down if prefetched).
   - Render the `predicted_formation` and the list of `starters` and `unavailable` (injured/suspended) players.

## Part 3: The Live Tracker UI (The Real-Time Experience)
### Goal
Build an immersive, real-time match tracking experience using the new spatial and live data.

### Data Acquisition
- Call `/api/events/{id}/?full=true` to retrieve `shotmap`, `momentum`, and `average_positions`.
- Call `/api/live/` to retrieve `incidents` and `live_stats` for ongoing matches.

### UI Components (`LiveTracker.tsx` or integrated into `MatchCenter.tsx`)
1. **Momentum Graph:**
   - Use a charting library (e.g., Recharts) to plot the minute-by-minute `momentum` array.
   - Positive values (Home Dominance) in one color, negative values (Away Dominance) in another.
2. **Live Shotmap (Optional/V2):**
   - Map the `shotmap` `{x, y}` coordinates onto a 2D CSS football pitch.
   - Differentiate goals (using `gm` goal-mouth coordinates) from misses/saves.
3. **Live Stats & Incidents:**
   - Render the `live_stats` (possession, shots, corners).
   - Render the `incidents` timeline (goals, cards, substitutions with player names).

## Implementation Strategy
To ensure the live app remains stable, we will execute this in phases:
1. **Phase 1: Backend Data Plumbing.** Update `bsd.js`, `enrichmentService.js`, and the database schema to fetch and store the new data without altering the prediction math yet.
2. **Phase 2: Engine Calibration.** Integrate the Tactical Multipliers and Polymarket anchoring into the `probabilities` folder. Run backtests to ensure xG values remain sane.
3. **Phase 3: Frontend UI.** Build the Tactical Matchup, Sharp Money, and Lineups views in React.
4. **Phase 4: Live Tracker.** Implement the real-time polling and Momentum graphs for in-play matches.