# Phase 3A — Minimal ROI Layer (Implementation Plan)

Based on the approved spec: `docs/superpowers/specs/2026-04-28-phase-3-roi-yield-policy-design.md` (latest: `b89e28a`).

This plan is intentionally split into two PRs:
1. PR1: schema + snapshot writes (truth layer)
2. PR2: settlement + ROI report (consumes truth)

Two required refinements are applied:
- `kickoff_at` is stored in a normalized UTC timestamp form.
- Do not create `prediction_picks` rows for `noSafePick` / abstain outcomes.

## PR1 — Schema + Snapshot Writes (prediction_picks)

### Goal
Create a trustworthy immutable pick snapshot layer:
- append-only `prediction_picks`
- insert only on material headline change
- stable provenance + normalized timestamps
- no snapshots for abstains

### Files to Change (Exact)
- Create: `src/storage/predictionPicks.js`
- Update: `src/config/database.js` (table creation + indexes)
- Update: `src/services/predictionCache.js` (write snapshots from the prediction generation path)
- Update (optional): `src/storage/savePrediction.js` (store `pick_id` on `predictions_v2` as convenience-only metadata)

### Behavior Changes (Exact)
1. Create `prediction_picks` table with:
   - `id SERIAL PRIMARY KEY`
   - `fixture_id TEXT NOT NULL`
   - `engine_version TEXT NOT NULL`
   - `prediction_source TEXT NOT NULL` (`pre_match|post_match_backfill|manual`)
   - `generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
   - `kickoff_at TIMESTAMPTZ` (normalized UTC)
   - `market_key TEXT NOT NULL`
   - `selection TEXT NOT NULL`
   - `bookmaker_odds REAL`
   - `implied_probability REAL`
   - `edge REAL`
   - `model_probability REAL`
   - optional: `phantom_score REAL`, `volatility_score REAL`

2. Snapshot insertion point:
   - In `predictionCache` immediately after a prediction is generated and persisted, and only if:
     - `noSafePick !== true`
     - `bestPick` exists

3. Normalize kickoff_at:
   - Read `fixtures.match_date` from DB.
   - Convert to a JS Date and store as UTC timestamp (TIMESTAMPTZ).
   - If kickoff cannot be parsed, store null and set `prediction_source` conservatively (`post_match_backfill`) to keep ROI filter safe.

4. Derive prediction_source:
   - `pre_match` if `kickoff_at` exists and `generated_at < kickoff_at`
   - otherwise `post_match_backfill`
   - `manual` reserved for later admin tools

5. Material-change dedupe:
   - Query latest pick snapshot for the same `(fixture_id, prediction_source)`.
   - Insert only if any of these changed:
     - `market_key`
     - `selection`
     - `bookmaker_odds`
   - Do not dedupe only on market/selection; odds changes must create a new snapshot.

6. Optional convenience linkage:
   - Add `pick_id` column to `predictions_v2` and store the latest inserted snapshot id.
   - This is convenience-only and never treated as settlement truth.

### Risks
- Time parsing drift (string timestamps). Mitigation: store as TIMESTAMPTZ and always treat as UTC.
- Duplicate inserts under concurrency. Mitigation: add a simple dedupe query + insert in a single transaction where possible.

### Test Plan
- Unit-like test for dedupe comparator (no DB): compare two pick objects and verify “material change” logic.
- DB integration smoke (requires DATABASE_URL):
  - Generate prediction twice with same pick => 1 row
  - Generate prediction with odds changed => 2 rows
- Node syntax checks: `node --check` for touched modules.

### Acceptance Criteria
- No snapshots are created for abstains (`noSafePick`).
- Rebuild spam does not create extra snapshots unless pick/odds changed.
- Every snapshot has normalized `generated_at` and `kickoff_at` semantics usable by ROI filters.

---

## PR2 — Settlement + ROI Report (prediction_outcomes consumes prediction_picks)

### Goal
Settle outcomes against immutable pick snapshots and produce an ROI/yield scoreboard.

### Files to Change (Exact)
- Update: `src/storage/backtesting.js` (schema extensions + ROI queries)
- Update: `src/services/resultChecker.js` (settlement uses canonical snapshot)
- Create: `src/scripts/marketCalibrationReport.js`
- Optional: `src/api/adminRoutes.js` (ROI stats endpoint)

### Behavior Changes (Exact)
1. Extend `prediction_outcomes` table:
   - Add: `pick_id INTEGER`
   - Add: `best_pick_odds REAL`
   - Add: `stake_units REAL DEFAULT 1`
   - Add: `profit_units REAL`
   - Add: `result_status TEXT` (`win|loss|void`)
   - Optional: `engine_version TEXT`, `league_name TEXT`

2. Canonical snapshot selection for settlement:
   - For fixtureId, select:
     - latest `prediction_picks` where:
       - `prediction_source='pre_match'`
       - `generated_at < kickoff_at`
     - ordered by `generated_at DESC`
     - limit 1

3. Profit settlement (1 unit model):
   - win: `profit_units = odds - 1`
   - loss: `profit_units = -1`
   - void: `profit_units = 0`
   - If `bookmaker_odds` is null, set `profit_units` null and exclude from ROI computations.

4. ROI report defaults (must):
   - `prediction_source='pre_match' AND generated_at < kickoff_at`
   - Buckets:
     - by market
     - by league
     - by confidence band
     - by odds band
   - Outputs:
     - picks, win rate, avg odds, total profit_units, yield_pct

5. Optional admin endpoint:
   - Expose ROI breakdowns with the same default filter.

### Risks
- Low sample sizes in ROI cohort early on. Mitigation: report counts and include an “excluded rows” section (missing odds, missing kickoff_at, non-pre_match).
- Post-match backfill pollution. Mitigation: hard default filter.

### Test Plan
- Unit test profit calculation helper (win/loss/void).
- DB integration smoke:
  - Insert synthetic snapshot+outcome and verify yield query.
- Node syntax checks: `node --check` for touched modules.

### Acceptance Criteria
- ROI/yield report defaults to pre-match-only and cannot silently include backfills.
- `prediction_outcomes` rows created with `pick_id` correctly reference `prediction_picks`.
- `profit_units` matches spec formulas exactly.

