# Historical Backtesting Engine & Track Record UI Design

## 1. Overview
The goal is to build a verifiable, public-facing Track Record page that displays the ScorePhantom engine's historical hit rate. To power this, we need a background CLI script that fetches historical match data from the BSD API, runs the prediction engine against that data as if it were live, compares the engine's top prediction against the actual match result, and stores the outcome in a local SQLite database.

## 2. Database Schema
Create a new table `backtest_results` in Turso/SQLite:
- `fixture_id` (INTEGER, Primary Key)
- `league_id` (INTEGER)
- `season` (INTEGER)
- `match_date` (TEXT)
- `home_team` (TEXT)
- `away_team` (TEXT)
- `predicted_script` (TEXT) - e.g., 'tight_low_event'
- `top_prediction` (TEXT) - e.g., 'over_2_5'
- `confidence_score` (REAL) - e.g., 0.65
- `actual_result` (TEXT) - 'WON', 'LOST', 'VOID'
- `home_goals` (INTEGER)
- `away_goals` (INTEGER)

## 3. CLI Backtest Runner (`src/scripts/runBacktest.js`)
A Node.js script intended to be run manually via terminal.

**Command:**
`node src/scripts/runBacktest.js --league=<id> --season=<year>`

**Flow:**
1. Fetch all finished matches for the specified league/season from the BSD API.
2. Query the local `backtest_results` table to identify matches that haven't been tested yet.
3. For each new match:
   - Fetch historical pre-match data (form, H2H, standings *at the time* if possible, or use standard enrichment logic adapted for past dates).
   - Generate the feature vector.
   - Run the prediction pipeline (`classifyMatchScript`, `estimateExpectedGoals`, `scoreMarketCandidates`).
   - Extract the top recommended market.
   - Evaluate the top market against the actual `home_goals` and `away_goals` from the BSD response to determine if it 'WON' or 'LOST'.
   - Insert the record into `backtest_results`.
4. Implement pacing/rate-limiting to avoid hitting BSD API limits.

## 4. Frontend UI (`/track-record`)
A new public page accessible from the main navigation.

**Components:**
1. **Hero Stats:** 
   - Overall Hit Rate (%)
   - Total Matches Analyzed
2. **Performance by Market:** 
   - Grid/Cards showing win rates for Over 2.5, BTTS, 1X2, etc.
3. **Performance by League:** 
   - Filterable view to show accuracy across different leagues.
4. **Recent Results Feed:** 
   - A scrolling list of the 50 most recently backtested matches, showing the teams, the engine's prediction, the confidence score, the final scoreline, and a green 'WON' or red 'LOST' badge.

## 5. API Endpoints
Create a new route file `src/api/trackRecordRoutes.js`:
- `GET /api/track-record/stats`: Returns aggregated hit rates (overall, by market, by league).
- `GET /api/track-record/recent`: Returns the latest 50 entries from `backtest_results`.