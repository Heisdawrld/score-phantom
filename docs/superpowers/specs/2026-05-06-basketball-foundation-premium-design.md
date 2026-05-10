Phase 1-3 Design: Basketball Foundation + Premium Sport Shell

Date: 2026-05-06
Branch intent: `codex/basketball-foundation-premium`

Objective
ScorePhantom should support basketball as a first-class sport without weakening football. Users should land in a premium, stable product where football remains the default home experience, basketball predictions actually appear, basketball and football track records stay separate, and the admin workflow can operate within strict provider quotas.

Current Context
- Basketball already exists in the repo across `src/basketball/*` and `client/src/pages/Basketball*.tsx`.
- Basketball prediction generation currently depends on data already being synced and odds already being present.
- Basketball provider limits are tight:
  - API-SPORTS Basketball: 100 requests/day
  - The Odds API: 500 requests/month
- Football settlement and ROI work already exist and should not be destabilized while adding basketball support.
- The UI has started a premium-shell direction on `origin/main`, but the experience is still uneven across landing, app shell, user pages, and admin flows.

Approaches Considered

1. Frontend-first basketball launch
- Ship a polished basketball UI immediately and rely on manual admin syncs until the data layer matures.
- Pros: fast visual progress.
- Cons: users still see empty predictions, stale games, and inconsistent odds.

2. Data-foundation-first, then UI polish
- Make basketball sync, caching, prediction availability, and sport separation reliable first; then layer premium UI on top.
- Pros: users see real picks, admin workload drops, football stays protected.
- Cons: visual overhaul lands slightly later.

3. Full multi-sport rewrite now
- Refactor football and basketball into a generalized sport platform before fixing current product issues.
- Pros: clean long-term abstraction.
- Cons: too much risk and delay for current product stage.

Recommendation
Choose approach 2. It is the safest path that still produces visible progress quickly. Basketball becomes dependable first, then the premium shell can be applied once the underlying sport routes and caches behave predictably.

Design

Phase 1: Basketball Availability
Goal: basketball predictions should show reliably for supported leagues without burning quota recklessly.

Scope
- Keep football as the default app entry sport.
- Treat basketball as a major secondary tab with its own reliable cache and prediction cadence.
- Support up to 15 curated leagues, but operate with a tiered sync policy:
  - Tier A: NBA, WNBA, EuroLeague, NCAAB, NCAAW when available
  - Tier B: the next strongest 10 leagues from the current curated API-SPORTS set
- Use API-SPORTS as the primary fixture source for supported leagues.
- Use The Odds API as a selective odds enrichment source, not a blanket fetch layer.

Behavior
- User-facing basketball pages must read mostly from cached DB state, not build the slate expensively on request.
- Prediction generation should happen in bounded batches on admin/manual sync and lightweight background refresh, then serve cached picks to users.
- If a game exists without usable lines, the UI must show an honest "line unavailable" state rather than a broken or empty prediction card.
- Basketball best-picks and detail pages should prefer cached predictions and only rebuild on-demand for a single game when the cache is missing or stale.

Quota Policy
- API-SPORTS requests are reserved for fixture/game truth and selected-league refreshes.
- The Odds API should focus on leagues with realistic odds coverage and skip known thin leagues unless specifically requested.
- Sync windows stay short by default:
  - API-SPORTS: today + tomorrow
  - Odds enrichment: high-priority upcoming slate only

Phase 2: Sport-Separated Truth
Goal: football and basketball outcomes, track record, and ROI views must never pollute each other.

Scope
- Keep a strict `sport_key` boundary in outcomes, track record, and reporting routes.
- Basketball gets its own result-settlement path and recent-results view.
- Existing football backtest and prediction outcome flows remain intact.

Behavior
- Track record endpoints must return football-only or basketball-only datasets based on explicit sport selection.
- Basketball should not reuse football-only historical tables in ways that blend public stats.
- ROI and confidence reporting for football remain governed by the existing snapshot integrity work.
- Basketball track record may begin with simpler hit-rate views if full ROI settlement is not yet available, but the API contract must already be sport-separated.

Phase 3: Premium Sport Shell
Goal: once data is trustworthy, the product shell should feel premium across the whole user journey.

Scope
- Upgrade landing, auth, app shell, profile, basketball pages, football pages, and `/admin`.
- Keep admin standalone at `/admin`; do not surface admin navigation inside the main user app.
- Wire every CTA to a real route, state transition, or action.

Behavior
- Football remains the automatic first view for logged-in users.
- Basketball is presented as a polished adjacent vertical, not a takeover of the football identity.
- Shared shell components should support both sports cleanly:
  - premium header
  - sport switcher
  - hero/card system
  - trust states, empty states, and upgrade states
- Sport-specific pages may diverge visually where useful, but must still feel like one product family.

Architecture Boundaries
- `src/engine/*` remains football-specific unless explicitly generalized.
- `src/basketball/*` remains basketball-specific.
- Shared product-shell code belongs in shared frontend components and shared API helpers, not in mixed sport business logic files.
- Track-record and account endpoints may be shared, but every sport-sensitive query must filter by `sport_key`.

Success Criteria
- Basketball best-picks returns cached predictions for supported leagues without serially predicting a whole slate on each request.
- Basketball detail pages show either a real prediction or a clear no-lines state.
- Football and basketball track record queries are separated by sport.
- The app builds successfully after the changes.
- Premium UI work does not break login, landing, profile, football, basketball, or admin navigation.

Out of Scope For This Cycle
- Full generalized multi-sport engine abstraction.
- Player-prop basketball engine.
- Closing-line value or bankroll staking for basketball.
- A merged football+basketball public record page with blended stats.

Implementation Order
1. Basketball sync/prediction/cache reliability
2. Sport-separated track record truth
3. Premium shell and CTA wiring

Risks
- Over-fetching low-value basketball leagues can waste daily quota.
- Rebuilding basketball predictions on request can create slow user routes.
- UI polish before data reliability can hide, not solve, empty-state problems.

Decision
Proceed with the three-phase path above, starting with Phase 1 and carrying changes on a clean branch from `origin/main`.
