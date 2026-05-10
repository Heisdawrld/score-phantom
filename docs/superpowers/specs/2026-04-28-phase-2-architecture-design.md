# Phase 2 — Engine Architecture (Implementation Spec)

## Goal
Stabilize the engine by removing structural smells and separating responsibilities so that later “intelligence upgrades” are safe and measurable.

This phase is about architecture correctness, not adding new modeling power.

## Deliverables

### D1. Promote script logic to first-class modules (remove archive dependency)
**Problem**
Core runtime logic imports script functions from `src/scripts/archive/*`, which is a maintenance smell and makes it difficult to evolve the script layer.

**Files to change**
- Create:
  - `src/scripts/classifyMatchScript.js`
  - `src/scripts/refineScriptPostXg.js`
- Update imports:
  - `src/engine/preparePredictionContext.js`
  - `src/engine/runProbabilityPipeline.js`
  - `src/api/routes.js` (simulation paths use script logic)
- Remove or deprecate:
  - `src/scripts/archive/classifyMatchScript.js`
  - `src/scripts/archive/refineScriptPostXg.js`

**Behavior change**
- No intended behavior change initially: Phase 2 moves files and import paths only.
- The exported API (function name/signature) must remain identical so downstream code behavior is unchanged.

**Acceptance criteria**
- There are no imports from `src/scripts/archive/*` in runtime code paths.
- Engine output is identical for a representative fixture set (within floating rounding tolerance).

**Test plan**
- Static checks:
  - `node --check` on moved modules and updated importers.
  - Grep to confirm no archive imports remain in non-archive code paths.
- Behavioral smoke:
  - Run a prediction on a known fixture before/after and diff: script.primary/secondary/confidence should match.

**Risks**
- Risk: Hidden consumers (scripts/tests) may still import from archive paths. Mitigation: update all importers or provide temporary re-export shims if needed.

### D2. Separate “raw model truth” from UI/product shaping
**Problem**
Some logic that is purely “presentation credibility” (caps, display labels, product constraints) currently influences internal candidate generation/scoring. This blends concerns and makes backtesting/accuracy calibration less trustworthy.

**Files to change**
- `src/markets/buildMarketCandidates.js`
- `src/api/responseAdapter.js`
- Potentially (depending on where shaping logic lives):
  - `src/engine/finalizePredictionResult.js`

**Behavior change**
- Engine should emit:
  - raw model probabilities (no UI caps),
  - raw selection/marketKey,
  - raw component scores (see D3).
- Adapter should be the only place where:
  - display caps are applied,
  - labels like “Raw Model:” are presented,
  - any non-auditable “credibility shaping” occurs.

**Acceptance criteria**
- Raw engine results can be stored and backtested without hidden shaping.
- UI remains stable and does not break due to higher raw probabilities.

**Test plan**
- Unit test adapter formatting:
  - input: engineResult with rawProbability > 0.90,
  - output: capped display (if product requires it) but raw remains accessible in response payload fields intended for audit/debug.

**Risks**
- Risk: some UI components might currently rely on the cap to avoid layout/label issues. Mitigation: ensure adapter output remains within UI expectations.

### D3. Split market scoring into inspectable components (truth vs taste)
**Problem**
`scoreMarketCandidates` blends:
- football/model confidence,
- market edge/odds value,
- structural/product penalties (market type dislikes),
making it hard to explain why a market won.

**Files to change**
- `src/markets/scoreMarketCandidates.js`
- (Optional if needed for UI exposure) `src/api/responseAdapter.js`

**Behavior change**
Refactor scoring to compute and attach explicit components to each candidate:
- `modelScore` (probability/confidence driven)
- `marketEdgeScore` (implied probability vs model probability)
- `tacticalFitScore` (script/tactical match)
- `riskPenaltyScore` (volatility/chaos/data starvation)
- `productPenaltyScore` (market-type preference steering)
- `finalScore` = weighted sum of the above

The intent is not to change the final pick yet, but to make the reason *observable*.

**Acceptance criteria**
- Every scored candidate includes the component fields above (or a close agreed schema).
- Operators can tell whether a pick lost due to:
  - weak football truth,
  - bad odds,
  - or product taste.

**Test plan**
- Unit tests for scoring:
  - candidate with strong edge but high chaos shows `marketEdgeScore` high and `riskPenaltyScore` high (penalizing finalScore).
- Snapshot test of candidate object shape (keys present).

**Risks**
- Risk: Some downstream code assumes candidate objects only contain known fields. Mitigation: additive fields only (no breaking changes), keep existing field names intact.

### D4. Introduce a single market registry (source of truth)
**Problem**
Market support rules are scattered: candidate generation, implied odds mapping, pruning, UI mapping.

**Files to change**
- Create:
  - `src/markets/marketRegistry.js`
- Update:
  - `src/markets/buildMarketCandidates.js`
  - `src/markets/computeImpliedProbabilities.js`
  - `src/engine/pruneWeakCandidates.js`
  - `src/engine/selectBestPickOrAbstain.js`
  - `src/api/responseAdapter.js`

**Behavior change**
Add a single shared registry object:
```js
export const MARKET_REGISTRY = {
  home_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  away_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  draw:     { selectable: true, requiresOdds: true, headlineEligible: true },
  over_25:  { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_yes: { selectable: true, requiresOdds: true, headlineEligible: true },
  double_chance_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  // ...
};
```
Phase 2 uses this registry to centralize “what is selectable/headline-eligible” without expanding new odds support yet.

**Acceptance criteria**
- There is exactly one place to change “headline eligibility”.
- Engine selection and UI naming agree on the same marketKey universe.

**Test plan**
- Unit test: registry-driven filter is applied in headline selection.
- Lint/syntax checks for the new module.

**Risks**
- Risk: Introducing registry could be partially adopted and create drift. Mitigation: update all call sites listed above in one PR and treat it as an atomic refactor.

## Definition of Done
- No runtime imports from archive script modules.
- Model truth is clearly separated from display shaping.
- Market scoring is explainable via explicit component fields.
- Market support rules are centralized via `marketRegistry.js`.
