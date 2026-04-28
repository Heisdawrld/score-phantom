# Phase 3 — ROI/Yield-First Policy (Minimal ROI Layer) (Implementation Spec)

## Objective
Primary objective: maximize long-run ROI / yield (units won per unit staked).

Secondary guardrails:
- Priced markets only (never headline unsupported/unpriced markets).
- Default headline minimum odds floor: 1.50+.
- Below 1.50 allowed only when stacked evidence is very high, edge is real, volatility is low, and no contradiction flags.
- Confidence labels must not outrun empirically calibrated win rates (future phase after measurement exists).

## Why This Phase Exists
The current system can report hit rate, but cannot judge ROI/yield honestly because outcomes do not store pick-time odds. Without preserving the exact price the engine saw at recommendation time, we cannot:
- compute profit units accurately,
- compare “67% at better odds” vs “72% at short odds”,
- tune aggressiveness policy against a real scoreboard.

This phase builds the scoreboard first. It does not yet change market selection behavior beyond storing the evidence and reporting.

## Scope
In-scope (Phase 3A — Minimal ROI Layer):
1. Extend outcomes persistence to store pick-time odds and compute profit_units (flat 1-unit staking).
2. Add a market calibration report script that outputs yield and supporting breakdowns.
3. Add an admin-facing endpoint (optional but recommended) to view ROI/yield breakdowns without manual script runs.

Out-of-scope (deferred until after ROI report exists):
- Market-specific evidence gates.
- Stacked-evidence scoring.
- Market-specific odds floors.
- Promotion ladder (PASS/PLAYABLE/TIP/STRONG).

## Definitions
- stake_units: always `1.0` for Phase 3A.
- profit_units:
  - win: `decimal_odds - 1`
  - loss: `-1`
  - void: `0`
- yield_pct: `100 * SUM(profit_units) / NULLIF(SUM(stake_units), 0)`

## Current Baseline (Relevant Files)
- Outcomes table + accuracy stats: `src/storage/backtesting.js`
- Outcome settlement: `src/services/resultChecker.js`
- Odds snapshot storage: `fixture_odds` (schema in `src/config/database.js`; loaded via `src/services/predictionCache.js`)
- Prediction storage includes edge + implied prob: `src/storage/savePrediction.js`
- Market odds mapping to candidates: `src/markets/computeImpliedProbabilities.js`

## Deliverables

### D0. Immutable pick snapshot + provenance (required for honest ROI)
ROI/yield reporting requires two integrity guarantees:
1. Pick-time odds must be immutable (cannot drift due to cache rebuilds).
2. ROI must exclude post-match backfills by default.

To satisfy both, Phase 3 introduces an append-only pick snapshot table and explicit provenance.

**New table: prediction_picks (append-only)**
- One row per headline recommendation generation.
- Never updated (insert-only), and inserted only when the headline pick materially changes (to avoid noise).
- Settlement and ROI/yield reporting use this table as the canonical source of pick-time odds.

**Required fields**
- `id SERIAL PRIMARY KEY`
- `fixture_id TEXT NOT NULL`
- `engine_version TEXT NOT NULL`
- `prediction_source TEXT NOT NULL` (allowed values: `pre_match`, `post_match_backfill`, `manual`)
- `generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `kickoff_at TIMESTAMP` (from fixtures.match_date at generation time; stored to avoid later drift)
- `market_key TEXT NOT NULL`
- `selection TEXT NOT NULL`
- `bookmaker_odds REAL`
- `implied_probability REAL`
- `edge REAL`
- `model_probability REAL`
- `phantom_score REAL` (optional; if available cheaply)
- `volatility_score REAL` (optional)

**Provenance rule (hard guard)**
- `prediction_source = 'pre_match'` and `generated_at < kickoff_at` defines the canonical ROI cohort.
- Any pick where this is false must be excluded from ROI/yield default reporting.

**Acceptance criteria**
- Every ROI row in `prediction_outcomes` can be traced to exactly one immutable pick snapshot row via `pick_id`.
- ROI/yield report defaults to pre-match-only and cannot silently include post-match backfills.

- There is no “rebuild spam”: repeated engine rebuilds that do not materially change the headline pick do not create new `prediction_picks` rows.

**Material change definition (insert rule)**
Insert a new `prediction_picks` row if any of the following changed vs the latest snapshot for the same fixture and `prediction_source`:
- `market_key` changed, or
- `selection` changed, or
- `bookmaker_odds` changed, or
- (optional) `model_probability` or `phantom_score` changed beyond a small threshold (define later if needed).

Canonical settlement/reporting rule:
- Settle and report against the latest valid `pre_match` snapshot before kickoff, from the meaningful-change snapshots only.

### D1. Extend prediction_outcomes to store pick-time odds + profit units
**Files to change**
- `src/storage/backtesting.js` (table schema + saveOutcome)
- `src/services/resultChecker.js` (if it writes outcomes directly, keep schema consistent)
- `src/config/database.js` (if centralizing schema creation is preferred)

**Schema changes (prediction_outcomes)**
Add columns:
- `pick_id INTEGER` (references `prediction_picks.id`)
- `best_pick_odds REAL`
- `stake_units REAL DEFAULT 1`
- `profit_units REAL`
- `result_status TEXT` (one of: `win`, `loss`, `void`)
- `engine_version TEXT` (optional but recommended for analysis)
- `league_name TEXT` (optional; if not stored, joinable via fixtures)

Keep existing:
- `predicted_market`, `predicted_selection`, `predicted_probability`, `model_confidence`, `outcome`

**Behavior change**
- At prediction time, persist an immutable pick snapshot row in `prediction_picks` with the exact odds the engine saw.
- On settlement, look up the correct pick snapshot (by `pick_id` stored with the prediction, or by selecting the latest valid pre-match pick if multiple exist) and compute outcome from that snapshot.
- On settlement, store:
  - `pick_id = prediction_picks.id`
  - `best_pick_odds = prediction_picks.bookmaker_odds`
  - `stake_units = 1`
  - `profit_units = best_pick_odds - 1` on win, `-1` on loss, `0` on void
  - `result_status` derived from evaluation outcome mapping

**Acceptance criteria**
- Any settled fixture in `prediction_outcomes` has non-null `best_pick_odds` when the pick was priced at recommendation time.
- `profit_units` is present and consistent with `result_status`.
- Legacy rows (without odds) remain queryable; ROI reporting treats missing odds conservatively (excluded or reported separately).

**Risks**
- Odds may be null for some historical predictions. Mitigation: handle null as “unpriced” and exclude from ROI/yield calculations; still include in hit rate.

### D2. Persist pick-time odds reliably (do not reconstruct later)
**Files to change**
- `src/storage/savePrediction.js` (ensure the prediction record stores a stable `pick_id` and does not rely on mutable fields for ROI)
- Prediction generation path (where the headline pick is determined) to insert the `prediction_picks` row and capture its `id`

**Behavior change**
- Store the exact `bp.bookmakerOdds` used at generation time in `prediction_picks`.
- Store the `pick_id` linkage on the persisted prediction record so settlement can always settle the intended snapshot.

**Acceptance criteria**
- For any prediction with `best_pick_edge` populated, there exists a corresponding `prediction_picks` row with non-null `bookmaker_odds`.
- Settlement never needs to re-derive odds from `fixture_odds` for ROI computation.

### D3. marketCalibrationReport.js (ROI scoreboard)
**New file**
- `src/scripts/marketCalibrationReport.js`

**Inputs**
- Pull from `prediction_outcomes` joined to `prediction_picks` (and fixtures if needed for league names).

**Outputs (minimum)**
For each bucket:
- total picks
- win rate
- average odds
- total profit_units
- yield_pct

Buckets:
- by market (predicted_market)
- by league (tournament/league_name)
- by confidence band (model_confidence; optionally add phantom score band later)
- by odds band (e.g., 1.50–1.69, 1.70–1.99, 2.00+)

**Default filter (must)**
- ROI/yield report defaults to:
  - `prediction_picks.prediction_source = 'pre_match'`
  - `prediction_picks.generated_at < prediction_picks.kickoff_at`

**Optional expanded views**
- Hit-rate-only views may include non-pre-match rows, but must label them clearly by `prediction_source`.

**Acceptance criteria**
- Script runs locally with DATABASE_URL configured and prints a readable table or JSON.
- We can identify which market families caused hit rate drop and whether they improved yield.

### D4 (Optional). Admin endpoint for ROI stats
**Files to change**
- `src/api/adminRoutes.js`
- `src/storage/backtesting.js` (add `getRoiStats()` helper)

**Acceptance criteria**
- Admin can request ROI breakdowns without shell access.

## Guardrail: 1.50+ headline floor (Phase 3B placeholder)
Phase 3A stores the scoreboard. The 1.50+ headline floor is a selection policy change and should be implemented after ROI reporting exists and is verified.

Implementation will likely touch:
- `src/engine/selectBestPickOrAbstain.js`
- `src/markets/marketRegistry.js` (per-market floors later)

## Test Plan
- Unit test for profit computation helper (win/loss/void mapping).
- Integration smoke:
  - Create a synthetic outcome row with odds and verify yield query outputs expected totals.
- Node syntax checks for touched files.

## Definition of Done
- Outcomes store pick-time odds and profit_units for newly settled fixtures.
- A calibration report exists and can output yield/hit-rate/avg-odds breakdowns.
- The project can now be judged by ROI/yield rather than hit rate alone.
