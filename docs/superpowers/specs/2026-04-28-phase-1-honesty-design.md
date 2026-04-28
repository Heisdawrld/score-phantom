# Phase 1 — Engine Honesty (Implementation Spec)

## Goal
Make the prediction engine’s *inputs* and *headline outputs* truthful and mechanically verifiable:

1. Live meta must be authoritative (fresh enrichment must win over stale DB meta).
2. Headline picks must be restricted to markets that are actually priced/supported (no “headline” picks without real bookmaker odds).
3. Any product-facing “shaping” must not mutate modeling truth.

Non-goals (explicitly deferred to later phases):
- Improving football intelligence depth (learned models, mispricing detector, calibration reports).
- Expanding odds coverage to new market families (double chance, DNB, team totals, win either half) unless already reliably priced by the odds source.

## Current State (Baseline)
- The engine pipeline is gate → candidates → implied probabilities → score → prune → rank → select/abstain via:
  - [runPredictionEngine.js](file:///workspace/src/engine/runPredictionEngine.js)
  - [runMarketSelection.js](file:///workspace/src/engine/runMarketSelection.js)
- Canonical candidates are generated in [buildMarketCandidates.js](file:///workspace/src/markets/buildMarketCandidates.js).
- Implied probability/edge is computed in [computeImpliedProbabilities.js](file:///workspace/src/markets/computeImpliedProbabilities.js) from `oddsSnapshot` with a fallback to `features.advancedOdds`.
- “Script” logic is currently sourced from archive imports:
  - [preparePredictionContext.js](file:///workspace/src/engine/preparePredictionContext.js)
  - [runProbabilityPipeline.js](file:///workspace/src/engine/runProbabilityPipeline.js)

## Deliverables
### D1. Live meta override is authoritative end-to-end
**Files to change**
- [preparePredictionContext.js](file:///workspace/src/engine/preparePredictionContext.js)
- [buildFeatureVector.js](file:///workspace/src/features/buildFeatureVector.js)
- (If needed based on observed data flow) [predictionCache.js](file:///workspace/src/services/predictionCache.js)

**Behavior change**
- Ensure `rawData.meta` (freshly enriched meta) is passed as `metaOverride` into `buildFeatureVector()` from `preparePredictionContext()`.
- Ensure `buildFeatureVector()` uses `metaOverride || dbMeta || {}`.
- Ensure any “live” enrichment injection (injuries, predicted lineups, BSD prediction, best odds) is present in `rawData.meta` at the time the engine is invoked, so that the override path is not a no-op.

**Acceptance criteria**
- For any engine invocation where `rawData.meta` contains `unavailable_players` and/or `predicted_lineup`, the resulting flattened features must reflect those values even if the DB meta is stale.
- A “meta override” smoke test proves that a synthetic `rawData.meta` field is observable in the final flattened feature vector (or in `engineResult.features` where exposed).

**Test plan**
- Add a minimal unit/integration test harness that calls `preparePredictionContext()` with:
  - a stub `rawData.meta` containing sentinel values (e.g., `unavailable_players.home[0].player.id = 123`, `predicted_lineup` present),
  - and asserts the flattened vector contains expected derived fields (e.g., injury/lineup derived features) or at least preserves the meta-derived features that are meant to flow.
- Run `node --check` on the touched files.

**Risks**
- Risk: if `ensureFixtureData()` or the calling API path does not supply `rawData.meta` consistently, the override path will be correct but still unused. Mitigation: validate the call chain that invokes `preparePredictionContext()` always passes the enriched raw object.

### D2. Headline pick gating: no headline pick without real odds support
**Core principle**
If a candidate market is not priced (no `bookmakerOdds` and no reliable implied probability), it cannot be the *headline* recommendation. It may remain as a backup pick (optional), but it cannot be surfaced as the primary pick that powers:
- `/results`
- `/track-record`
- match pages
- “Best Tip”, “Value Bet”, “Daily ACCA” blocks

**Files to change**
- [selectBestPickOrAbstain.js](file:///workspace/src/engine/selectBestPickOrAbstain.js)
- [computeImpliedProbabilities.js](file:///workspace/src/markets/computeImpliedProbabilities.js)
- [responseAdapter.js](file:///workspace/src/api/responseAdapter.js)

**Behavior change**
1. Extend candidate metadata to carry a normalized “priced” signal.
   - Candidate is “priced” if:
     - `bookmakerOdds` is a valid decimal odds `> 1.0`, OR
     - `impliedProbability` is non-null and in `(0,1)` and is derived from a reliable odds source.
2. In `selectBestPickOrAbstain`, enforce a “headline eligible” filter:
   - Default: only candidates with `priced === true` can be selected as `bestPick`.
   - If no priced candidates remain above minimum thresholds, abstain with a new explicit code (e.g., `NO_PRICED_MARKETS`) or reuse an existing abstain mechanism if already present.
3. Preserve backups:
   - Ranked candidates may still contain unpriced markets, but they must not become `bestPick`.
4. Response adapter must not misrepresent:
   - If `bestPick` is absent due to “no priced markets”, the API response must clearly communicate abstain/no-safe-pick semantics (no misleading “pick” string).

**Acceptance criteria**
- If all available candidates have `bookmakerOdds == null`, the engine must abstain rather than selecting an unpriced niche market.
- For a match with only partial odds (e.g., 1X2 exists, no team totals), the engine may still produce a headline pick, but only from priced markets.

**Test plan**
- Add a deterministic unit test around `selectBestPickOrAbstain`:
  - Provide a ranked candidate list where the top-scoring candidate is unpriced but a lower candidate is priced; confirm the priced candidate is chosen.
  - Provide a ranked list with no priced candidates; confirm abstain/no-safe-pick path is returned with correct code.
- Integration smoke: run engine on a fixture dataset with missing odds snapshot and verify abstain is emitted and UI does not claim a pick.

**Risks**
- Risk: This change may reduce the number of headline picks, especially for leagues/fixtures where odds ingestion is incomplete. Mitigation: surface a clear abstain reason and prioritize improving odds ingestion in Phase 3.

### D3. Remove/contain “probability shaping” from core modeling truth (Phase 1 subset)
Phase 1 does not require full refactor, but it does require that “truth” is not silently mutated in the modeling layer.

**Files to change**
- [buildMarketCandidates.js](file:///workspace/src/markets/buildMarketCandidates.js) (target: remove candidate-level cap)
- [responseAdapter.js](file:///workspace/src/api/responseAdapter.js) (target: apply display-only capping)

**Behavior change**
- Replace any candidate-level probability cap (e.g., `MAX_MODEL_PROBABILITY`) with:
  - storing raw probabilities internally,
  - applying optional display caps only in the response adapter.

**Acceptance criteria**
- Engine output retains raw probability values (even if extreme).
- Adapter may cap probabilities for UI credibility, but raw probabilities remain available in the engine result for auditing/backtesting.

**Test plan**
- Unit test candidate creation vs response formatting:
  - candidate modelProbability remains unchanged,
  - responseAdapter caps the percentage returned to UI if needed.

**Risks**
- Risk: Some UI components may assume probabilities never exceed a threshold. Mitigation: only cap at adapter boundary while keeping raw available.

## Rollout / Migration
No automatic destructive migration is required for Phase 1, but this phase should be deployed before any result backfills so that new outcomes are not computed from unpriced headline picks.

## Definition of Done
- Live meta override is proven to be used when present.
- Engine cannot emit a headline pick for an unpriced market.
- No modeling truth is silently capped in candidate generation (display-only shaping is explicitly isolated at the adapter boundary).

